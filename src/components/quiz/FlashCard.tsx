'use client';

import React, { useState } from 'react';
import type { Flashcard } from '@/lib/db/models';

export interface FlashCardProps {
  card: Flashcard;
  cardIndex: number;
  totalCards: number;
  onRate: (quality: number) => void;
  isRating?: boolean;
}

const QUALITY_RATINGS = [
  { score: 0, label: 'Blackout', color: '#ef4444' },
  { score: 1, label: 'Wrong', color: '#f97316' },
  { score: 2, label: 'Hard', color: '#f59e0b' },
  { score: 3, label: 'Good', color: '#3b82f6' },
  { score: 4, label: 'Easy', color: '#10b981' },
  { score: 5, label: 'Perfect', color: '#6366f1' },
];

export const FlashCard: React.FC<FlashCardProps> = ({
  card,
  cardIndex,
  totalCards,
  onRate,
  isRating = false,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        maxWidth: '680px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Header index */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '0.85rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span>
          Flashcard {cardIndex + 1} of {totalCards}
        </span>
        <span>{isFlipped ? 'Answer (Back)' : 'Question (Front)'}</span>
      </div>

      {/* 3D Flip Card Container */}
      <div
        className="flashcard-perspective"
        onClick={handleFlip}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleFlip();
          }
        }}
        style={{
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <div className={`flashcard-inner ${isFlipped ? 'is-flipped' : ''}`}>
          {/* Front Face */}
          <div className="flashcard-face">
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--color-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '1rem',
              }}
            >
              Question / Prompt
            </span>
            <p
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                lineHeight: 1.6,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              {card.front}
            </p>
            <span
              style={{
                marginTop: '1.5rem',
                fontSize: '0.8rem',
                color: 'var(--color-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              🔄 Tap or press Space to reveal answer
            </span>
          </div>

          {/* Back Face */}
          <div className="flashcard-face flashcard-back">
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--color-success)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '1rem',
              }}
            >
              Answer / Explanation
            </span>
            <p
              style={{
                fontSize: '1.15rem',
                fontWeight: 500,
                lineHeight: 1.6,
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              {card.back}
            </p>
            <span
              style={{
                marginTop: '1.5rem',
                fontSize: '0.8rem',
                color: 'var(--color-text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              🔄 Tap to flip back
            </span>
          </div>
        </div>
      </div>

      {/* SM-2 Quality Rating Buttons (visible once flipped) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem',
          opacity: isFlipped ? 1 : 0.25,
          pointerEvents: isFlipped && !isRating ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      >
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
          }}
        >
          Rate your recall quality:
        </span>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          {QUALITY_RATINGS.map((item) => (
            <button
              key={item.score}
              type="button"
              disabled={!isFlipped || isRating}
              onClick={() => {
                setIsFlipped(false);
                onRate(item.score);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0.6rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                border: `1.5px solid var(--color-surface-border)`,
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                minWidth: '68px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.color;
                e.currentTarget.style.boxShadow = `0 0 10px ${item.color}33`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-surface-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontWeight: 800, fontSize: '1rem', color: item.color }}>
                {item.score}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
