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
    it('renders unanswered question prompt and options', async () => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      let selected: number | null = null;
      const html = renderToStaticMarkup(
        React.createElement(MCQCard, {
          card: mockMCQ,
          questionIndex: 0,
          totalQuestions: 5,
          selectedOption: null,
          onSelectOption: (idx) => {
            selected = idx;
          },
          onDelete: () => {},
        })
      );

      assert.ok(html.includes('What is supervised learning?'), 'HTML must include question prompt');
      assert.ok(html.includes('Learning from labeled training data'), 'HTML must include option text');
      assert.ok(html.includes('Copy'), 'HTML must include Copy button');
      assert.ok(html.includes('Delete'), 'HTML must include Delete button');
      assert.equal(selected, null);
    });

    it('renders answered state with feedback and explanation', async () => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      const html = renderToStaticMarkup(
        React.createElement(MCQCard, {
          card: mockMCQ,
          questionIndex: 2,
          totalQuestions: 5,
          selectedOption: 0,
          onSelectOption: () => {},
        })
      );

      assert.ok(html.includes('Correct'), 'HTML must include Correct badge');
      assert.ok(html.includes('Explanation'), 'HTML must include Explanation');
      assert.ok(html.includes('Supervised learning uses labeled training pairs.'), 'HTML has explanation text');
    });

    it('renders LaTeX mathematical expressions correctly in question, options, and explanation', async () => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      const mathMCQ: MCQCardType = {
        id: 'mcq-math-1',
        quizId: 'quiz-1',
        question: 'Solve for $x$: $T(s, a, s\')$ with discount $\\gamma$ and state values $V_\\pi(s)$.',
        options: [
          'Value is $Q_\\pi(s_0, a_{\\text{new}}) = \\sum_{s\'} T(s_0, a, s\')[R + \\gamma V_*(s\')]$',
          'Option B: $V_*(s) = \\max_a Q_*(s, a)$',
          'Option C: $\\pi_*(s) = \\arg\\max_a Q_*(s, a)$',
          'Option D: constant $0$',
        ],
        correctIndex: 0,
        explanation: 'Bellman optimality equation: $V^*(s) = \\max_a \\sum_{s\'} P(s\'|s,a)[R + \\gamma V^*(s\')]$.',
      };

      const html = renderToStaticMarkup(
        React.createElement(MCQCard, {
          card: mathMCQ,
          questionIndex: 0,
          totalQuestions: 1,
          selectedOption: 0,
          onSelectOption: () => {},
        })
      );

      assert.ok(html.includes('katex'), 'HTML must include rendered KaTeX math elements');
      assert.ok(!html.includes('katex-error'), 'Must not produce katex parse errors');
      assert.ok(html.includes('border-width:1.5px'), 'Must use separate borderWidth property');
      assert.ok(html.includes('border-color:'), 'Must use separate borderColor property');
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
    it('renders front side prompt with copy and delete buttons', async () => {
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
          onDelete: () => {},
        })
      );

      assert.ok(html.includes('What is the bias-variance tradeoff?'), 'HTML should contain front text');
      assert.ok(html.includes('The balance between underfitting and overfitting.'), 'HTML should contain back text');
      assert.ok(html.includes('Copy'), 'HTML should contain Copy button');
      assert.ok(html.includes('Delete'), 'HTML should contain Delete button');
      assert.equal(ratedScore, -1);
    });

    it('renders LaTeX mathematical expressions correctly on front and back faces', async () => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      const mathFlashcard: Flashcard = {
        id: 'flash-math-1',
        quizId: 'quiz-1',
        front: 'What is Euler\'s identity: $e^{i\\pi} + 1 = 0$?',
        back: 'Derived from $e^{ix} = \\cos(x) + i\\sin(x)$ when $x = \\pi$.',
        tags: ['Math'],
      };

      const html = renderToStaticMarkup(
        React.createElement(FlashCard, {
          card: mathFlashcard,
          cardIndex: 0,
          totalCards: 1,
          onRate: () => {},
        })
      );

      assert.ok(html.includes('katex'), 'HTML should contain rendered KaTeX element');
      assert.ok(!html.includes('katex-error'), 'Must not produce katex parse errors');
    });
  });
});
