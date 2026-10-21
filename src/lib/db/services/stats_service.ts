import { DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { SRSCard } from '../models';

export interface DashboardStats {
  notebooks: number;
  notes: number;
  quizzes: number;
  flashcards: number;
  srsCards: number;
  cardsDueToday: number;
  totalReviewsCompleted: number;
  masteredCards: number;
}

/**
 * Service aggregating dashboard and learning analytics metrics from IndexedDB stores.
 */
export class StatsService {
  private static readonly _MASTERED_MIN_INTERVAL = 21;
  private static readonly _MASTERED_MIN_EASINESS = 2.5;

  private readonly _databaseService: DatabaseService;

  public constructor(databaseService: DatabaseService) {
    this._databaseService = databaseService;
  }

  /**
   * Retrieves summary statistics for the dashboard in a single efficient operation.
   */
  public async getDashboardStats(): Promise<DashboardStats> {
    const db = await this._databaseService.getDB();

    const [notebooksCount, notesCount, quizzesCount, flashcardsCount, srsCardsList] =
      await Promise.all([
        db.count(DB_STORES.NOTEBOOKS),
        db.count(DB_STORES.NOTES),
        db.count(DB_STORES.QUIZZES),
        db.count(DB_STORES.FLASHCARDS),
        db.getAll(DB_STORES.SRS_CARDS),
      ]);

    const srsMetrics = this._calculateSRSMetrics(srsCardsList);

    return {
      notebooks: notebooksCount,
      notes: notesCount,
      quizzes: quizzesCount,
      flashcards: flashcardsCount,
      srsCards: srsCardsList.length,
      cardsDueToday: srsMetrics.cardsDueToday,
      totalReviewsCompleted: srsMetrics.totalReviewsCompleted,
      masteredCards: srsMetrics.masteredCards,
    };
  }

  /**
   * Analyzes SRS cards to calculate due count, total completed reviews, and mastery count.
   */
  private _calculateSRSMetrics(cards: SRSCard[]): {
    cardsDueToday: number;
    totalReviewsCompleted: number;
    masteredCards: number;
  } {
    const nowIso = new Date().toISOString();
    let cardsDueToday = 0;
    let totalReviewsCompleted = 0;
    let masteredCards = 0;

    for (const card of cards) {
      if (card.nextReview <= nowIso) {
        cardsDueToday += 1;
      }
      totalReviewsCompleted += card.repetitions;
      if (
        card.interval >= StatsService._MASTERED_MIN_INTERVAL &&
        card.easinessFactor >= StatsService._MASTERED_MIN_EASINESS
      ) {
        masteredCards += 1;
      }
    }

    return { cardsDueToday, totalReviewsCompleted, masteredCards };
  }
}
