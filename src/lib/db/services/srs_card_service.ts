import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { SRSCard } from '../models';

import type { SyncQueueService } from './sync_queue_service';

export interface SRSStats {
  totalCards: number;
  cardsDueToday: number;
  masteredCards: number;
}

export type UpdateSRSCardInput = Partial<
  Omit<SRSCard, 'id' | 'cardId' | 'cardType'>
>;

/**
 * Service providing query and review updates for spaced repetition cards (SM-2).
 */
export class SRSCardService {
  private static readonly _ERROR_CARD_NOT_FOUND = 'SRS Card not found';
  private static readonly _MASTERED_MIN_INTERVAL = 21;
  private static readonly _MASTERED_MIN_EASINESS = 2.5;
  private static readonly _ENTITY_TYPE = 'srs_card';
  private static readonly _OP_UPDATE = 'update';

  private readonly _databaseService: DatabaseService;
  private readonly _syncQueueService?: SyncQueueService;

  public constructor(databaseService: DatabaseService, syncQueueService?: SyncQueueService) {
    this._databaseService = databaseService;
    this._syncQueueService = syncQueueService;
  }

  /**
   * Retrieves SRS tracking record for a specific card.
   */
  public async getByCardId(cardId: string): Promise<SRSCard | undefined> {
    const db = await this._databaseService.getDB();
    return db.getFromIndex(DB_STORES.SRS_CARDS, DB_INDEXES.BY_CARD, cardId);
  }

  /**
   * Retrieves all cards due on or before the specified date (default: now).
   */
  public async getDueCards(date?: string | Date): Promise<SRSCard[]> {
    const db = await this._databaseService.getDB();
    const targetIso = this._normalizeDateToIso(date);
    const range = IDBKeyRange.upperBound(targetIso);
    return db.getAllFromIndex(DB_STORES.SRS_CARDS, DB_INDEXES.BY_NEXT_REVIEW, range);
  }

  /**
   * Computes summary statistics across all SRS cards.
   */
  public async getStats(): Promise<SRSStats> {
    const db = await this._databaseService.getDB();
    const allCards = await db.getAll(DB_STORES.SRS_CARDS);
    const nowIso = new Date().toISOString();

    let cardsDueToday = 0;
    let masteredCards = 0;

    for (const card of allCards) {
      if (card.nextReview <= nowIso) {
        cardsDueToday += 1;
      }
      if (
        card.interval >= SRSCardService._MASTERED_MIN_INTERVAL &&
        card.easinessFactor >= SRSCardService._MASTERED_MIN_EASINESS
      ) {
        masteredCards += 1;
      }
    }

    return { totalCards: allCards.length, cardsDueToday, masteredCards };
  }

  /**
   * Updates SM-2 parameters for an SRS card.
   */
  public async update(id: string, input: UpdateSRSCardInput): Promise<SRSCard> {
    const db = await this._databaseService.getDB();
    const existing = await db.get(DB_STORES.SRS_CARDS, id);
    if (!existing) {
      throw new Error(`${SRSCardService._ERROR_CARD_NOT_FOUND}: ${id}`);
    }

    const updated: SRSCard = {
      ...existing,
      ...input,
    };

    await db.put(DB_STORES.SRS_CARDS, updated);
    await this._enqueueIfOffline(id, input as Record<string, unknown>);
    return updated;
  }

  /**
   * Normalizes a Date or string to an ISO string.
   */
  protected _normalizeDateToIso(date?: string | Date): string {
    if (!date) {
      return new Date().toISOString();
    }
    return typeof date === 'string' ? date : date.toISOString();
  }

  /**
   * Enqueues an SRS card update operation when offline.
   */
  protected async _enqueueIfOffline(id: string, payload: Record<string, unknown>): Promise<void> {
    if (this._syncQueueService && this._isOffline()) {
      await this._syncQueueService.enqueue(SRSCardService._ENTITY_TYPE, id, SRSCardService._OP_UPDATE, payload);
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


