import type { IDBPTransaction } from 'idb';
import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { SynapseSyncDB } from '../schema';
import type { Flashcard, MCQCard, Note, Notebook, Quiz, SRSCard, SyncEntry } from '../models';
import type { GoogleDriveApiClient } from '../../api/google_drive_client';
import type { AuthService } from '../../auth/auth_service';
import type { SyncQueueService } from './sync_queue_service';
import { PreferencesService } from './preferences_service';
import { AppStateSyncService } from './app_state_sync_service';
import { ChatSyncService } from './chat_sync_service';

export interface SyncResult {
  success: boolean; reason?: string;
  pushedNotes: number; pulledNotes: number;
  pushedQuizzes: number; pulledQuizzes: number;
  pushedNotebooks: number; pulledNotebooks: number;
  pushedChats?: number; pulledChats?: number;
  timestamp: string;
}

type QuizSyncTx = IDBPTransaction<SynapseSyncDB, ('quizzes' | 'mcq_cards' | 'flashcards' | 'srs_cards')[], 'readwrite'>;

export interface QuizDrivePayload {
  quiz: Quiz;
  mcqCards: MCQCard[];
  flashcards: Flashcard[];
  srsCards: SRSCard[];
}

/**
 * Service managing bidirectional synchronization of notes and quizzes with Google Drive.
 */
export class GoogleDriveSyncService {
  private static readonly _APP_FOLDER_NAME = 'SynapseSync';
  private static readonly _NOTES_FOLDER_NAME = 'notes';
  private static readonly _QUIZZES_FOLDER_NAME = 'quizzes';
  private static readonly _NOTEBOOKS_FOLDER_NAME = 'notebooks';
  private static readonly _JSON_MIME = 'application/json';
  private static readonly _JSON_EXT = '.json';
  private static readonly _PREFIX_NOTE = 'note_';
  private static readonly _PREFIX_QUIZ = 'quiz_';
  private static readonly _PREFIX_NOTEBOOK = 'notebook_';
  private static readonly _PREF_LAST_SYNC = 'lastSyncTimestamp';
  private static readonly _SYNC_EVENT_NAME = 'synapse-sync-completed';

  private readonly _dbService: DatabaseService;
  private readonly _gdriveClient: GoogleDriveApiClient;
  private readonly _authService: AuthService;
  private readonly _syncQueueService?: SyncQueueService;
  private readonly _preferencesService: PreferencesService;
  private readonly _appStateSyncService: AppStateSyncService;
  private readonly _chatSyncService: ChatSyncService;
  private readonly _activeQuizPushes = new Map<string, Promise<void>>();

  private _appFolderId: string | null = null;
  private _notesFolderId: string | null = null;
  private _quizzesFolderId: string | null = null;
  private _notebooksFolderId: string | null = null;

  public constructor(
    databaseService: DatabaseService,
    googleDriveClient: GoogleDriveApiClient,
    authService: AuthService,
    syncQueueService?: SyncQueueService,
    preferencesService?: PreferencesService,
    appStateSyncService?: AppStateSyncService,
    chatSyncService?: ChatSyncService
  ) {
    this._dbService = databaseService;
    this._gdriveClient = googleDriveClient;
    this._authService = authService;
    this._syncQueueService = syncQueueService;
    this._preferencesService = preferencesService ?? new PreferencesService(databaseService);
    this._appStateSyncService =
      appStateSyncService ??
      new AppStateSyncService(databaseService, googleDriveClient, this._preferencesService);
    this._chatSyncService =
      chatSyncService ??
      new ChatSyncService(databaseService, googleDriveClient);
  }

  /**
   * Checks whether Google Drive authentication is active with a valid session.
   */
  public isConnected(): boolean {
    return this._authService.isAuthenticated();
  }

  /**
   * Pushes a single note to Google Drive and marks it as synced locally.
   */
  public async pushNote(note: Note): Promise<void> {
    const folderId = await this._getNotesFolderId();
    const fileName = `${GoogleDriveSyncService._PREFIX_NOTE}${note.id}${GoogleDriveSyncService._JSON_EXT}`;
    const payload = JSON.stringify({ ...note, isSynced: true }, null, 2);
    await this._gdriveClient.saveFile(fileName, payload, GoogleDriveSyncService._JSON_MIME, folderId);

    const db = await this._dbService.getDB();
    await db.put(DB_STORES.NOTES, { ...note, isSynced: true });
  }

  /**
   * Pushes a quiz bundled with its MCQs, flashcards, and SRS states to Google Drive.
   */
  public async pushQuiz(quizId: string): Promise<void> {
    const active = this._activeQuizPushes.get(quizId);
    if (active) return active;
    const pushPromise = this._executePushQuiz(quizId);
    this._activeQuizPushes.set(quizId, pushPromise);
    try {
      await pushPromise;
    } finally {
      this._activeQuizPushes.delete(quizId);
    }
  }

  /**
   * Pushes a notebook collection entity to Google Drive and marks it as synced.
   */
  public async pushNotebook(notebook: Notebook): Promise<void> {
    const folderId = await this._getNotebooksFolderId();
    const fileName = `${GoogleDriveSyncService._PREFIX_NOTEBOOK}${notebook.id}${GoogleDriveSyncService._JSON_EXT}`;
    const payload = JSON.stringify({ ...notebook, isSynced: true }, null, 2);
    await this._gdriveClient.saveFile(fileName, payload, GoogleDriveSyncService._JSON_MIME, folderId);

    const db = await this._dbService.getDB();
    await db.put(DB_STORES.NOTEBOOKS, { ...notebook, isSynced: true });
  }

  /**
   * Removes a note file and its chat history from Google Drive when deleted locally.
   */
  public async deleteRemoteNote(noteId: string): Promise<void> {
    const folderId = await this._getNotesFolderId();
    const fileName = `${GoogleDriveSyncService._PREFIX_NOTE}${noteId}${GoogleDriveSyncService._JSON_EXT}`;
    const file = await this._gdriveClient.findFileByName(fileName, folderId);
    if (file) {
      await this._gdriveClient.deleteFile(file.id);
    }
    await this._chatSyncService.deleteRemoteChat(noteId);
  }

  /**
   * Pushes all chat messages associated with a note to its dedicated file on Google Drive.
   */
  public async pushChat(noteId: string): Promise<void> {
    await this._chatSyncService.pushChat(noteId);
  }

  /**
   * Removes a chat history file from Google Drive when chat is cleared or note is deleted.
   */
  public async deleteRemoteChat(noteId: string): Promise<void> {
    await this._chatSyncService.deleteRemoteChat(noteId);
  }

  /**
   * Pulls all study notes from Google Drive into local IndexedDB.
   */
  public async pullNotes(): Promise<number> {
    const folderId = await this._getNotesFolderId();
    const files = await this._gdriveClient.listAllFolderItems(folderId);
    const db = await this._dbService.getDB();
    let count = 0;

    for (const file of files) {
      if (!this._isNoteFileName(file.name)) continue;
      const text = await this._gdriveClient.getFileText(file.id);
      const remoteNote = JSON.parse(text) as Note;
      const local = await db.get(DB_STORES.NOTES, remoteNote.id);
      if (!local || new Date(remoteNote.updatedAt) > new Date(local.updatedAt)) {
        await db.put(DB_STORES.NOTES, { ...remoteNote, isSynced: true });
        count += 1;
      }
    }
    return count;
  }

  /**
   * Pulls all quizzes, cards, and SRS retention state from Google Drive.
   */
  public async pullQuizzes(): Promise<number> {
    const folderId = await this._getQuizzesFolderId();
    const files = await this._gdriveClient.listAllFolderItems(folderId);
    const seen = new Set<string>();
    let count = 0;

    for (const file of files) {
      if (!this._isQuizFileName(file.name)) continue;
      if (seen.has(file.name)) {
        void this._gdriveClient.deleteFile(file.id).catch(() => {});
        continue;
      }
      seen.add(file.name);
      const text = await this._gdriveClient.getFileText(file.id);
      const payload = JSON.parse(text) as QuizDrivePayload;
      if (await this._saveImportedQuizPayload(payload)) count += 1;
    }
    return count;
  }

  /**
   * Pulls all notebooks from Google Drive into local IndexedDB.
   */
  public async pullNotebooks(): Promise<number> {
    const folderId = await this._getNotebooksFolderId();
    const files = await this._gdriveClient.listAllFolderItems(folderId);
    const db = await this._dbService.getDB();
    let count = 0;

    for (const file of files) {
      if (!this._isNotebookFileName(file.name)) continue;
      const text = await this._gdriveClient.getFileText(file.id);
      const remoteNb = JSON.parse(text) as Notebook;
      const local = await db.get(DB_STORES.NOTEBOOKS, remoteNb.id);
      if (!local || new Date(remoteNb.updatedAt) > new Date(local.updatedAt)) {
        await db.put(DB_STORES.NOTEBOOKS, { ...remoteNb, isSynced: true });
        count += 1;
      }
    }
    return count;
  }

  /**
   * Pulls all note chat histories from Google Drive into local IndexedDB.
   */
  public async pullChats(): Promise<number> {
    return this._chatSyncService.pullChats();
  }

  /**
   * Replays a single queued mutation entry to Google Drive.
   */
  public async replaySyncEntry(entry: SyncEntry): Promise<void> {
    if (entry.entityType === 'note') await this._replayNoteEntry(entry);
    else if (entry.entityType === 'quiz') await this.pushQuiz(entry.entityId);
    else if (entry.entityType === 'srs_card') await this._replaySRSCardEntry(entry.entityId);
    else if (entry.entityType === 'notebook') await this._replayNotebookEntry(entry);
  }

  /**
   * Pushes the global application state snapshot to Google Drive.
   */
  public async pushAppState(): Promise<void> {
    await this._appStateSyncService.pushAppState();
  }

  /**
   * Pulls the global application state snapshot from Google Drive.
   */
  public async pullAppState(): Promise<void> {
    await this._appStateSyncService.pullAppState();
  }

  /**
   * Executes a full bidirectional sync: pushes local unsynced mutations and pulls remote updates.
   */
  public async syncAll(): Promise<SyncResult> {
    const nowIso = new Date().toISOString();
    if (!this.isConnected()) return this._buildSkippedResult(nowIso);

    const pushedNotes = await this._pushUnsyncedNotes();
    const pushedNotebooks = await this._pushUnsyncedNotebooks();
    const pushedQuizzes = await this._pushUnsyncedQuizzes();
    const pushedChats = await this._chatSyncService.pushAllChats();
    await this._replayQueueEntries();
    await this.pushAppState();

    const pulledNotebooks = await this.pullNotebooks();
    const pulledNotes = await this.pullNotes();
    const pulledQuizzes = await this.pullQuizzes();
    const pulledChats = await this._chatSyncService.pullChats();
    await this.pullAppState();

    await this._preferencesService.set(GoogleDriveSyncService._PREF_LAST_SYNC, nowIso);
    const result: SyncResult = {
      success: true, pushedNotes, pulledNotes, pushedQuizzes, pulledQuizzes,
      pushedNotebooks, pulledNotebooks, pushedChats, pulledChats, timestamp: nowIso,
    };
    this._notifySyncCompleted(result);
    return result;
  }

  /**
   * Loads SRS tracking records for a set of MCQ and Flashcard entities.
   */
  protected async _loadSRSCardsForCards(mcqs: MCQCard[], flashcards: Flashcard[]): Promise<SRSCard[]> {
    const db = await this._dbService.getDB();
    const srsStore = db.transaction(DB_STORES.SRS_CARDS).store.index(DB_INDEXES.BY_CARD);
    const cardIds = [...mcqs.map((m) => m.id), ...flashcards.map((f) => f.id)];
    const records: SRSCard[] = [];

    for (const cardId of cardIds) {
      const srsCard = await srsStore.get(cardId);
      if (srsCard) records.push(srsCard);
    }
    return records;
  }

  /**
   * Persists an imported quiz and its components into local IndexedDB.
   */
  protected async _saveImportedQuizPayload(payload: QuizDrivePayload): Promise<boolean> {
    const db = await this._dbService.getDB();
    const existing = await db.get(DB_STORES.QUIZZES, payload.quiz.id);
    const tx = db.transaction(
      [DB_STORES.QUIZZES, DB_STORES.MCQ_CARDS, DB_STORES.FLASHCARDS, DB_STORES.SRS_CARDS],
      'readwrite'
    );

    await tx.objectStore(DB_STORES.QUIZZES).put({ ...payload.quiz, isSynced: true });
    await this._pruneMissingCards(tx, payload);
    for (const mcq of payload.mcqCards) await tx.objectStore(DB_STORES.MCQ_CARDS).put(mcq);
    for (const card of payload.flashcards) await tx.objectStore(DB_STORES.FLASHCARDS).put(card);
    for (const srs of payload.srsCards) await tx.objectStore(DB_STORES.SRS_CARDS).put(srs);
    await tx.done;
    return !existing;
  }

  /**
   * Scans and pushes any local notes marked with isSynced = false.
   */
  protected async _pushUnsyncedNotes(): Promise<number> {
    const db = await this._dbService.getDB();
    const allNotes = await db.getAll(DB_STORES.NOTES);
    const unsynced = allNotes.filter((n) => !n.isSynced);
    for (const note of unsynced) await this.pushNote(note);
    return unsynced.length;
  }

  /**
   * Scans and pushes any local notebooks marked with isSynced = false.
   */
  protected async _pushUnsyncedNotebooks(): Promise<number> {
    const db = await this._dbService.getDB();
    const allNotebooks = await db.getAll(DB_STORES.NOTEBOOKS);
    const unsynced = allNotebooks.filter((nb) => !nb.isSynced);
    for (const nb of unsynced) await this.pushNotebook(nb);
    return unsynced.length;
  }

  /**
   * Scans and pushes local quizzes marked with isSynced = false.
   */
  protected async _pushUnsyncedQuizzes(): Promise<number> {
    const db = await this._dbService.getDB();
    const allQuizzes = await db.getAll(DB_STORES.QUIZZES);
    const unsynced = allQuizzes.filter((quiz) => !quiz.isSynced);
    let count = 0;
    for (const quiz of unsynced) {
      try {
        await this.pushQuiz(quiz.id);
        count++;
      } catch (err) {
        console.warn(`Failed to push quiz ${quiz.id}:`, err);
      }
    }
    return count;
  }

  /**
   * Dispatches the synapse-sync-completed custom event to the active window.
   */
  protected _notifySyncCompleted(result: SyncResult): void {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent(GoogleDriveSyncService._SYNC_EVENT_NAME, { detail: result });
      window.dispatchEvent(event);
    }
  }

  private async _getNotesFolderId(): Promise<string> {
    if (!this._notesFolderId) {
      const appFolder = await this._getAppFolderId();
      const folder = await this._gdriveClient.getOrCreateFolder(GoogleDriveSyncService._NOTES_FOLDER_NAME, appFolder);
      this._notesFolderId = folder.id;
    }
    return this._notesFolderId;
  }

  private async _getQuizzesFolderId(): Promise<string> {
    if (!this._quizzesFolderId) {
      const appFolder = await this._getAppFolderId();
      const folder = await this._gdriveClient.getOrCreateFolder(GoogleDriveSyncService._QUIZZES_FOLDER_NAME, appFolder);
      this._quizzesFolderId = folder.id;
    }
    return this._quizzesFolderId;
  }

  private async _getNotebooksFolderId(): Promise<string> {
    if (!this._notebooksFolderId) {
      const app = await this._getAppFolderId();
      this._notebooksFolderId = (await this._gdriveClient.getOrCreateFolder(GoogleDriveSyncService._NOTEBOOKS_FOLDER_NAME, app)).id;
    }
    return this._notebooksFolderId;
  }

  private async _getAppFolderId(): Promise<string> {
    if (!this._appFolderId) {
      this._appFolderId = (await this._gdriveClient.getOrCreateFolder(GoogleDriveSyncService._APP_FOLDER_NAME)).id;
    }
    return this._appFolderId;
  }

  private async _replayNoteEntry(entry: SyncEntry): Promise<void> {
    if (entry.operation === 'delete') {
      await this.deleteRemoteNote(entry.entityId);
      return;
    }
    const db = await this._dbService.getDB();
    const note = await db.get(DB_STORES.NOTES, entry.entityId);
    if (note) await this.pushNote(note);
  }

  private async _replayNotebookEntry(entry: SyncEntry): Promise<void> {
    const db = await this._dbService.getDB();
    const nb = await db.get(DB_STORES.NOTEBOOKS, entry.entityId);
    if (nb) await this.pushNotebook(nb);
  }

  private async _replaySRSCardEntry(cardId: string): Promise<void> {
    const db = await this._dbService.getDB();
    const srsCard = await db.get(DB_STORES.SRS_CARDS, cardId);
    if (!srsCard) return;

    const mcq = await db.get(DB_STORES.MCQ_CARDS, srsCard.cardId);
    if (mcq) {
      await this.pushQuiz(mcq.quizId);
      return;
    }
    const flashcard = await db.get(DB_STORES.FLASHCARDS, srsCard.cardId);
    if (flashcard) await this.pushQuiz(flashcard.quizId);
  }

  private async _replayQueueEntries(): Promise<void> {
    if (!this._syncQueueService) return;
    const pending = await this._syncQueueService.getPending();
    for (const entry of pending) {
      try {
        await this.replaySyncEntry(entry);
        await this._syncQueueService.markCompleted(entry.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await this._syncQueueService.markFailed(entry.id, msg);
      }
    }
  }

  private _isNoteFileName(name: string): boolean {
    return name.startsWith(GoogleDriveSyncService._PREFIX_NOTE) && name.endsWith(GoogleDriveSyncService._JSON_EXT);
  }

  private _isQuizFileName(name: string): boolean {
    return name.startsWith(GoogleDriveSyncService._PREFIX_QUIZ) && name.endsWith(GoogleDriveSyncService._JSON_EXT);
  }

  private _isNotebookFileName(name: string): boolean {
    return name.startsWith(GoogleDriveSyncService._PREFIX_NOTEBOOK) && name.endsWith(GoogleDriveSyncService._JSON_EXT);
  }

  private async _pruneMissingCards(tx: QuizSyncTx, payload: QuizDrivePayload): Promise<void> {
    const mcqStore = tx.objectStore(DB_STORES.MCQ_CARDS);
    const localMcqs: MCQCard[] = await mcqStore.index(DB_INDEXES.BY_QUIZ).getAll(payload.quiz.id);
    const remoteMcqIds = new Set(payload.mcqCards.map((m) => m.id));
    for (const m of localMcqs) if (!remoteMcqIds.has(m.id)) await mcqStore.delete(m.id);

    const flashStore = tx.objectStore(DB_STORES.FLASHCARDS);
    const localCards: Flashcard[] = await flashStore.index(DB_INDEXES.BY_QUIZ).getAll(payload.quiz.id);
    const remoteCardIds = new Set(payload.flashcards.map((f) => f.id));
    for (const f of localCards) if (!remoteCardIds.has(f.id)) await flashStore.delete(f.id);
  }

  private async _executePushQuiz(quizId: string): Promise<void> {
    const folderId = await this._getQuizzesFolderId();
    const db = await this._dbService.getDB();
    const quiz = await db.get(DB_STORES.QUIZZES, quizId);
    if (!quiz) return;

    const mcqs = await db.getAllFromIndex(DB_STORES.MCQ_CARDS, DB_INDEXES.BY_QUIZ, quizId);
    const flashcards = await db.getAllFromIndex(DB_STORES.FLASHCARDS, DB_INDEXES.BY_QUIZ, quizId);
    const srsCards = await this._loadSRSCardsForCards(mcqs, flashcards);

    const updatedQuiz = { ...quiz, isSynced: true };
    const payload: QuizDrivePayload = { quiz: updatedQuiz, mcqCards: mcqs, flashcards, srsCards };
    const fileName = `${GoogleDriveSyncService._PREFIX_QUIZ}${quizId}${GoogleDriveSyncService._JSON_EXT}`;
    await this._gdriveClient.saveFile(fileName, JSON.stringify(payload, null, 2), GoogleDriveSyncService._JSON_MIME, folderId);
    await db.put(DB_STORES.QUIZZES, updatedQuiz);
  }

  private _buildSkippedResult(timestamp: string): SyncResult {
    return {
      success: false, reason: 'not_authenticated',
      pushedNotes: 0, pulledNotes: 0, pushedQuizzes: 0, pulledQuizzes: 0,
      pushedNotebooks: 0, pulledNotebooks: 0, pushedChats: 0, pulledChats: 0, timestamp,
    };
  }
}
