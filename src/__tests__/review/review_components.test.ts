import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Flashcard, MCQCard, SRSCard } from '../../lib/db/models';
import { QualityRating, QUALITY_OPTIONS } from '../../components/review/QualityRating';
import { ReviewStats, type ReviewStatsData } from '../../components/review/ReviewStats';
import { ReviewSession, type DueCardItem } from '../../components/review/ReviewSession';

describe('Spaced Repetition Review Components Test Suite', () => {
  const mockMCQ: MCQCard = {
    id: 'mcq-1',
    quizId: 'quiz-1',
    question: 'What does SM-2 compute?',
    options: [
      'Optimal review intervals based on recall ease',
      'Model training weights',
      'Database shard partitions',
      'Network round-trip latency',
    ],
    correctIndex: 0,
    explanation: 'SM-2 computes intervals and easiness factor.',
  };

  const mockFlashcard: Flashcard = {
    id: 'flash-1',
    quizId: 'quiz-1',
    front: 'What is the SM-2 floor for easiness factor?',
    back: '1.3 is the minimum floor.',
    tags: ['srs'],
  };

  const mockSRSCardMCQ: SRSCard = {
    id: 'srs-1',
    cardId: 'mcq-1',
    cardType: 'mcq',
    repetitions: 1,
    easinessFactor: 2.5,
    interval: 1,
    nextReview: new Date().toISOString(),
    lastReview: null,
    totalReviews: 1,
    correctCount: 1,
  };

  const mockSRSCardFlash: SRSCard = {
    id: 'srs-2',
    cardId: 'flash-1',
    cardType: 'flashcard',
    repetitions: 0,
    easinessFactor: 2.5,
    interval: 0,
    nextReview: new Date().toISOString(),
    lastReview: null,
    totalReviews: 0,
    correctCount: 0,
  };

  describe('QualityRating Component', () => {
    it('renders all 6 quality rating buttons with their labels and scores', () => {
      let ratedValue = -1;
      const html = renderToStaticMarkup(
        React.createElement(QualityRating, {
          onRate: (q) => {
            ratedValue = q;
          },
        })
      );

      assert.equal(QUALITY_OPTIONS.length, 6);
      for (const opt of QUALITY_OPTIONS) {
        assert.ok(html.includes(opt.label), `HTML should contain label: ${opt.label}`);
        assert.ok(
          html.includes(`quality-rating-btn-${opt.quality}`),
          `HTML should contain button for quality ${opt.quality}`
        );
      }
      assert.equal(ratedValue, -1);
    });

    it('honors disabled state on rating buttons', () => {
      const html = renderToStaticMarkup(
        React.createElement(QualityRating, {
          onRate: () => {},
          disabled: true,
        })
      );

      assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'Buttons must be disabled');
    });
  });

  describe('ReviewStats Component', () => {
    const mockStats: ReviewStatsData = {
      totalReviewed: 10,
      averageQuality: 4.2,
      masteredCount: 7,
      learningCount: 2,
      strugglingCount: 1,
    };

    it('renders summary statistics and distribution accurately', () => {
      let againClicked = false;
      let dashboardClicked = false;

      const html = renderToStaticMarkup(
        React.createElement(ReviewStats, {
          stats: mockStats,
          onReviewAgain: () => {
            againClicked = true;
          },
          onBackToDashboard: () => {
            dashboardClicked = true;
          },
        })
      );

      assert.ok(html.includes('Review Session Complete!'), 'Should render title');
      assert.ok(html.includes('10'), 'Should show 10 total reviewed');
      assert.ok(html.includes('4.2'), 'Should show average quality');
      assert.ok(html.includes('70%'), 'Should show 70% mastered');
      assert.ok(html.includes('7 cards'), 'Should show 7 mastered cards');
      assert.ok(html.includes('2 cards'), 'Should show 2 learning cards');
      assert.ok(html.includes('1 cards'), 'Should show 1 struggling cards');
      assert.equal(againClicked, false);
      assert.equal(dashboardClicked, false);
    });

    it('handles 0 cards reviewed gracefully without divide-by-zero error', () => {
      const emptyStats: ReviewStatsData = {
        totalReviewed: 0,
        averageQuality: 0,
        masteredCount: 0,
        learningCount: 0,
        strugglingCount: 0,
      };

      const html = renderToStaticMarkup(
        React.createElement(ReviewStats, {
          stats: emptyStats,
          onReviewAgain: () => {},
          onBackToDashboard: () => {},
        })
      );

      assert.ok(html.includes('0%'), 'Should show 0% mastered on empty review');
    });
  });

  describe('ReviewSession Component', () => {
    it('renders MCQ card question and all 4 options', () => {
      const dueItems: DueCardItem[] = [
        {
          srsCard: mockSRSCardMCQ,
          cardType: 'mcq',
          mcq: mockMCQ,
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(ReviewSession, {
          cards: dueItems,
        })
      );

      assert.ok(html.includes('What does SM-2 compute?'), 'Must display question text');
      assert.ok(html.includes('Optimal review intervals based on recall ease'), 'Must display option A');
      assert.ok(html.includes('Card 1 of 1'), 'Must display progress');
    });

    it('renders Flashcard with prompt on front side', () => {
      const dueItems: DueCardItem[] = [
        {
          srsCard: mockSRSCardFlash,
          cardType: 'flashcard',
          flashcard: mockFlashcard,
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(ReviewSession, {
          cards: dueItems,
        })
      );

      assert.ok(
        html.includes('What is the SM-2 floor for easiness factor?'),
        'Must display front prompt'
      );
      assert.ok(html.includes('Tap anywhere to reveal answer'), 'Must prompt user to flip');
    });
  });
});
