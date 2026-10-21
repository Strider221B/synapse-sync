'use client';

import React, { useEffect, useState } from 'react';
import { DatabaseService } from '@/lib/db/database_service';
import { StatsService, type DashboardStats } from '@/lib/db/services/stats_service';
import { Skeleton } from '@/components/common/Skeleton';

export function DashboardStatsGrid() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      try {
        const dbService = new DatabaseService();
        const statsService = new StatsService(dbService);
        const data = await statsService.getDashboardStats();
        if (active) {
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to load stats metrics:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStats();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-label="Study Progress Summary">
      <h2
        style={{
          fontSize: '1.25rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: '1rem',
        }}
      >
        Study Analytics
      </h2>

      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" height="110px" />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
          }}
        >
          {[
            {
              label: 'Due Cards Today',
              value: stats?.cardsDueToday ?? 0,
              icon: '⚡',
              badge: (stats?.cardsDueToday ?? 0) > 0 ? 'Needs Attention' : 'All Clear',
            },
            {
              label: 'Total Study Notes',
              value: stats?.notes ?? 0,
              icon: '📚',
              badge: `${stats?.notebooks ?? 0} Notebooks`,
            },
            {
              label: 'Flashcards Active',
              value: stats?.flashcards ?? 0,
              icon: '🔄',
              badge: `${stats?.masteredCards ?? 0} Mastered`,
            },
            {
              label: 'Reviews Completed',
              value: stats?.totalReviewsCompleted ?? 0,
              icon: '🎯',
              badge: `${stats?.quizzes ?? 0} Quizzes`,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="card-interactive"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-surface-raised)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-surface-border-subtle)',
                  }}
                >
                  {stat.badge}
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
