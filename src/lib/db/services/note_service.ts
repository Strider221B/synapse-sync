import { v4 as uuidv4 } from 'uuid';
import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { Note } from '../models';

import type { SyncQueueService } from './sync_queue_service';

export type CreateNoteInput = Omit<
  Note,
  'id' | 'createdAt' | 'updatedAt' | 'wordCount' | 'isSynced'
> & {
  isSynced?: boolean;
};

export type UpdateNoteInput = Partial<Omit<Note, 'id' | 'createdAt' | 'wordCount'>>;

/**
 * Service providing CRUD and search operations for Note entities.
 */
export class NoteService {
  private static readonly _ERROR_NOTE_NOT_FOUND = 'Note not found';
  private static readonly _EMPTY_WORD_COUNT = 0;
  private static readonly _ENTITY_TYPE = 'note';
  private static readonly _OP_CREATE = 'create';
  private static readonly _OP_UPDATE = 'update';
  private static readonly _OP_DELETE = 'delete';

  private readonly _databaseService: DatabaseService;
  private readonly _syncQueueService?: SyncQueueService;

  public constructor(databaseService: DatabaseService, syncQueueService?: SyncQueueService) {
    this._databaseService = databaseService;
    this._syncQueueService = syncQueueService;
  }

  /**
   * Creates a new note entity with generated UUID, computed word count, and timestamps.
   */
  public async create(input: CreateNoteInput): Promise<Note> {
    const db = await this._databaseService.getDB();
    const timestamp = new Date().toISOString();
    const note: Note = {
      id: uuidv4(),
      notebookId: input.notebookId,
      title: input.title,
      content: input.content,
      contentFormat: input.contentFormat,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      googleDriveFileId: input.googleDriveFileId,
      wordCount: this._calculateWordCount(input.content),
      createdAt: timestamp,
      updatedAt: timestamp,
      isSynced: input.isSynced ?? false,
    };

    await db.put(DB_STORES.NOTES, note);
    await this._enqueueIfOffline(note.id, NoteService._OP_CREATE, note as unknown as Record<string, unknown>);
    return note;
  }

  /**
   * Deletes a note by its unique identifier.
   */
  public async delete(id: string): Promise<void> {
    const db = await this._databaseService.getDB();
    await db.delete(DB_STORES.NOTES, id);
    if (this._syncQueueService) {
      await this._syncQueueService.enqueue(NoteService._ENTITY_TYPE, id, NoteService._OP_DELETE, { id });
    }
  }

  /**
   * Retrieves all notes from the database.
   */
  public async getAll(): Promise<Note[]> {
    const db = await this._databaseService.getDB();
    return db.getAll(DB_STORES.NOTES);
  }

  /**
   * Retrieves a note by its identifier.
   */
  public async getById(id: string): Promise<Note | undefined> {
    const db = await this._databaseService.getDB();
    return db.get(DB_STORES.NOTES, id);
  }

  /**
   * Retrieves all notes belonging to a specific notebook.
   */
  public async getByNotebook(notebookId: string): Promise<Note[]> {
    const db = await this._databaseService.getDB();
    return db.getAllFromIndex(DB_STORES.NOTES, DB_INDEXES.BY_NOTEBOOK, notebookId);
  }

  /**
   * Retrieves all notes matching a specific source type.
   */
  public async getBySourceType(sourceType: Note['sourceType']): Promise<Note[]> {
    const db = await this._databaseService.getDB();
    return db.getAllFromIndex(DB_STORES.NOTES, DB_INDEXES.BY_SOURCE_TYPE, sourceType);
  }

  /**
   * Searches notes by matching title or content case-insensitively.
   */
  public async search(query: string): Promise<Note[]> {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) {
      return [];
    }
    const allNotes = await this.getAll();
    return allNotes.filter(
      (note) =>
        note.title.toLowerCase().includes(trimmed) ||
        note.content.toLowerCase().includes(trimmed)
    );
  }

  /**
   * Updates an existing note and recalculates word count if content changed.
   */
  public async update(id: string, input: UpdateNoteInput): Promise<Note> {
    const db = await this._databaseService.getDB();
    const existing = await db.get(DB_STORES.NOTES, id);
    if (!existing) {
      throw new Error(`${NoteService._ERROR_NOTE_NOT_FOUND}: ${id}`);
    }

    const contentChanged = input.content !== undefined && input.content !== existing.content;
    const wordCount = contentChanged
      ? this._calculateWordCount(input.content ?? '')
      : existing.wordCount;

    const updated: Note = {
      ...existing,
      ...input,
      wordCount,
      updatedAt: new Date().toISOString(),
    };

    await db.put(DB_STORES.NOTES, updated);
    await this._enqueueIfOffline(id, NoteService._OP_UPDATE, input as Record<string, unknown>);
    return updated;
  }

  /**
   * Computes word count for text content.
   */
  protected _calculateWordCount(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return NoteService._EMPTY_WORD_COUNT;
    }
    return trimmed.split(/\s+/).length;
  }

  /**
   * Enqueues a mutation operation if the service is configured with a sync queue and offline.
   */
  protected async _enqueueIfOffline(
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>
  ): Promise<void> {
    if (this._syncQueueService && this._isOffline()) {
      await this._syncQueueService.enqueue(NoteService._ENTITY_TYPE, entityId, operation, payload);
    }
  }

  /**
   * Returns whether the client environment is offline.
   */
  protected _isOffline(): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
      return false;
    }
    return !navigator.onLine;
  }
}


