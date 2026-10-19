'use client';

import React from 'react';

export interface ReviewStatsData {
  totalReviewed: number;
  averageQuality: number;
  masteredCount: number; // quality 4-5
  learningCount: number; // quality 3
  strugglingCount: number; // quality 0-2
}

export interface ReviewStatsProps {
  stats: ReviewStatsData;
  onReviewAgain: () => void;
  onBackToDashboard: () => void;
}

export const ReviewStats: React.FC<ReviewStatsProps> = ({
  stats,
  onReviewAgain,
  onBackToDashboard,
}) => {
  const masteryPercentage =
    stats.totalReviewed > 0
      ? Math.round((stats.masteredCount / stats.totalReviewed) * 100)
      : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2rem',
        maxWidth: '620px',
        margin: '0 auto',
        width: '100%',
        padding: '2.5rem 1.5rem',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Celebration Header */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(99, 102, 241, 0.2))',
            border: '2px solid var(--color-success)',
            fontSize: '2rem',
            marginBottom: '1rem',
          }}
        >
          🎉
        </div>
        <h2
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem',
          }}
        >
          Review Session Complete!
        </h2>
        <p
          style={{
            fontSize: '0.925rem',
            color: 'var(--color-text-secondary)',
            maxWidth: '440px',
            margin: '0 auto',
          }}
        >
          Great work! Your memory retention intervals have been updated using the SuperMemo SM-2 algorithm.
        </p>
      </div>

      {/* Primary KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          width: '100%',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1rem',
            backgroundColor: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-surface-border)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--color-primary)',
              lineHeight: 1.2,
            }}
          >
            {stats.totalReviewed}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginTop: '0.25rem',
            }}
          >
            Reviewed
          </div>
        </div>

        <div
          style={{
            padding: '1.25rem 1rem',
            backgroundColor: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-surface-border)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--color-accent)',
              lineHeight: 1.2,
            }}
          >
            {stats.averageQuality.toFixed(1)} / 5
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginTop: '0.25rem',
            }}
          >
            Avg Quality
          </div>
        </div>

        <div
          style={{
            padding: '1.25rem 1rem',
            backgroundColor: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-surface-border)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: 'var(--color-success)',
              lineHeight: 1.2,
            }}
          >
            {masteryPercentage}%
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              marginTop: '0.25rem',
            }}
          >
            Mastered
          </div>
        </div>
      </div>

      {/* Distribution Breakdown */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          padding: '1.25rem',
          backgroundColor: 'var(--color-surface-raised)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-surface-border)',
        }}
      >
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.05em',
          }}
        >
          Recall Performance Distribution
        </span>

        {/* Mastered (4-5) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success)',
              }}
            />
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
              Mastered (Rating 4-5)
            </span>
          </div>
          <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
            {stats.masteredCount} cards
          </span>
        </div>

        {/* Learning (3) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#84cc16',
              }}
            />
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
              Learning (Rating 3)
            </span>
          </div>
          <span style={{ fontWeight: 600, color: '#84cc16' }}>
            {stats.learningCount} cards
          </span>
        </div>

        {/* Struggling (0-2) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-error)',
              }}
            />
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
              Struggling (Rating 0-2)
            </span>
          </div>
          <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>
            {stats.strugglingCount} cards
          </span>
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          width: '100%',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          id="review-again-btn"
          type="button"
          onClick={onReviewAgain}
          style={{
            flex: '1 1 180px',
            padding: '0.875rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-glow)',
            transition: 'all var(--transition-fast)',
            textAlign: 'center',
          }}
        >
          🔄 Review Again
        </button>

        <button
          id="back-to-dashboard-btn"
          type="button"
          onClick={onBackToDashboard}
          style={{
            flex: '1 1 180px',
            padding: '0.875rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-raised)',
            color: 'var(--color-text-primary)',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: '1px solid var(--color-surface-border)',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
            textAlign: 'center',
          }}
        >
          🏠 Back to Dashboard
        </button>
      </div>
    </div>
  );
};
