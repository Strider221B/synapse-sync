import { DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { Note } from '../models';
import type { DriveItem, GoogleDriveApiClient } from '../../api/google_drive_client';

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
  order?: number;
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
  private static readonly _ENTITY_TYPE_NOTE = 'note';
  private static readonly _OP_DELETE = 'delete';

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
    const [allNotes, remoteEntries, delSet] = await Promise.all([
      db.getAll(DB_STORES.NOTES),
      this._loadRemoteManifestEntries(),
      this._getDeletedNoteIds(),
    ]);

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
    const delSet = await this._getDeletedNoteIds();
    const folderId = await this._getAppFolderId();
    const file = await this._gdriveClient.findFileByName(NoteManifestSyncService._MANIFEST_FILE_NAME, folderId);
    if (!file) {
      return this._fallbackSynthesizeManifest(pushLocalFn, delSet);
    }

    const text = await this._gdriveClient.getFileText(file.id);
    const remoteEntries: NoteManifestEntry[] = JSON.parse(text);
    const activeEntries = remoteEntries.filter((e) => !this._isDeleted(e.id, delSet));
    const reconciledEntries = await this._reconcileUnmanifestedNotes(activeEntries, delSet);
    return this._applyManifestEntries(reconciledEntries, pushLocalFn, delSet);
  }

  /**
   * Downloads the full body content for a specific note on-demand from Google Drive.
   */
  public async pullNoteBody(noteId: string): Promise<Note | null> {
    const folderId = await this._getNotesFolderId();
    const candidateNames = this._getCandidateNoteFileNames(noteId);
    let file: DriveItem | null = null;
    for (const name of candidateNames) {
      file = await this._gdriveClient.findFileByName(name, folderId);
      if (file) break;
    }
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
    const rawId = noteId.replace(/^note_+/, '');
    const remoteEntries = await this._loadRemoteManifestEntries();
    const filtered = remoteEntries.filter((entry) => {
      if (entry.id === noteId) return false;
      const entryRaw = entry.id.replace(/^note_+/, '');
      return entryRaw !== rawId;
    });
    const folderId = await this._getAppFolderId();
    await this._gdriveClient.saveFile(
      NoteManifestSyncService._MANIFEST_FILE_NAME,
      JSON.stringify(filtered, null, 2),
      NoteManifestSyncService._JSON_MIME,
      folderId
    );
  }

  /**
   * Deletes all remote file copies of a note and prunes it from the manifest.
   */
  public async deleteRemoteNoteFiles(noteId: string): Promise<void> {
    const folderId = await this._getNotesFolderId();
    const candidateNames = this._getCandidateNoteFileNames(noteId);
    for (const name of candidateNames) {
      const files = this._gdriveClient.findAllFilesByName
        ? await this._gdriveClient.findAllFilesByName(name, folderId)
        : (await this._gdriveClient.findFileByName(name, folderId).then((f) => (f ? [f] : [])));
      for (const f of files) {
        await this._gdriveClient.deleteFile(f.id);
      }
    }
    await this.deleteFromManifest(noteId);
  }

  protected async _getDeletedNoteIds(): Promise<Set<string>> {
    const db = await this._databaseService.getDB();
    const queue = await db.getAll(DB_STORES.SYNC_QUEUE);
    const ids = queue
      .filter((q) => q.entityType === NoteManifestSyncService._ENTITY_TYPE_NOTE && q.operation === NoteManifestSyncService._OP_DELETE)
      .map((q) => q.entityId);
    return new Set(ids);
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
      if (!this._isDeleted(remote.id, delSet)) entryMap.set(remote.id, remote);
    }
    for (const note of localNotes) {
      if (!this._isDeleted(note.id, delSet)) {
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
      order: note.order,
    };
  }

  private async _applyManifestEntries(
    remoteEntries: NoteManifestEntry[],
    pushLocalFn?: PushNoteCallback,
    delSet?: Set<string>
  ): Promise<number> {
    const db = await this._databaseService.getDB();
    const allLocal = await db.getAll(DB_STORES.NOTES);
    const localMap = new Map(allLocal.map((n) => [n.id, n]));
    const remoteIdSet = new Set(remoteEntries.map((e) => e.id));
    let count = 0;

    for (const entry of remoteEntries) {
      if (delSet && this._isDeleted(entry.id, delSet)) continue;
      const local = localMap.get(entry.id);
      count += await this._reconcileSingleEntry(entry, local, pushLocalFn);
    }

    if (pushLocalFn) {
      for (const localNote of allLocal) {
        if (!remoteIdSet.has(localNote.id) && (!delSet || !this._isDeleted(localNote.id, delSet))) {
          await pushLocalFn(localNote);
        }
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

  private async _fallbackSynthesizeManifest(
    pushLocalFn?: PushNoteCallback,
    delSet?: Set<string>
  ): Promise<number> {
    const folderId = await this._getNotesFolderId();
    const files = await this._gdriveClient.listAllFolderItems(folderId);
    const remoteEntries: NoteManifestEntry[] = [];

    for (const f of files) {
      if (!f.name.startsWith(NoteManifestSyncService._PREFIX_NOTE)) continue;
      try {
        const text = await this._gdriveClient.getFileText(f.id);
        const note = JSON.parse(text) as Note;
        if (delSet && note && note.id && this._isDeleted(note.id, delSet)) {
          void this._gdriveClient.deleteFile(f.id).catch(() => {});
          continue;
        }
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
    return this._applyManifestEntries(remoteEntries, pushLocalFn, delSet);
  }

  private async _reconcileUnmanifestedNotes(
    manifestEntries: NoteManifestEntry[],
    delSet: Set<string>
  ): Promise<NoteManifestEntry[]> {
    const folderId = await this._getNotesFolderId();
    const files = await this._gdriveClient.listAllFolderItems(folderId);
    const manifestIdSet = new Set(manifestEntries.map((e) => e.id));
    const unmanifested = files.filter((f) => this._isUnmanifestedNoteFile(f.name, manifestIdSet, delSet));
    if (unmanifested.length === 0) return manifestEntries;

    const newlyDiscovered = await this._fetchUnmanifestedEntries(unmanifested, manifestIdSet, delSet);
    if (newlyDiscovered.length === 0) return manifestEntries;

    const merged = [...manifestEntries, ...newlyDiscovered];
    const rootId = await this._getAppFolderId();
    await this._gdriveClient.saveFile(
      NoteManifestSyncService._MANIFEST_FILE_NAME,
      JSON.stringify(merged, null, 2),
      NoteManifestSyncService._JSON_MIME,
      rootId
    );
    return merged;
  }

  private _isUnmanifestedNoteFile(
    name: string,
    manifestIdSet: Set<string>,
    delSet: Set<string>
  ): boolean {
    if (!name.startsWith(NoteManifestSyncService._PREFIX_NOTE) || !name.endsWith(NoteManifestSyncService._JSON_EXT)) {
      return false;
    }
    const noteId = this._extractNoteIdFromFileName(name);
    if (this._isDeleted(noteId, delSet)) {
      return false;
    }
    return !manifestIdSet.has(noteId);
  }

  private _extractNoteIdFromFileName(fileName: string): string {
    const prefixLen = NoteManifestSyncService._PREFIX_NOTE.length;
    const extLen = NoteManifestSyncService._JSON_EXT.length;
    return fileName.slice(prefixLen, fileName.length - extLen);
  }

  private async _fetchUnmanifestedEntries(
    files: DriveItem[],
    manifestIdSet: Set<string>,
    delSet: Set<string>
  ): Promise<NoteManifestEntry[]> {
    const entries: NoteManifestEntry[] = [];
    for (const file of files) {
      try {
        const text = await this._gdriveClient.getFileText(file.id);
        const note = JSON.parse(text) as Note;
        if (note && note.id && this._isDeleted(note.id, delSet)) {
          void this._gdriveClient.deleteFile(file.id).catch(() => {});
          continue;
        }
        if (note && note.id && !manifestIdSet.has(note.id)) {
          manifestIdSet.add(note.id);
          entries.push(this._toManifestEntry(note));
        }
      } catch {
        // Skip unreadable or corrupted note files
      }
    }
    return entries;
  }

  private _getCandidateNoteFileNames(noteId: string): string[] {
    const rawId = noteId.replace(/^note_+/, '');
    const prefix = NoteManifestSyncService._PREFIX_NOTE;
    const ext = NoteManifestSyncService._JSON_EXT;
    const names = new Set<string>([
      `${prefix}${noteId}${ext}`,
      `${prefix}${rawId}${ext}`,
      `${noteId}${ext}`,
      `${prefix}${prefix}${rawId}${ext}`,
    ]);
    return Array.from(names);
  }

  private _isDeleted(id: string, delSet: Set<string>): boolean {
    if (delSet.has(id)) return true;
    const rawId = id.replace(/^note_+/, '');
    return delSet.has(rawId) || delSet.has(`${NoteManifestSyncService._PREFIX_NOTE}${rawId}`);
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

