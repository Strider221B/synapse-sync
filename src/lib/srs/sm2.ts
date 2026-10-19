import type { SRSCard } from '../db/models';

export interface SM2Result {
  repetitions: number;
  easinessFactor: number;
  interval: number;
  nextReview: string;
}

/**
 * Pure engine implementing the SuperMemo SM-2 spaced repetition algorithm.
 */
export class SM2Engine {
  private static readonly _MIN_QUALITY = 0;
  private static readonly _MAX_QUALITY = 5;
  private static readonly _MIN_PASSING_QUALITY = 3;
  private static readonly _MIN_EASINESS_FACTOR = 1.3;
  private static readonly _FIRST_INTERVAL = 1;
  private static readonly _SECOND_INTERVAL = 6;
  private static readonly _FAILED_INTERVAL = 1;
  private static readonly _FAILED_REPETITIONS = 0;

  public constructor() {}

  /**
   * Calculates new SM-2 parameters for a given card and user quality rating (0-5).
   */
  public calculate(card: SRSCard, quality: number, now: Date = new Date()): SM2Result {
    return SM2Engine.calculate(card, quality, now);
  }

  /**
   * Static calculation method for computing new SM-2 parameters.
   */
  public static calculate(card: SRSCard, quality: number, now: Date = new Date()): SM2Result {
    const clampedQ = SM2Engine._clampQuality(quality);
    const newEf = SM2Engine._calculateEasinessFactor(card.easinessFactor, clampedQ);
    const { repetitions, interval } = SM2Engine._calculateRepetitionsAndInterval(
      card.repetitions,
      card.interval,
      newEf,
      clampedQ
    );
    const nextReview = SM2Engine._calculateNextReviewDate(interval, now);

    return {
      repetitions,
      easinessFactor: newEf,
      interval,
      nextReview,
    };
  }

  /**
   * Clamps user rating between 0 and 5 inclusive.
   */
  private static _clampQuality(quality: number): number {
    if (quality < SM2Engine._MIN_QUALITY) {
      return SM2Engine._MIN_QUALITY;
    }
    if (quality > SM2Engine._MAX_QUALITY) {
      return SM2Engine._MAX_QUALITY;
    }
    return Math.round(quality);
  }

  /**
   * Updates Easiness Factor according to the SM-2 formula with a 1.3 floor.
   */
  private static _calculateEasinessFactor(currentEf: number, quality: number): number {
    const diff = 5 - quality;
    const factorAdjustment = 0.1 - diff * (0.08 + diff * 0.02);
    const updatedEf = currentEf + factorAdjustment;
    const flooredEf = Math.max(SM2Engine._MIN_EASINESS_FACTOR, updatedEf);
    return Number(flooredEf.toFixed(4));
  }

  /**
   * Calculates interval in days and sequential repetition count based on quality.
   */
  private static _calculateRepetitionsAndInterval(
    repetitions: number,
    currentInterval: number,
    easinessFactor: number,
    quality: number
  ): { repetitions: number; interval: number } {
    if (quality < SM2Engine._MIN_PASSING_QUALITY) {
      return {
        repetitions: SM2Engine._FAILED_REPETITIONS,
        interval: SM2Engine._FAILED_INTERVAL,
      };
    }

    if (repetitions === 0) {
      return {
        repetitions: 1,
        interval: SM2Engine._FIRST_INTERVAL,
      };
    }

    if (repetitions === 1) {
      return {
        repetitions: 2,
        interval: SM2Engine._SECOND_INTERVAL,
      };
    }

    const nextInterval = Math.round(currentInterval * easinessFactor);
    return {
      repetitions: repetitions + 1,
      interval: nextInterval,
    };
  }

  /**
   * Calculates the next review timestamp in ISO format by adding interval days.
   */
  private static _calculateNextReviewDate(interval: number, now: Date): string {
    const reviewDate = new Date(now.getTime());
    reviewDate.setDate(reviewDate.getDate() + interval);
    return reviewDate.toISOString();
  }
}
