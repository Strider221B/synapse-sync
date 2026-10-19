/**
 * Represents a multiple-choice question within a quiz.
 */
export interface MCQCard {
  id: string;
  quizId: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
}
