'use client';

import React from 'react';

export interface QualityOption {
  quality: number;
  label: string;
  sublabel: string;
  color: string;
  borderColor: string;
  bgHover: string;
}

export interface QualityRatingProps {
  onRate: (quality: number) => void;
  disabled?: boolean;
}

export const QUALITY_OPTIONS: readonly QualityOption[] = [
  {
    quality: 0,
    label: 'Blackout',
    sublabel: 'Complete blank',
    color: '#ef4444',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    bgHover: 'rgba(239, 68, 68, 0.15)',
  },
  {
    quality: 1,
    label: 'Incorrect',
    sublabel: 'Remembered after',
    color: '#f97316',
    borderColor: 'rgba(249, 115, 22, 0.4)',
    bgHover: 'rgba(249, 115, 22, 0.15)',
  },
  {
    quality: 2,
    label: 'Wrong but easy',
    sublabel: 'Careless mistake',
    color: '#eab308',
    borderColor: 'rgba(234, 179, 8, 0.4)',
    bgHover: 'rgba(234, 179, 8, 0.15)',
  },
  {
    quality: 3,
    label: 'Correct, hard',
    sublabel: 'Significant effort',
    color: '#84cc16',
    borderColor: 'rgba(132, 204, 22, 0.4)',
    bgHover: 'rgba(132, 204, 22, 0.15)',
  },
  {
    quality: 4,
    label: 'Correct, hesitant',
    sublabel: 'Slight hesitation',
    color: '#10b981',
    borderColor: 'rgba(16, 185, 129, 0.4)',
    bgHover: 'rgba(16, 185, 129, 0.15)',
  },
  {
    quality: 5,
    label: 'Perfect',
    sublabel: 'Instant recall',
    color: '#3b82f6',
    borderColor: 'rgba(59, 130, 246, 0.4)',
    bgHover: 'rgba(59, 130, 246, 0.15)',
  },
];

export const QualityRating: React.FC<QualityRatingProps> = ({ onRate, disabled = false }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-muted)',
          }}
        >
          Rate your recall
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
          }}
        >
          SM-2 Adaptive Spacing
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))',
          gap: '0.625rem',
          width: '100%',
        }}
      >
        {QUALITY_OPTIONS.map((item) => (
          <button
            key={item.quality}
            id={`quality-rating-btn-${item.quality}`}
            type="button"
            disabled={disabled}
            onClick={() => onRate(item.quality)}
            aria-label={`Rate ${item.quality}: ${item.label}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.75rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${item.borderColor}`,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
              transition: 'all var(--transition-fast)',
              outline: 'none',
              gap: '0.25rem',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = item.bgHover;
                e.currentTarget.style.borderColor = item.color;
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = `0 4px 12px ${item.borderColor}`;
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'var(--color-surface)';
                e.currentTarget.style.borderColor = item.borderColor;
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            <span
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: item.color,
                lineHeight: 1,
              }}
            >
              {item.quality}
            </span>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: '0.675rem',
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {item.sublabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
