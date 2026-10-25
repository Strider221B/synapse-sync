import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Flashcard, MCQCard, Note } from '../../lib/db/models';
import { ClipboardService } from '../../lib/utils/clipboard_service';

describe('ClipboardService', () => {
  const service = new ClipboardService();

  const mockMCQ: MCQCard = {
    id: 'mcq-1',
    quizId: 'quiz-1',
    question: 'What is overfitting in machine learning?',
    options: [
      'High bias and low variance',
      'Model performs well on training data but poorly on test data',
      'Model performs equally poorly on all data',
      'A technique for hyperparameter tuning',
    ],
    correctIndex: 1,
    explanation: 'Overfitting occurs when a model fits noise in training data.',
  };

  const mockFlashcard: Flashcard = {
    id: 'flash-1',
    quizId: 'quiz-1',
    front: 'What is the learning rate in gradient descent?',
    back: 'A tuning parameter that determines the step size at each iteration.',
    tags: ['ML'],
  };

  const mockNote: Note = {
    id: 'note-1',
    notebookId: 'nb-1',
    title: 'Machine Learning Introduction',
    content: 'Machine learning is a subfield of artificial intelligence.',
    contentFormat: 'markdown',
    sourceType: 'manual',
    wordCount: 8,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isSynced: false,
  };

  it('formats MCQ card with question, options, correct answer and explanation', () => {
    const formatted = service.formatMCQ(mockMCQ);

    assert.ok(formatted.includes('Question: What is overfitting in machine learning?'));
    assert.ok(formatted.includes('A. High bias and low variance'));
    assert.ok(formatted.includes('B. Model performs well on training data but poorly on test data'));
    assert.ok(formatted.includes('C. Model performs equally poorly on all data'));
    assert.ok(formatted.includes('D. A technique for hyperparameter tuning'));
    assert.ok(
      formatted.includes(
        'Correct Answer: B. Model performs well on training data but poorly on test data'
      )
    );
    assert.ok(formatted.includes('Explanation:'));
    assert.ok(formatted.includes('Overfitting occurs when a model fits noise in training data.'));
  });

  it('formats flashcard with question front and answer back', () => {
    const formatted = service.formatFlashcard(mockFlashcard);

    assert.ok(formatted.includes('Question:'));
    assert.ok(formatted.includes('What is the learning rate in gradient descent?'));
    assert.ok(formatted.includes('Answer:'));
    assert.ok(formatted.includes('A tuning parameter that determines the step size at each iteration.'));
  });

  it('formats open note with title heading and content', () => {
    const formatted = service.formatNote(mockNote);

    assert.equal(
      formatted,
      '# Machine Learning Introduction\n\nMachine learning is a subfield of artificial intelligence.'
    );
  });

  it('formats quiz MCQs bundle with header and separator', () => {
    const formatted = service.formatQuizMCQs([mockMCQ], 'CS229 Exam Prep');

    assert.ok(formatted.includes('# Quiz: CS229 Exam Prep'));
    assert.ok(formatted.includes('--- Question 1 ---'));
    assert.ok(formatted.includes('Question: What is overfitting in machine learning?'));
  });

  it('handles copyToClipboard fallback gracefully in test environment without DOM', async () => {
    const result = await service.copyToClipboard('test copy');
    // In node test environment without browser navigator.clipboard or document.execCommand, returns false gracefully
    assert.equal(typeof result, 'boolean');
  });
});
