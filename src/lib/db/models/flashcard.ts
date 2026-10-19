/**
 * Represents an active-recall flashcard within a quiz.
 */
export interface Flashcard {
  id: string;
  quizId: string;
  front: string;
  back: string;
  tags: string[];
}
