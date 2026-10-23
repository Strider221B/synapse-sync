'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useGoogleAuth } from '@/components/auth/GoogleAuthProviderWrapper';
import { DB_STORES } from '@/lib/db/constants';
import { DatabaseService } from '@/lib/db/database_service';
import type { SRSCard } from '@/lib/db/models';
import { SRSCardService } from '@/lib/db/services/srs_card_service';

export interface NotebookMastery {
  notebookId: string;
  notebookName: string;
  totalCards: number;
  masteredCards: number;
  percentage: number;
}

export interface SRSWidgetData {
  dueCount: number;
  totalCards: number;
  studyStreakDays: number;
  studyStreakYesterday: number;
  notebooksMastery: NotebookMastery[];
  nextReviewDate: string | null;
  overallMasteryPercentage: number;
}

export const SRSDashboardWidget: React.FC = () => {
  const { isAuthenticated } = useGoogleAuth();
  const [data, setData] = useState<SRSWidgetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function computeStats() {
      if (!isAuthenticated) {
        if (active) {
          setData({
            dueCount: 0,
            totalCards: 0,
            studyStreakDays: 0,
            studyStreakYesterday: 0,
            notebooksMastery: [],
            nextReviewDate: null,
            overallMasteryPercentage: 0,
          });
          setIsLoading(false);
        }
        return;
      }

      try {
        const dbService = new DatabaseService();
        const srsService = new SRSCardService(dbService);
        const db = await dbService.getDB();

        const [rawDue, allSrs, notebooks, notes, quizzes, mcqs, flashcards] = await Promise.all([
          srsService.getDueCards(),
          db.getAll(DB_STORES.SRS_CARDS),
          db.getAll(DB_STORES.NOTEBOOKS),
          db.getAll(DB_STORES.NOTES),
          db.getAll(DB_STORES.QUIZZES),
          db.getAll(DB_STORES.MCQ_CARDS),
          db.getAll(DB_STORES.FLASHCARDS),
        ]);

        if (!active) return;

        // Calculate Streak
        const { streakToday, streakYesterday } = calculateStreakValues(allSrs);

        // Find Next Review Date among non-due cards
        const nowIso = new Date().toISOString();
        const futureCards = allSrs
          .filter((card) => card.nextReview > nowIso)
          .sort((a, b) => a.nextReview.localeCompare(b.nextReview));
        const nextReviewDate = futureCards.length > 0 ? futureCards[0].nextReview : null;

        // Map Card ID -> Quiz ID
        const cardToQuizMap = new Map<string, string>();
        for (const mcq of mcqs) cardToQuizMap.set(mcq.id, mcq.quizId);
        for (const fc of flashcards) cardToQuizMap.set(fc.id, fc.quizId);

        // Map Quiz ID -> Note ID
        const quizToNoteMap = new Map<string, string>();
        for (const q of quizzes) quizToNoteMap.set(q.id, q.noteId);

        // Map Note ID -> Notebook ID
        const noteToNotebookMap = new Map<string, string>();
        for (const note of notes) noteToNotebookMap.set(note.id, note.notebookId);

        // Notebook Name Lookup
        const notebookNames = new Map<string, string>();
        for (const nb of notebooks) notebookNames.set(nb.id, nb.name);

        // Compute Mastery per Notebook
        const nbStatsMap = new Map<string, { total: number; mastered: number }>();
        let overallMastered = 0;

        for (const srs of allSrs) {
          const quizId = cardToQuizMap.get(srs.cardId);
          const noteId = quizId ? quizToNoteMap.get(quizId) : undefined;
          const notebookId = noteId ? noteToNotebookMap.get(noteId) : undefined;

          const isMastered = srs.interval > 21;
          if (isMastered) overallMastered += 1;

          if (notebookId) {
            const current = nbStatsMap.get(notebookId) || { total: 0, mastered: 0 };
            current.total += 1;
            if (isMastered) current.mastered += 1;
            nbStatsMap.set(notebookId, current);
          }
        }

        const notebooksMastery: NotebookMastery[] = [];
        for (const [nbId, stats] of nbStatsMap.entries()) {
          const name = notebookNames.get(nbId) || 'General Study';
          const percentage = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
          notebooksMastery.push({
            notebookId: nbId,
            notebookName: name,
            totalCards: stats.total,
            masteredCards: stats.mastered,
            percentage,
          });
        }

        const overallMasteryPercentage =
          allSrs.length > 0 ? Math.round((overallMastered / allSrs.length) * 100) : 0;

        setData({
          dueCount: rawDue.length,
          totalCards: allSrs.length,
          studyStreakDays: streakToday,
          studyStreakYesterday: streakYesterday,
          notebooksMastery,
          nextReviewDate,
          overallMasteryPercentage,
        });
      } catch (err) {
        console.error('Failed to compute SRS dashboard stats:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    computeStats();

    const handleRefresh = () => {
      computeStats();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('synapse-sync-completed', handleRefresh);
      window.addEventListener('synapse-auth-changed', handleRefresh);
    }

    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('synapse-sync-completed', handleRefresh);
        window.removeEventListener('synapse-auth-changed', handleRefresh);
      }
    };
  }, [isAuthenticated]);

  if (isLoading || !data) {
    return (
      <div
        style={{
          padding: '1.5rem',
          borderRadius: 'var(--radius-xl)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '180px',
        }}
      >
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Loading Spaced Repetition stats...
        </span>
      </div>
    );
  }

  const formatNextReview = (isoStr: string | null): string => {
    if (!isoStr) return 'No upcoming reviews';
    const date = new Date(isoStr);
    const now = new Date();
    const diffHours = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60));

    if (diffHours <= 0) return 'Due today';
    if (diffHours < 24) return `In ${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return 'Tomorrow';
    return `In ${diffDays} days (${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        padding: '1.75rem',
        borderRadius: 'var(--radius-xl)',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {/* Widget Header & Call to Action */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.35rem',
            }}
          >
            🧠
          </div>
          <div>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              Spaced Repetition Review
            </h2>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              SM-2 Active Recall & Long-Term Memory
            </p>
          </div>
        </div>

        <Link
          id="widget-review-cta"
          href="/review"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: data.dueCount > 0 ? 'var(--color-primary)' : 'var(--color-surface-raised)',
            color: data.dueCount > 0 ? '#ffffff' : 'var(--color-text-primary)',
            border: data.dueCount > 0 ? 'none' : '1px solid var(--color-surface-border)',
            fontWeight: 600,
            fontSize: '0.875rem',
            textDecoration: 'none',
            boxShadow: data.dueCount > 0 ? 'var(--shadow-glow)' : 'none',
            transition: 'all var(--transition-fast)',
          }}
        >
          <span>{data.dueCount > 0 ? '⚡ Start Daily Review' : '👁️ View Queue'}</span>
          {data.dueCount > 0 && (
            <span
              style={{
                padding: '0.15rem 0.45rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(255, 255, 255, 0.25)',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              {data.dueCount}
            </span>
          )}
        </Link>
      </div>

      {/* KPI Stats Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Due Cards */}
        <Link
          href="/review"
          style={{
            textDecoration: 'none',
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-surface-raised)',
            border: data.dueCount > 0
              ? '1px solid rgba(99, 102, 241, 0.4)'
              : '1px solid var(--color-surface-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transition: 'all var(--transition-fast)',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>Due Today</span>
            {data.dueCount > 0 && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-error)',
                }}
              />
            )}
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: data.dueCount > 0 ? 'var(--color-primary)' : 'var(--color-text-primary)',
            }}
          >
            {data.dueCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            of {data.totalCards} total cards
          </div>
        </Link>

        {/* Study Streak */}
        <div
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
            }}
          >
            Study Streak
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span>🔥</span>
            <span>{data.studyStreakDays} {data.studyStreakDays === 1 ? 'day' : 'days'}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Yesterday: {data.studyStreakYesterday} {data.studyStreakYesterday === 1 ? 'day' : 'days'}
          </div>
        </div>

        {/* Overall Mastery */}
        <div
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
            }}
          >
            Overall Mastery
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--color-success)',
            }}
          >
            {data.overallMasteryPercentage}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Interval &gt; 21 days
          </div>
        </div>

        {/* Next Batch Due */}
        <div
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
            }}
          >
            Next Due Batch
          </div>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              lineHeight: 1.4,
            }}
          >
            {formatNextReview(data.nextReviewDate)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Automatic scheduling
          </div>
        </div>
      </div>

      {/* Notebook Mastery Breakdown */}
      {data.notebooksMastery.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginTop: '0.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--color-surface-border)',
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-muted)',
            }}
          >
            Mastery Progress per Notebook
          </span>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {data.notebooksMastery.slice(0, 4).map((nb) => (
              <div
                key={nb.notebookId}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-surface-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '160px',
                    }}
                  >
                    {nb.notebookName}
                  </span>
                  <span style={{ color: 'var(--color-success)' }}>{nb.percentage}%</span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    width: '100%',
                    height: '5px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: 'var(--radius-full)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${nb.percentage}%`,
                      height: '100%',
                      backgroundColor: 'var(--color-success)',
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {nb.masteredCards} of {nb.totalCards} cards well-learned
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Calculates consecutive daily review streak and yesterday's streak from SRS cards.
 */
function calculateStreakValues(cards: SRSCard[]): { streakToday: number; streakYesterday: number } {
  const reviewDates = new Set<string>();
  for (const card of cards) {
    if (card.lastReview) {
      reviewDates.add(card.lastReview.slice(0, 10));
    }
  }

  if (reviewDates.size === 0) return { streakToday: 0, streakYesterday: 0 };

  const formatOffsetDate = (offsetDays: number): string => {
    const d = new Date(Date.now() - offsetDays * 86400000);
    return d.toISOString().slice(0, 10);
  };

  let streakYesterday = 0;
  let offset = 1;
  while (true) {
    const checkStr = formatOffsetDate(offset);
    if (reviewDates.has(checkStr)) {
      streakYesterday += 1;
      offset += 1;
    } else {
      break;
    }
  }

  const todayStr = formatOffsetDate(0);
  const studiedToday = reviewDates.has(todayStr);
  const streakToday = studiedToday ? 1 + streakYesterday : streakYesterday;

  return { streakToday, streakYesterday };
}
