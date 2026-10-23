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
  studyStreakDays: number;
  studyStreakYesterday: number;
}

/**
 * Service aggregating dashboard and learning analytics metrics from IndexedDB stores.
 */
export class StatsService {
  private static readonly _MASTERED_MIN_INTERVAL = 21;
  private static readonly _MASTERED_MIN_EASINESS = 2.5;
  private static readonly _DATE_SLICE_LENGTH = 10;
  private static readonly _MS_PER_DAY = 86400000;

  private readonly _databaseService: DatabaseService;

  public constructor(databaseService: DatabaseService) {
    this._databaseService = databaseService;
  }

  /**
   * Retrieves summary statistics for the dashboard in a single efficient operation.
   */
  public async getDashboardStats(isAuthenticated = true): Promise<DashboardStats> {
    if (!isAuthenticated) {
      return this._buildDefaultUnauthenticatedStats();
    }
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
      ...srsMetrics,
    };
  }

  /**
   * Analyzes SRS cards to calculate due count, total completed reviews, and mastery count.
   */
  private _calculateSRSMetrics(cards: SRSCard[]): {
    cardsDueToday: number;
    totalReviewsCompleted: number;
    masteredCards: number;
    studyStreakDays: number;
    studyStreakYesterday: number;
  } {
    const nowIso = new Date().toISOString();
    let cardsDueToday = 0;
    let totalReviewsCompleted = 0;
    let masteredCards = 0;

    for (const card of cards) {
      if (card.nextReview <= nowIso) cardsDueToday += 1;
      totalReviewsCompleted += card.repetitions;
      if (
        card.interval >= StatsService._MASTERED_MIN_INTERVAL &&
        card.easinessFactor >= StatsService._MASTERED_MIN_EASINESS
      ) {
        masteredCards += 1;
      }
    }
    const { streakDays, streakYesterday } = this._computeStreakValues(cards);
    return {
      cardsDueToday,
      totalReviewsCompleted,
      masteredCards,
      studyStreakDays: streakDays,
      studyStreakYesterday: streakYesterday,
    };
  }

  /**
   * Computes streak today and streak yesterday from card review timestamps.
   */
  private _computeStreakValues(cards: SRSCard[]): { streakDays: number; streakYesterday: number } {
    const reviewDates = new Set<string>();
    for (const card of cards) {
      if (card.lastReview) {
        reviewDates.add(card.lastReview.slice(0, StatsService._DATE_SLICE_LENGTH));
      }
    }
    const streakYesterday = this._computeStreakFromOffset(reviewDates, 1);
    const todayStr = new Date().toISOString().slice(0, StatsService._DATE_SLICE_LENGTH);
    const studiedToday = reviewDates.has(todayStr);
    const streakDays = studiedToday ? 1 + streakYesterday : streakYesterday;
    return { streakDays, streakYesterday };
  }

  /**
   * Iterates backward daily from a day offset to count consecutive review days.
   */
  private _computeStreakFromOffset(dates: Set<string>, startOffsetDays: number): number {
    let streak = 0;
    let offset = startOffsetDays;
    while (true) {
      const targetDate = new Date(Date.now() - offset * StatsService._MS_PER_DAY);
      const str = targetDate.toISOString().slice(0, StatsService._DATE_SLICE_LENGTH);
      if (dates.has(str)) {
        streak += 1;
        offset += 1;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Returns default zero-valued statistics when no user account is connected.
   */
  private _buildDefaultUnauthenticatedStats(): DashboardStats {
    return {
      notebooks: 0,
      notes: 0,
      quizzes: 0,
      flashcards: 0,
      srsCards: 0,
      cardsDueToday: 0,
      totalReviewsCompleted: 0,
      masteredCards: 0,
      studyStreakDays: 0,
      studyStreakYesterday: 0,
    };
  }
}
