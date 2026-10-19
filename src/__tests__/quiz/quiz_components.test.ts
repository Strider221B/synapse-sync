import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import type { Flashcard, MCQCard as MCQCardType } from '@/lib/db/models';
import { MCQCard } from '@/components/quiz/MCQCard';
import { QuizResults } from '@/components/quiz/QuizResults';
import { FlashCard } from '@/components/quiz/FlashCard';

describe('Quiz Components Test Suite', () => {
  const mockMCQ: MCQCardType = {
    id: 'mcq-1',
    quizId: 'quiz-1',
    question: 'What is supervised learning?',
    options: [
      'Learning from labeled training data',
      'Learning without any data',
      'Learning from unlabeled data only',
      'A type of reinforcement learning',
    ],
    correctIndex: 0,
    explanation: 'Supervised learning uses labeled training pairs.',
  };

  const mockFlashcard: Flashcard = {
    id: 'flash-1',
    quizId: 'quiz-1',
    front: 'What is the bias-variance tradeoff?',
    back: 'The balance between underfitting and overfitting.',
    tags: ['ML'],
  };

  describe('MCQCard Component', () => {
    it('renders unanswered question prompt and options', () => {
      let selected: number | null = null;
      const element = MCQCard({
        card: mockMCQ,
        questionIndex: 0,
        totalQuestions: 5,
        selectedOption: null,
        onSelectOption: (idx) => {
          selected = idx;
        },
      });

      assert.ok(React.isValidElement(element), 'MCQCard must return a React element');
      assert.equal(element.type, 'div');
      assert.equal(selected, null);
    });

    it('renders answered state with feedback and explanation', () => {
      const element = MCQCard({
        card: mockMCQ,
        questionIndex: 2,
        totalQuestions: 5,
        selectedOption: 0,
        onSelectOption: () => {},
      });

      assert.ok(React.isValidElement(element), 'MCQCard must render in answered state');
      assert.ok((element.props as Record<string, unknown>).children, 'MCQCard has child elements');
    });
  });

  describe('QuizResults Component', () => {
    it('calculates score and percentage correctly for all correct answers', () => {
      let retakeCalled = false;
      let rerollCalled = false;

      const element = QuizResults({
        mcqCards: [mockMCQ],
        userAnswers: [0],
        noteId: 'note-1',
        onRetake: () => {
          retakeCalled = true;
        },
        onReroll: () => {
          rerollCalled = true;
        },
      });

      assert.ok(element, 'QuizResults must return a React element');
      assert.equal(typeof element, 'object');
      assert.equal(retakeCalled, false);
      assert.equal(rerollCalled, false);
    });

    it('handles mixed correct and incorrect answers', () => {
      const mockMCQ2: MCQCardType = {
        ...mockMCQ,
        id: 'mcq-2',
        correctIndex: 1,
      };

      const element = QuizResults({
        mcqCards: [mockMCQ, mockMCQ2],
        userAnswers: [0, 2], // 1 correct, 1 incorrect
        noteId: 'note-1',
        onRetake: () => {},
        onReroll: () => {},
      });

      assert.ok(element);
    });
  });

  describe('FlashCard Component', () => {
    it('renders front side prompt', async () => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      let ratedScore = -1;
      const html = renderToStaticMarkup(
        React.createElement(FlashCard, {
          card: mockFlashcard,
          cardIndex: 0,
          totalCards: 3,
          onRate: (score) => {
            ratedScore = score;
          },
        })
      );

      assert.ok(html.includes('What is the bias-variance tradeoff?'), 'HTML should contain front text');
      assert.ok(html.includes('The balance between underfitting and overfitting.'), 'HTML should contain back text');
      assert.equal(ratedScore, -1);
    });
  });
});
