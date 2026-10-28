import { v4 as uuidv4 } from 'uuid';
import type { IDBPTransaction } from 'idb';
import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { Flashcard, MCQCard, Quiz, SRSCard } from '../models';
import type { SynapseSyncDB } from '../schema';
import type { SyncQueueService } from './sync_queue_service';

export type CreateMCQInput = Omit<MCQCard, 'id' | 'quizId'>;
export type CreateFlashcardInput = Omit<Flashcard, 'id' | 'quizId'>;

export interface QuizWithCards {
  quiz: Quiz;
  mcqCards: MCQCard[];
  flashcards: Flashcard[];
}

type QuizTransaction = IDBPTransaction<
  SynapseSyncDB,
  ('quizzes' | 'mcq_cards' | 'flashcards' | 'srs_cards')[],
  'readwrite'
>;

/**
 * Service providing transactional CRUD and cascading operations for Quiz entities.
 */
export class QuizService {
  private static readonly _INITIAL_EASINESS_FACTOR = 2.5;
  private static readonly _INITIAL_REPETITIONS = 0;
  private static readonly _INITIAL_INTERVAL = 0;
  private static readonly _INITIAL_TOTAL_REVIEWS = 0;
  private static readonly _INITIAL_CORRECT_COUNT = 0;
  private static readonly _VERSION_INCREMENT = 1;
  private static readonly _INITIAL_VERSION = 1;
  private static readonly _ENTITY_TYPE = 'quiz';
  private static readonly _ENTITY_MCQ = 'mcq_card';
  private static readonly _ENTITY_FLASHCARD = 'flashcard';
  private static readonly _OP_CREATE = 'create';
  private static readonly _OP_DELETE = 'delete';

  private readonly _databaseService: DatabaseService;
  private readonly _syncQueueService?: SyncQueueService;

  public constructor(databaseService: DatabaseService, syncQueueService?: SyncQueueService) {
    this._databaseService = databaseService;
    this._syncQueueService = syncQueueService;
  }

  /**
   * Creates a Quiz, MCQ cards, Flashcards, and corresponding SRS cards in a transaction.
   */
  public async create(
    noteId: string,
    mcqs: CreateMCQInput[],
    flashcards: CreateFlashcardInput[],
    modelUsed: string
  ): Promise<QuizWithCards> {
    const db = await this._databaseService.getDB();
    const existingQuizzes = await this.getByNote(noteId);
    const version = this._calculateNextVersion(existingQuizzes);
    const timestamp = new Date().toISOString();
    const quizId = uuidv4();

    const quiz: Quiz = {
      id: quizId,
      noteId,
      modelUsed,
      version,
      generatedAt: timestamp,
      isSynced: false,
    };
    const tx = db.transaction(
      [DB_STORES.QUIZZES, DB_STORES.MCQ_CARDS, DB_STORES.FLASHCARDS, DB_STORES.SRS_CARDS],
      'readwrite'
    );

    await tx.objectStore(DB_STORES.QUIZZES).put(quiz);
    const savedMCQs = await this._saveMCQCards(tx, quizId, mcqs, timestamp);
    const savedFlashcards = await this._saveFlashcards(tx, quizId, flashcards, timestamp);
    await tx.done;

    await this._enqueueIfOffline(quizId, { noteId, modelUsed, version });
    return { quiz, mcqCards: savedMCQs, flashcards: savedFlashcards };
  }


  /**
   * Deletes a quiz and cascades removal across cards and their SRS tracking records.
   */
  public async delete(quizId: string): Promise<void> {
    const db = await this._databaseService.getDB();
    const tx = db.transaction(
      [DB_STORES.QUIZZES, DB_STORES.MCQ_CARDS, DB_STORES.FLASHCARDS, DB_STORES.SRS_CARDS],
      'readwrite'
    );

    await this._cascadeDeleteMCQs(tx, quizId);
    await this._cascadeDeleteFlashcards(tx, quizId);
    await tx.objectStore(DB_STORES.QUIZZES).delete(quizId);
    await tx.done;
  }

  /**
   * Deletes a single MCQ card and its associated SRS state.
   */
  public async deleteMCQCard(cardId: string): Promise<void> {
    const db = await this._databaseService.getDB();
    const card = await db.get(DB_STORES.MCQ_CARDS, cardId);
    const quizId = card?.quizId;
    const tx = db.transaction([DB_STORES.MCQ_CARDS, DB_STORES.SRS_CARDS], 'readwrite');
    const srsIndex = tx.objectStore(DB_STORES.SRS_CARDS).index(DB_INDEXES.BY_CARD);
    const srsCard = await srsIndex.get(cardId);
    if (srsCard) {
      await tx.objectStore(DB_STORES.SRS_CARDS).delete(srsCard.id);
    }
    await tx.objectStore(DB_STORES.MCQ_CARDS).delete(cardId);
    await tx.done;
    if (quizId && this._syncQueueService) {
      await this._syncQueueService.enqueue(QuizService._ENTITY_TYPE, quizId, QuizService._OP_CREATE, { quizId });
    }
  }

  /**
   * Deletes a single flashcard and its associated SRS state.
   */
  public async deleteFlashcard(cardId: string): Promise<void> {
    const db = await this._databaseService.getDB();
    const card = await db.get(DB_STORES.FLASHCARDS, cardId);
    const quizId = card?.quizId;
    const tx = db.transaction([DB_STORES.FLASHCARDS, DB_STORES.SRS_CARDS], 'readwrite');
    const srsIndex = tx.objectStore(DB_STORES.SRS_CARDS).index(DB_INDEXES.BY_CARD);
    const srsCard = await srsIndex.get(cardId);
    if (srsCard) {
      await tx.objectStore(DB_STORES.SRS_CARDS).delete(srsCard.id);
    }
    await tx.objectStore(DB_STORES.FLASHCARDS).delete(cardId);
    await tx.done;
    if (quizId && this._syncQueueService) {
      await this._syncQueueService.enqueue(QuizService._ENTITY_TYPE, quizId, QuizService._OP_CREATE, { quizId });
    }
  }

  /**
   * Retrieves all quizzes associated with a note.
   */
  public async getByNote(noteId: string): Promise<Quiz[]> {
    const db = await this._databaseService.getDB();
    return db.getAllFromIndex(DB_STORES.QUIZZES, DB_INDEXES.BY_NOTE, noteId);
  }

  /**
   * Retrieves a quiz and its child MCQ cards and flashcards.
   */
  public async getQuizWithCards(quizId: string): Promise<QuizWithCards | undefined> {
    const db = await this._databaseService.getDB();
    const quiz = await db.get(DB_STORES.QUIZZES, quizId);
    if (!quiz) {
      return undefined;
    }

    const mcqCards = await db.getAllFromIndex(DB_STORES.MCQ_CARDS, DB_INDEXES.BY_QUIZ, quizId);
    const flashcards = await db.getAllFromIndex(DB_STORES.FLASHCARDS, DB_INDEXES.BY_QUIZ, quizId);
    return { quiz, mcqCards, flashcards };
  }

  /**
   * Calculates next sequential version for a note's quiz.
   */
  protected _calculateNextVersion(existingQuizzes: Quiz[]): number {
    if (existingQuizzes.length === 0) {
      return QuizService._INITIAL_VERSION;
    }
    const maxVersion = Math.max(...existingQuizzes.map((item) => item.version));
    return maxVersion + QuizService._VERSION_INCREMENT;
  }

  /**
   * Saves MCQ cards and their initialized SRS tracking records.
   */
  protected async _saveMCQCards(
    tx: QuizTransaction,
    quizId: string,
    items: CreateMCQInput[],
    nowIso: string
  ): Promise<MCQCard[]> {
    const mcqStore = tx.objectStore(DB_STORES.MCQ_CARDS);
    const srsStore = tx.objectStore(DB_STORES.SRS_CARDS);
    const results: MCQCard[] = [];

    for (const item of items) {
      const card: MCQCard = { ...item, id: uuidv4(), quizId };
      await mcqStore.put(card);
      await srsStore.put(this._buildInitialSRSCard(card.id, 'mcq', nowIso));
      results.push(card);
    }
    return results;
  }

  /**
   * Saves flashcards and their initialized SRS tracking records.
   */
  protected async _saveFlashcards(
    tx: QuizTransaction,
    quizId: string,
    items: CreateFlashcardInput[],
    nowIso: string
  ): Promise<Flashcard[]> {
    const flashcardStore = tx.objectStore(DB_STORES.FLASHCARDS);
    const srsStore = tx.objectStore(DB_STORES.SRS_CARDS);
    const results: Flashcard[] = [];

    for (const item of items) {
      const card: Flashcard = { ...item, id: uuidv4(), quizId, tags: [...item.tags] };
      await flashcardStore.put(card);
      await srsStore.put(this._buildInitialSRSCard(card.id, 'flashcard', nowIso));
      results.push(card);
    }
    return results;
  }

  /**
   * Deletes all MCQ cards and SRS state for a quiz.
   */
  protected async _cascadeDeleteMCQs(tx: QuizTransaction, quizId: string): Promise<void> {
    const mcqs = await tx.objectStore(DB_STORES.MCQ_CARDS).index(DB_INDEXES.BY_QUIZ).getAll(quizId);
    const srsIndex = tx.objectStore(DB_STORES.SRS_CARDS).index(DB_INDEXES.BY_CARD);
    for (const mcq of mcqs) {
      const srsCard = await srsIndex.get(mcq.id);
      if (srsCard) {
        await tx.objectStore(DB_STORES.SRS_CARDS).delete(srsCard.id);
      }
      await tx.objectStore(DB_STORES.MCQ_CARDS).delete(mcq.id);
    }
  }

  /**
   * Deletes all flashcards and SRS state for a quiz.
   */
  protected async _cascadeDeleteFlashcards(tx: QuizTransaction, quizId: string): Promise<void> {
    const cards = await tx.objectStore(DB_STORES.FLASHCARDS).index(DB_INDEXES.BY_QUIZ).getAll(quizId);
    const srsIndex = tx.objectStore(DB_STORES.SRS_CARDS).index(DB_INDEXES.BY_CARD);
    for (const card of cards) {
      const srsCard = await srsIndex.get(card.id);
      if (srsCard) {
        await tx.objectStore(DB_STORES.SRS_CARDS).delete(srsCard.id);
      }
      await tx.objectStore(DB_STORES.FLASHCARDS).delete(card.id);
    }
  }

  /**
   * Enqueues a quiz creation mutation operation if offline.
   */
  protected async _enqueueIfOffline(quizId: string, payload: Record<string, unknown>): Promise<void> {
    if (this._syncQueueService && this._isOffline()) {
      await this._syncQueueService.enqueue(QuizService._ENTITY_TYPE, quizId, QuizService._OP_CREATE, payload);
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


  private _buildInitialSRSCard(cardId: string, cardType: 'mcq' | 'flashcard', nowIso: string): SRSCard {

    return {
      id: uuidv4(),
      cardId,
      cardType,
      repetitions: QuizService._INITIAL_REPETITIONS,
      easinessFactor: QuizService._INITIAL_EASINESS_FACTOR,
      interval: QuizService._INITIAL_INTERVAL,
      nextReview: nowIso,
      lastReview: null,
      totalReviews: QuizService._INITIAL_TOTAL_REVIEWS,
      correctCount: QuizService._INITIAL_CORRECT_COUNT,
    };
  }
}
