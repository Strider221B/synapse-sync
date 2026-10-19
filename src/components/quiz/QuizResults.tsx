'use client';

import React from 'react';
import Link from 'next/link';
import type { MCQCard } from '@/lib/db/models';

export interface QuizResultsProps {
  mcqCards: MCQCard[];
  userAnswers: (number | null)[];
  noteId: string;
  onRetake: () => void;
  onReroll: () => void;
  isRerolling?: boolean;
}

export const QuizResults: React.FC<QuizResultsProps> = ({
  mcqCards,
  userAnswers,
  noteId,
  onRetake,
  onReroll,
  isRerolling = false,
}) => {
  const total = mcqCards.length;
  const correctCount = mcqCards.reduce((acc, card, idx) => {
    return userAnswers[idx] === card.correctIndex ? acc + 1 : acc;
  }, 0);

  const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const isPassed = percentage >= 70;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '2.5rem 2rem',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Header & Score Circle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: isPassed
              ? 'radial-gradient(circle, var(--color-success-bg) 0%, transparent 70%)'
              : 'radial-gradient(circle, var(--color-error-bg) 0%, transparent 70%)',
            border: `3px solid ${isPassed ? 'var(--color-success)' : 'var(--color-error)'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 20px ${isPassed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          <span
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              lineHeight: 1,
            }}
          >
            {percentage}%
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              marginTop: '0.25rem',
            }}
          >
            Score
          </span>
        </div>

        <div>
          <h2
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              margin: '0 0 0.5rem 0',
              color: 'var(--color-text-primary)',
            }}
          >
            {isPassed ? '🎉 Great Job!' : '📚 Keep Practicing!'}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '1.05rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            You answered <strong style={{ color: 'var(--color-text-primary)' }}>{correctCount}</strong> out
            of <strong style={{ color: 'var(--color-text-primary)' }}>{total}</strong> questions correctly.
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          justifyContent: 'center',
          paddingBottom: '1.5rem',
          borderBottom: '1px solid var(--color-surface-border)',
        }}
      >
        <button
          type="button"
          onClick={onRetake}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-primary)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          <span>🔁</span> Retake Quiz
        </button>

        <button
          type="button"
          onClick={onReroll}
          disabled={isRerolling}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent-gradient)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: isRerolling ? 'not-allowed' : 'pointer',
            opacity: isRerolling ? 0.7 : 1,
            boxShadow: 'var(--shadow-glow)',
            transition: 'all var(--transition-fast)',
          }}
        >
          <span>✨</span> {isRerolling ? 'Generating New Quiz...' : 'Generate New Quiz (Re-roll)'}
        </button>

        <Link
          href={`/notes/${noteId}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'transparent',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: '0.9rem',
            textDecoration: 'none',
          }}
        >
          <span>📖</span> Back to Note
        </Link>
      </div>

      {/* Per-Question Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3
          style={{
            fontSize: '1.1rem',
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          Question Breakdown
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mcqCards.map((card, idx) => {
            const userAnswer = userAnswers[idx];
            const isCorrect = userAnswer === card.correctIndex;

            return (
              <div
                key={card.id ?? idx}
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-surface-border)',
                  borderLeft: `4px solid ${isCorrect ? 'var(--color-success)' : 'var(--color-error)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '0.95rem' }}>
                    <span style={{ color: 'var(--color-text-muted)', marginRight: '0.5rem' }}>#{idx + 1}</span>
                    {card.question}
                  </div>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: isCorrect ? 'var(--color-success)' : 'var(--color-error)',
                      flexShrink: 0,
                    }}
                  >
                    {isCorrect ? '✓ Correct' : '✕ Incorrect'}
                  </span>
                </div>

                {!isCorrect && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    Your answer: <strong style={{ color: 'var(--color-error)' }}>{userAnswer !== null ? card.options[userAnswer] : 'None'}</strong>
                    {' • '}
                    Correct answer: <strong style={{ color: 'var(--color-success)' }}>{card.options[card.correctIndex]}</strong>
                  </div>
                )}

                <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                  {card.explanation}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
