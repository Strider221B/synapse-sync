/**
 * Represents spaced repetition state (SM-2) for a card.
 */
export interface SRSCard {
  id: string;
  cardId: string;
  cardType: 'mcq' | 'flashcard';
  repetitions: number;
  easinessFactor: number;
  interval: number;
  nextReview: string;
  lastReview: string | null;
  totalReviews: number;
  correctCount: number;
}
