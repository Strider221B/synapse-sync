'use client';

import React, { useState } from 'react';
import { DatabaseService } from '@/lib/db/database_service';
import type { Flashcard, MCQCard, SRSCard } from '@/lib/db/models';
import { SRSCardService } from '@/lib/db/services/srs_card_service';
import { SM2Engine } from '@/lib/srs/sm2';
import { QualityRating } from './QualityRating';
import { ReviewStats, type ReviewStatsData } from './ReviewStats';

export interface DueCardItem {
  srsCard: SRSCard;
  cardType: 'mcq' | 'flashcard';
  mcq?: MCQCard;
  flashcard?: Flashcard;
}

export interface ReviewSessionProps {
  cards: DueCardItem[];
  onFinishSession?: () => void;
  onReviewAgain?: () => void;
}

const MCQ_LABELS = ['A', 'B', 'C', 'D'];

export const ReviewSession: React.FC<ReviewSessionProps> = ({
  cards,
  onFinishSession,
  onReviewAgain,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const handleExit = () => {
    if (onFinishSession) {
      onFinishSession();
    }
  };
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedMcqOption, setSelectedMcqOption] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [ratedQualities, setRatedQualities] = useState<number[]>([]);

  const currentItem = cards[currentIndex];

  const handleRate = async (quality: number) => {
    if (isSaving || !currentItem) return;
    setIsSaving(true);

    try {
      const dbService = new DatabaseService();
      const srsService = new SRSCardService(dbService);

      const result = SM2Engine.calculate(currentItem.srsCard, quality);
      const isCorrect = quality >= 3;

      await srsService.update(currentItem.srsCard.id, {
        repetitions: result.repetitions,
        easinessFactor: result.easinessFactor,
        interval: result.interval,
        nextReview: result.nextReview,
        lastReview: new Date().toISOString(),
        totalReviews: currentItem.srsCard.totalReviews + 1,
        correctCount: isCorrect
          ? currentItem.srsCard.correctCount + 1
          : currentItem.srsCard.correctCount,
      });

      const nextQualities = [...ratedQualities, quality];
      setRatedQualities(nextQualities);

      // Advance or finish
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
        setSelectedMcqOption(null);
      } else {
        setIsFinished(true);
      }
    } catch (err) {
      console.error('Failed to update SRS card parameters:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isFinished || !currentItem) {
    const totalReviewed = ratedQualities.length;
    const avgQuality =
      totalReviewed > 0
        ? ratedQualities.reduce((sum, q) => sum + q, 0) / totalReviewed
        : 0;
    const masteredCount = ratedQualities.filter((q) => q >= 4).length;
    const learningCount = ratedQualities.filter((q) => q === 3).length;
    const strugglingCount = ratedQualities.filter((q) => q <= 2).length;

    const statsData: ReviewStatsData = {
      totalReviewed,
      averageQuality: avgQuality,
      masteredCount,
      learningCount,
      strugglingCount,
    };

    return (
      <ReviewStats
        stats={statsData}
        onReviewAgain={() => {
          if (onReviewAgain) {
            onReviewAgain();
          } else {
            setCurrentIndex(0);
            setIsFlipped(false);
            setSelectedMcqOption(null);
            setIsFinished(false);
            setRatedQualities([]);
          }
        }}
        onBackToDashboard={handleExit}
      />
    );
  }

  const progressPercent = Math.round(((currentIndex + 1) / cards.length) * 100);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        maxWidth: '720px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Session Progress Header */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  currentItem.cardType === 'mcq'
                    ? 'rgba(99, 102, 241, 0.15)'
                    : 'rgba(236, 72, 153, 0.15)',
                color:
                  currentItem.cardType === 'mcq'
                    ? 'var(--color-primary)'
                    : '#ec4899',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {currentItem.cardType === 'mcq' ? '📝 Multiple Choice' : '🔄 Flashcard'}
            </span>
            <span>
              Card {currentIndex + 1} of {cards.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleExit}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Exit Review
          </button>
        </div>

        {/* Progress Bar */}
        <div
          style={{
            width: '100%',
            height: '6px',
            backgroundColor: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: 'var(--color-primary)',
              transition: 'width var(--transition-normal)',
            }}
          />
        </div>
      </div>

      {/* Card Content Display */}
      {currentItem.cardType === 'flashcard' && currentItem.flashcard && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div
            onClick={() => setIsFlipped((prev) => !prev)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setIsFlipped((prev) => !prev);
              }
            }}
            style={{
              minHeight: '260px',
              padding: '2rem',
              borderRadius: 'var(--radius-xl)',
              backgroundColor: 'var(--color-surface)',
              border: '1.5px solid var(--color-surface-border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)',
              transition: 'all var(--transition-normal)',
              position: 'relative',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {isFlipped ? 'Answer (Click to flip)' : 'Prompt (Click to flip)'}
            </div>

            <div
              style={{
                fontSize: isFlipped ? '1.15rem' : '1.35rem',
                fontWeight: isFlipped ? 500 : 600,
                color: 'var(--color-text-primary)',
                lineHeight: 1.6,
                maxWidth: '560px',
              }}
            >
              {isFlipped ? currentItem.flashcard.back : currentItem.flashcard.front}
            </div>

            {!isFlipped && (
              <div
                style={{
                  marginTop: '1.5rem',
                  fontSize: '0.8rem',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                }}
              >
                Tap anywhere to reveal answer 💡
              </div>
            )}
          </div>

          {/* Quality Rating appears once card is flipped */}
          {isFlipped && (
            <div
              style={{
                padding: '1.25rem',
                backgroundColor: 'var(--color-surface-raised)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-surface-border)',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              <QualityRating onRate={handleRate} disabled={isSaving} />
            </div>
          )}
        </div>
      )}

      {currentItem.cardType === 'mcq' && currentItem.mcq && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Question Box */}
          <div
            style={{
              padding: '1.75rem',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h3
              style={{
                fontSize: '1.2rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                lineHeight: 1.5,
              }}
            >
              {currentItem.mcq.question}
            </h3>
          </div>

          {/* MCQ Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {currentItem.mcq.options.map((opt, optIdx) => {
              const isSelected = selectedMcqOption === optIdx;
              const isAnswered = selectedMcqOption !== null;
              const isCorrect = optIdx === currentItem.mcq?.correctIndex;

              let bg = 'var(--color-surface)';
              let border = '1px solid var(--color-surface-border)';
              let color = 'var(--color-text-primary)';

              if (isAnswered) {
                if (isCorrect) {
                  bg = 'var(--color-success-bg)';
                  border = '1.5px solid var(--color-success)';
                } else if (isSelected && !isCorrect) {
                  bg = 'var(--color-error-bg)';
                  border = '1.5px solid var(--color-error)';
                } else {
                  color = 'var(--color-text-muted)';
                }
              }

              return (
                <button
                  key={optIdx}
                  type="button"
                  disabled={isAnswered}
                  onClick={() => setSelectedMcqOption(optIdx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: bg,
                    border,
                    color,
                    fontSize: '0.95rem',
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: isAnswered ? 'default' : 'pointer',
                    transition: 'all var(--transition-fast)',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-surface-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    {MCQ_LABELS[optIdx]}
                  </span>
                  <span style={{ flex: 1 }}>{opt}</span>
                </button>
              );
            })}
          </div>

          {/* Answer Feedback and Explanation */}
          {selectedMcqOption !== null && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '1.25rem',
                backgroundColor: 'var(--color-surface-raised)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-surface-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>
                  {selectedMcqOption === currentItem.mcq.correctIndex ? '✅' : '❌'}
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    color:
                      selectedMcqOption === currentItem.mcq.correctIndex
                        ? 'var(--color-success)'
                        : 'var(--color-error)',
                  }}
                >
                  {selectedMcqOption === currentItem.mcq.correctIndex
                    ? 'Correct!'
                    : 'Incorrect'}
                </span>
              </div>

              {currentItem.mcq.explanation && (
                <p
                  style={{
                    fontSize: '0.9rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {currentItem.mcq.explanation}
                </p>
              )}

              {/* Quality Rating */}
              <QualityRating onRate={handleRate} disabled={isSaving} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
