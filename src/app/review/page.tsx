'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DB_STORES } from '@/lib/db/constants';
import { DatabaseService } from '@/lib/db/database_service';
import { SRSCardService } from '@/lib/db/services/srs_card_service';
import { ReviewSession, type DueCardItem } from '@/components/review/ReviewSession';

export default function ReviewPage() {
  const [dueCards, setDueCards] = useState<DueCardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inSession, setInSession] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchDueCards() {
      try {
        const dbService = new DatabaseService();
        const srsService = new SRSCardService(dbService);
        const db = await dbService.getDB();

        const rawDue = await srsService.getDueCards();
        const items: DueCardItem[] = [];

        for (const srsCard of rawDue) {
          if (srsCard.cardType === 'mcq') {
            const mcq = await db.get(DB_STORES.MCQ_CARDS, srsCard.cardId);
            if (mcq) {
              items.push({ srsCard, cardType: 'mcq', mcq });
            }
          } else if (srsCard.cardType === 'flashcard') {
            const flashcard = await db.get(DB_STORES.FLASHCARDS, srsCard.cardId);
            if (flashcard) {
              items.push({ srsCard, cardType: 'flashcard', flashcard });
            }
          }
        }

        // Sort by urgency: most overdue first
        items.sort((a, b) => a.srsCard.nextReview.localeCompare(b.srsCard.nextReview));

        if (active) {
          setDueCards(items);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to load review queue:', err);
        if (active) {
          setIsLoading(false);
        }
      }
    }

    fetchDueCards();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          gap: '1rem',
          color: 'var(--color-text-secondary)',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--color-surface-border)',
            borderTopColor: 'var(--color-primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <p style={{ fontSize: '0.95rem' }}>Loading your spaced repetition queue...</p>
      </div>
    );
  }

  if (inSession && dueCards.length > 0) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <ReviewSession
          cards={dueCards}
          onFinishSession={() => {
            setInSession(false);
            setReloadKey((prev) => prev + 1);
          }}
          onReviewAgain={() => {
            setInSession(false);
            setReloadKey((prev) => prev + 1);
          }}
        />
      </div>
    );
  }

  const mcqCount = dueCards.filter((c) => c.cardType === 'mcq').length;
  const flashCount = dueCards.filter((c) => c.cardType === 'flashcard').length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        maxWidth: '800px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.25rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-primary-light)',
              border: '1px solid var(--color-primary-glow)',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--color-primary)',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            🧠 Spaced Repetition (SM-2)
          </div>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--color-text-primary)',
            }}
          >
            Daily Review Queue
          </h1>
          <p
            style={{
              fontSize: '0.95rem',
              color: 'var(--color-text-secondary)',
              marginTop: '0.25rem',
            }}
          >
            Keep your knowledge retention sharp with automated intervals.
          </p>
        </div>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-secondary)',
            fontSize: '0.85rem',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          ← Dashboard
        </Link>
      </div>

      {/* Due Cards State */}
      {dueCards.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-surface-border)',
            textAlign: 'center',
            gap: '1.25rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              fontSize: '3.5rem',
              lineHeight: 1,
            }}
          >
            🎉
          </div>
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            All caught up!
          </h2>
          <p
            style={{
              fontSize: '0.95rem',
              color: 'var(--color-text-secondary)',
              maxWidth: '460px',
              lineHeight: 1.6,
            }}
          >
            No cards due for review today. You are maintaining optimal recall intervals across all your notes and quizzes!
          </p>

          <div
            style={{
              display: 'flex',
              gap: '1rem',
              marginTop: '1rem',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Link
              href="/quizzes"
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.875rem',
                textDecoration: 'none',
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              Explore Quizzes
            </Link>
            <Link
              href="/notes"
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-raised)',
                color: 'var(--color-text-primary)',
                fontWeight: 600,
                fontSize: '0.875rem',
                textDecoration: 'none',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              View Study Notes
            </Link>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {/* Main Action Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2rem',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-surface-border)',
              boxShadow: 'var(--shadow-md)',
              flexWrap: 'wrap',
              gap: '1.5rem',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                You have {dueCards.length} {dueCards.length === 1 ? 'card' : 'cards'} to review today
              </div>
              <div
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--color-text-muted)',
                  marginTop: '0.35rem',
                  display: 'flex',
                  gap: '1rem',
                }}
              >
                <span>📝 {mcqCount} MCQs</span>
                <span>•</span>
                <span>🔄 {flashCount} Flashcards</span>
              </div>
            </div>

            <button
              id="start-review-session-btn"
              type="button"
              onClick={() => setInSession(true)}
              style={{
                padding: '0.875rem 2rem',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '1rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-glow)',
                transition: 'all var(--transition-fast)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>🚀</span> Start Review
            </button>
          </div>

          {/* Queue Preview List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              Queue Preview (Sorted by Urgency)
            </h2>

            {dueCards.slice(0, 10).map((item) => {
              const isOverdue = new Date(item.srsCard.nextReview) < new Date();
              return (
                <div
                  key={item.srsCard.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.25rem',
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-surface-border)',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <span style={{ fontSize: '1.1rem' }}>
                      {item.cardType === 'mcq' ? '📝' : '🔄'}
                    </span>
                    <span
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.cardType === 'mcq'
                        ? item.mcq?.question
                        : item.flashcard?.front}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isOverdue
                          ? 'var(--color-error-bg)'
                          : 'var(--color-primary-light)',
                        color: isOverdue ? 'var(--color-error)' : 'var(--color-primary)',
                      }}
                    >
                      {isOverdue ? 'Overdue' : 'Due Today'}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      EF: {item.srsCard.easinessFactor.toFixed(1)}
                    </span>
                  </div>
                </div>
              );
            })}

            {dueCards.length > 10 && (
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  marginTop: '0.5rem',
                }}
              >
                + {dueCards.length - 10} more cards in queue
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
