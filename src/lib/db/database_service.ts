import { openDB, type IDBPDatabase } from 'idb';
import { DB_INDEXES, DB_NAME, DB_STORES, DB_VERSION } from './constants';
import type { SynapseSyncDB } from './schema';

/**
 * Service managing the IndexedDB connection and schema upgrades.
 */
export class DatabaseService {
  private static readonly _DEFAULT_DB_NAME = DB_NAME;
  private static readonly _DEFAULT_DB_VERSION = DB_VERSION;

  private readonly _databaseName: string;
  private readonly _databaseVersion: number;
  private _dbInstance: IDBPDatabase<SynapseSyncDB> | null = null;
  private _initPromise: Promise<IDBPDatabase<SynapseSyncDB>> | null = null;

  public constructor(
    databaseName: string = DatabaseService._DEFAULT_DB_NAME,
    databaseVersion: number = DatabaseService._DEFAULT_DB_VERSION
  ) {
    this._databaseName = databaseName;
    this._databaseVersion = databaseVersion;
  }

  /**
   * Retrieves the opened database instance, initializing it if not already connected.
   */
  public async getDB(): Promise<IDBPDatabase<SynapseSyncDB>> {
    if (this._dbInstance) {
      return this._dbInstance;
    }
    if (!this._initPromise) {
      this._initPromise = this._connect();
    }
    return this._initPromise;
  }

  /**
   * Closes the active database connection if open.
   */
  public async close(): Promise<void> {
    if (this._dbInstance) {
      this._dbInstance.close();
      this._dbInstance = null;
    }
    this._initPromise = null;
  }

  /**
   * Performs the database connection and configuration.
   */
  protected async _connect(): Promise<IDBPDatabase<SynapseSyncDB>> {
    const db = await openDB<SynapseSyncDB>(this._databaseName, this._databaseVersion, {
      upgrade: (dbInstance) => {
        this._handleUpgrade(dbInstance);
      },
    });
    this._dbInstance = db;
    return db;
  }

  /**
   * Handles database schema upgrades and object store creation.
   */
  protected _handleUpgrade(db: IDBPDatabase<SynapseSyncDB>): void {
    this.__createCoreStores(db);
    this.__createStudyStores(db);
    this.__createUtilityStores(db);
  }

  private __createCoreStores(db: IDBPDatabase<SynapseSyncDB>): void {
    const notebookStore = db.createObjectStore(DB_STORES.NOTEBOOKS, { keyPath: 'id' });
    notebookStore.createIndex(DB_INDEXES.BY_SOURCE, 'source');
    notebookStore.createIndex(DB_INDEXES.BY_UPDATED, 'updatedAt');

    const noteStore = db.createObjectStore(DB_STORES.NOTES, { keyPath: 'id' });
    noteStore.createIndex(DB_INDEXES.BY_NOTEBOOK, 'notebookId');
    noteStore.createIndex(DB_INDEXES.BY_SOURCE_TYPE, 'sourceType');
    noteStore.createIndex(DB_INDEXES.BY_UPDATED, 'updatedAt');
    noteStore.createIndex(DB_INDEXES.BY_TITLE, 'title');
  }

  private __createStudyStores(db: IDBPDatabase<SynapseSyncDB>): void {
    const quizStore = db.createObjectStore(DB_STORES.QUIZZES, { keyPath: 'id' });
    quizStore.createIndex(DB_INDEXES.BY_NOTE, 'noteId');
    quizStore.createIndex(DB_INDEXES.BY_GENERATED, 'generatedAt');

    const mcqStore = db.createObjectStore(DB_STORES.MCQ_CARDS, { keyPath: 'id' });
    mcqStore.createIndex(DB_INDEXES.BY_QUIZ, 'quizId');

    const flashcardStore = db.createObjectStore(DB_STORES.FLASHCARDS, { keyPath: 'id' });
    flashcardStore.createIndex(DB_INDEXES.BY_QUIZ, 'quizId');

    const srsStore = db.createObjectStore(DB_STORES.SRS_CARDS, { keyPath: 'id' });
    srsStore.createIndex(DB_INDEXES.BY_CARD, 'cardId', { unique: true });
    srsStore.createIndex(DB_INDEXES.BY_NEXT_REVIEW, 'nextReview');
    srsStore.createIndex(DB_INDEXES.BY_CARD_TYPE, 'cardType');
  }

  private __createUtilityStores(db: IDBPDatabase<SynapseSyncDB>): void {
    const chatStore = db.createObjectStore(DB_STORES.CHAT_MESSAGES, { keyPath: 'id' });
    chatStore.createIndex(DB_INDEXES.BY_NOTE, 'noteId');
    chatStore.createIndex(DB_INDEXES.BY_TIMESTAMP, 'timestamp');

    const syncStore = db.createObjectStore(DB_STORES.SYNC_QUEUE, { keyPath: 'id' });
    syncStore.createIndex(DB_INDEXES.BY_STATUS, 'status');
    syncStore.createIndex(DB_INDEXES.BY_ENTITY, 'entityId');
    syncStore.createIndex(DB_INDEXES.BY_CREATED, 'createdAt');

    db.createObjectStore(DB_STORES.PREFERENCES, { keyPath: 'key' });
  }
}
