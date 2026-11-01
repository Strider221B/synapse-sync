import { DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { Note } from '../models';
import type { GoogleDriveApiClient } from '../../api/google_drive_client';

export interface NoteManifestEntry {
  id: string;
  notebookId: string;
  title: string;
  contentFormat: Note['contentFormat'];
  sourceType: Note['sourceType'];
  sourceUrl?: string;
  googleDriveFileId?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  previewSnippet?: string;
}

export type PushNoteCallback = (note: Note) => Promise<void>;

/**
 * Manages lightweight note manifest synchronization and on-demand note body retrieval.
 */
export class NoteManifestSyncService {
  private static readonly _APP_FOLDER_NAME = 'SynapseSync';
  private static readonly _MANIFEST_FILE_NAME = 'notes_manifest.json';
  private static readonly _NOTES_FOLDER_NAME = 'notes';
  private static readonly _JSON_MIME = 'application/json';
  private static readonly _PREFIX_NOTE = 'note_';
  private static readonly _JSON_EXT = '.json';
  private static readonly _SNIPPET_LENGTH = 140;

  private readonly _databaseService: DatabaseService;
  private readonly _gdriveClient: GoogleDriveApiClient;
  private _appFolderId: string | null = null;
  private _notesFolderId: string | null = null;

  public constructor(databaseService: DatabaseService, googleDriveClient: GoogleDriveApiClient) {
    this._databaseService = databaseService;
    this._gdriveClient = googleDriveClient;
  }

  /**
   * Pushes the lightweight notes metadata manifest to Google Drive.
   */
  public async pushManifest(): Promise<void> {
    const db = await this._databaseService.getDB();
    const [allNotes, remoteEntries] = await Promise.all([
      db.getAll(DB_STORES.NOTES),
      this._loadRemoteManifestEntries(),
    ]);

    const queue = await db.getAll(DB_STORES.SYNC_QUEUE);
    const delSet = new Set(
      queue.filter((q) => q.entityType === 'note' && q.operation === 'delete').map((q) => q.entityId)
    );

    const mergedEntries = this._buildMergedEntries(allNotes, remoteEntries, delSet);
    const folderId = await this._getAppFolderId();
    await this._gdriveClient.saveFile(
      NoteManifestSyncService._MANIFEST_FILE_NAME,
      JSON.stringify(mergedEntries, null, 2),
      NoteManifestSyncService._JSON_MIME,
      folderId
    );
  }

  /**
   * Pulls note metadata from Google Drive manifest into local IndexedDB without full bodies.
   */
  public async pullNotes(pushLocalFn?: PushNoteCallback): Promise<number> {
    const folderId = await this._getAppFolderId();
    const file = await this._gdriveClient.findFileByName(NoteManifestSyncService._MANIFEST_FILE_NAME, folderId);
    if (!file) {
      return this._fallbackSynthesizeManifest(pushLocalFn);
    }

    const text = await this._gdriveClient.getFileText(file.id);
    const remoteEntries: NoteManifestEntry[] = JSON.parse(text);
    return this._applyManifestEntries(remoteEntries, pushLocalFn);
  }

  /**
   * Downloads the full body content for a specific note on-demand from Google Drive.
   */
  public async pullNoteBody(noteId: string): Promise<Note | null> {
    const folderId = await this._getNotesFolderId();
    const fileName = `${NoteManifestSyncService._PREFIX_NOTE}${noteId}${NoteManifestSyncService._JSON_EXT}`;
    const file = await this._gdriveClient.findFileByName(fileName, folderId);
    if (!file) return null;

    const text = await this._gdriveClient.getFileText(file.id);
    const remoteNote = JSON.parse(text) as Note;
    const db = await this._databaseService.getDB();
    const local = await db.get(DB_STORES.NOTES, noteId);

    const merged: Note = {
      ...(local ?? remoteNote),
      content: remoteNote.content,
      wordCount: remoteNote.wordCount || (local ? local.wordCount : 0),
      isSynced: true,
      isBodyLoaded: true,
    };
    await db.put(DB_STORES.NOTES, merged);
    return merged;
  }

  /**
   * Removes a note entry from the Google Drive manifest upon deletion.
   */
  public async deleteFromManifest(noteId: string): Promise<void> {
    const remoteEntries = await this._loadRemoteManifestEntries();
    const filtered = remoteEntries.filter((entry) => entry.id !== noteId);
    const folderId = await this._getAppFolderId();
    await this._gdriveClient.saveFile(
      NoteManifestSyncService._MANIFEST_FILE_NAME,
      JSON.stringify(filtered, null, 2),
      NoteManifestSyncService._JSON_MIME,
      folderId
    );
  }

  protected async _loadRemoteManifestEntries(): Promise<NoteManifestEntry[]> {
    try {
      const folderId = await this._getAppFolderId();
      const file = await this._gdriveClient.findFileByName(NoteManifestSyncService._MANIFEST_FILE_NAME, folderId);
      if (!file) return [];
      const text = await this._gdriveClient.getFileText(file.id);
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  protected _buildMergedEntries(
    localNotes: Note[],
    remoteEntries: NoteManifestEntry[],
    delSet: Set<string>
  ): NoteManifestEntry[] {
    const entryMap = new Map<string, NoteManifestEntry>();
    for (const remote of remoteEntries) {
      if (!delSet.has(remote.id)) entryMap.set(remote.id, remote);
    }
    for (const note of localNotes) {
      if (!delSet.has(note.id)) {
        entryMap.set(note.id, this._toManifestEntry(note));
      }
    }
    return Array.from(entryMap.values());
  }

  protected _toManifestEntry(note: Note): NoteManifestEntry {
    const snippet = note.previewSnippet || (note.content
      ? note.content.replace(/[#*`_>[\]]/g, '').trim().slice(0, NoteManifestSyncService._SNIPPET_LENGTH)
      : '');
    return {
      id: note.id,
      notebookId: note.notebookId,
      title: note.title,
      contentFormat: note.contentFormat,
      sourceType: note.sourceType,
      sourceUrl: note.sourceUrl,
      googleDriveFileId: note.googleDriveFileId,
      wordCount: note.wordCount,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      previewSnippet: snippet,
    };
  }

  private async _applyManifestEntries(
    remoteEntries: NoteManifestEntry[],
    pushLocalFn?: PushNoteCallback
  ): Promise<number> {
    const db = await this._databaseService.getDB();
    const allLocal = await db.getAll(DB_STORES.NOTES);
    const localMap = new Map(allLocal.map((n) => [n.id, n]));
    const remoteIdSet = new Set(remoteEntries.map((e) => e.id));
    let count = 0;

    for (const entry of remoteEntries) {
      const local = localMap.get(entry.id);
      count += await this._reconcileSingleEntry(entry, local, pushLocalFn);
    }

    if (pushLocalFn) {
      for (const localNote of allLocal) {
        if (!remoteIdSet.has(localNote.id)) await pushLocalFn(localNote);
      }
    }
    return count;
  }

  private async _reconcileSingleEntry(
    entry: NoteManifestEntry,
    local: Note | undefined,
    pushLocalFn?: PushNoteCallback
  ): Promise<number> {
    const db = await this._databaseService.getDB();
    if (!local) {
      await db.put(DB_STORES.NOTES, { ...entry, content: '', isSynced: true, isBodyLoaded: false });
      return 1;
    }
    if (new Date(entry.updatedAt) > new Date(local.updatedAt)) {
      await db.put(DB_STORES.NOTES, { ...local, ...entry, content: local.isBodyLoaded ? local.content : '', isSynced: true, isBodyLoaded: false });
      return 1;
    }
    if (pushLocalFn && new Date(local.updatedAt) > new Date(entry.updatedAt)) {
      await pushLocalFn(local);
    }
    return 0;
  }

  private async _fallbackSynthesizeManifest(pushLocalFn?: PushNoteCallback): Promise<number> {
    const folderId = await this._getNotesFolderId();
    const files = await this._gdriveClient.listAllFolderItems(folderId);
    const remoteEntries: NoteManifestEntry[] = [];

    for (const f of files) {
      if (!f.name.startsWith(NoteManifestSyncService._PREFIX_NOTE)) continue;
      try {
        const text = await this._gdriveClient.getFileText(f.id);
        const note = JSON.parse(text) as Note;
        remoteEntries.push(this._toManifestEntry(note));
      } catch {
        // Skip corrupted remote file
      }
    }

    if (remoteEntries.length > 0) {
      await this._gdriveClient.saveFile(
        NoteManifestSyncService._MANIFEST_FILE_NAME,
        JSON.stringify(remoteEntries, null, 2),
        NoteManifestSyncService._JSON_MIME,
        await this._getAppFolderId()
      );
    }
    return this._applyManifestEntries(remoteEntries, pushLocalFn);
  }

  private async _getAppFolderId(): Promise<string> {
    if (!this._appFolderId) {
      this._appFolderId = (await this._gdriveClient.getOrCreateFolder(NoteManifestSyncService._APP_FOLDER_NAME)).id;
    }
    return this._appFolderId;
  }

  private async _getNotesFolderId(): Promise<string> {
    if (!this._notesFolderId) {
      const folder = await this._gdriveClient.getOrCreateFolder(NoteManifestSyncService._NOTES_FOLDER_NAME, await this._getAppFolderId());
      this._notesFolderId = folder.id;
    }
    return this._notesFolderId;
  }
}

