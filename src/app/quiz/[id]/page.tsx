'use client';

import React, { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiClient } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import type { Flashcard, MCQCard, Note, Quiz } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { QuizService } from '@/lib/db/services/quiz_service';
import { SRSCardService } from '@/lib/db/services/srs_card_service';
import { MCQCard as MCQCardComponent } from '@/components/quiz/MCQCard';
import { QuizResults } from '@/components/quiz/QuizResults';
import { FlashCard as FlashCardComponent } from '@/components/quiz/FlashCard';

interface QuizPageProps {
  params: Promise<{ id: string }>;
}

type QuizMode = 'mcq' | 'flashcards';

interface GenerateQuizApiResponse {
  mcqs: {
    question: string;
    options: [string, string, string, string];
    correctIndex: number;
    explanation: string;
  }[];
  flashcards: {
    front: string;
    back: string;
  }[];
  metadata: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  };
}

function QuizContent({ params }: QuizPageProps) {
  const resolvedParams = use(params);
  const quizId = resolvedParams.id;
  const router = useRouter();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [mcqCards, setMcqCards] = useState<MCQCard[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<QuizMode>('mcq');

  // MCQ state
  const [currentMcqIndex, setCurrentMcqIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [isMcqCompleted, setIsMcqCompleted] = useState(false);

  // Flashcards state
  const [currentFlashIndex, setCurrentFlashIndex] = useState(0);
  const [flashRatings, setFlashRatings] = useState<{ cardId: string; quality: number }[]>([]);
  const [isFlashCompleted, setIsFlashCompleted] = useState(false);
  const [isSavingRating, setIsSavingRating] = useState(false);

  // Re-roll state
  const [isRerolling, setIsRerolling] = useState(false);
  const [rerollError, setRerollError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const quizService = new QuizService(dbService);
    const noteService = new NoteService(dbService);

    async function loadQuizData() {
      const quizWithCards = await quizService.getQuizWithCards(quizId);
      if (!active) return;

      if (!quizWithCards) {
        setIsLoading(false);
        return;
      }

      setQuiz(quizWithCards.quiz);
      setMcqCards(quizWithCards.mcqCards);
      setFlashcards(quizWithCards.flashcards);
      setUserAnswers(new Array(quizWithCards.mcqCards.length).fill(null));

      const foundNote = await noteService.getById(quizWithCards.quiz.noteId);
      if (active && foundNote) {
        setNote(foundNote);
      }
      setIsLoading(false);
    }

    loadQuizData();
    return () => {
      active = false;
    };
  }, [quizId]);

  const handleSelectOption = (optionIndex: number) => {
    if (userAnswers[currentMcqIndex] !== null) return;
    const updated = [...userAnswers];
    updated[currentMcqIndex] = optionIndex;
    setUserAnswers(updated);
  };

  const handleNextMcq = () => {
    if (currentMcqIndex < mcqCards.length - 1) {
      setCurrentMcqIndex((prev) => prev + 1);
    } else {
      setIsMcqCompleted(true);
    }
  };

  const handleRetakeMcq = () => {
    setUserAnswers(new Array(mcqCards.length).fill(null));
    setCurrentMcqIndex(0);
    setIsMcqCompleted(false);
  };

  const handleRateFlashcard = async (quality: number) => {
    if (isSavingRating) return;
    setIsSavingRating(true);

    const currentCard = flashcards[currentFlashIndex];
    if (currentCard) {
      setFlashRatings((prev) => [...prev, { cardId: currentCard.id, quality }]);

      try {
        const dbService = new DatabaseService();
        const srsService = new SRSCardService(dbService);
        const srsCard = await srsService.getByCardId(currentCard.id);

        if (srsCard) {
          // Standard SM-2 calculations
          const isCorrect = quality >= 3;
          const repetitions = isCorrect ? srsCard.repetitions + 1 : 0;
          let easiness = srsCard.easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
          easiness = Math.max(1.3, easiness);

          let interval = 1;
          if (repetitions === 1) {
            interval = 1;
          } else if (repetitions === 2) {
            interval = 6;
          } else if (repetitions > 2) {
            interval = Math.round(srsCard.interval * easiness);
          }

          const nextReviewDate = new Date();
          nextReviewDate.setDate(nextReviewDate.getDate() + interval);

          await srsService.update(srsCard.id, {
            repetitions,
            easinessFactor: easiness,
            interval,
            nextReview: nextReviewDate.toISOString(),
            lastReview: new Date().toISOString(),
            totalReviews: srsCard.totalReviews + 1,
            correctCount: isCorrect ? srsCard.correctCount + 1 : srsCard.correctCount,
          });
        }
      } catch (err) {
        console.error('Failed to update SRS card:', err);
      }
    }

    setIsSavingRating(false);
    if (currentFlashIndex < flashcards.length - 1) {
      setCurrentFlashIndex((prev) => prev + 1);
    } else {
      setIsFlashCompleted(false || true);
    }
  };

  const handleResetFlashcards = () => {
    setCurrentFlashIndex(0);
    setFlashRatings([]);
    setIsFlashCompleted(false);
  };

  const handleRerollQuiz = async () => {
    if (!note) return;
    setIsRerolling(true);
    setRerollError(null);

    try {
      const client = new ApiClient();
      const response = await client.post<GenerateQuizApiResponse>('/api/generate-quiz', {
        text: note.content,
        difficulty: 'medium',
        mcqCount: 5,
        flashcardCount: 5,
      });

      const formattedMCQs = response.mcqs.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      }));

      const formattedFlashcards = response.flashcards.map((f) => ({
        front: f.front,
        back: f.back,
        tags: [note.title],
      }));

      const dbService = new DatabaseService();
      const quizService = new QuizService(dbService);
      const newQuiz = await quizService.create(
        note.id,
        formattedMCQs,
        formattedFlashcards,
        response.metadata?.model || 'gemini-2.0-flash'
      );

      router.push(`/quiz/${newQuiz.quiz.id}`);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message.includes('429') || err.message.includes('RATE_LIMITED')
            ? 'Gemini API rate limit reached. Try again in a minute.'
            : err.message
          : 'Failed to generate new quiz. Please try again.';
      setRerollError(errorMsg);
    } finally {
      setIsRerolling(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading quiz and cards...
      </div>
    );
  }

  if (!quiz) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Quiz Not Found
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0.75rem 0 1.5rem 0' }}>
          This quiz could not be located in your local storage.
        </p>
        <Link
          href="/quiz"
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          View All Quizzes
        </Link>
      </div>
    );
  }

  const mcqProgress = mcqCards.length > 0 ? ((currentMcqIndex + 1) / mcqCards.length) * 100 : 0;
  const flashProgress = flashcards.length > 0 ? ((currentFlashIndex + 1) / flashcards.length) * 100 : 0;

  return (
    <div
      style={{
        maxWidth: '780px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        paddingBottom: '3rem',
      }}
    >
      {/* Top Nav & Breadcrumb */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--color-surface-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link
            href="/quiz"
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            ← Quizzes
          </Link>
          {note && (
            <>
              <span style={{ color: 'var(--color-surface-border)' }}>/</span>
              <Link
                href={`/notes/${note.id}`}
                style={{
                  color: 'var(--color-primary)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {note.title}
              </Link>
            </>
          )}
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-muted)',
              fontWeight: 600,
            }}
          >
            v{quiz.version}
          </span>
        </div>

        {/* Mode Switcher Tabs */}
        <div
          style={{
            display: 'inline-flex',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-md)',
            padding: '0.25rem',
            gap: '0.25rem',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveMode('mcq')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: activeMode === 'mcq' ? 'var(--color-primary)' : 'transparent',
              color: activeMode === 'mcq' ? '#ffffff' : 'var(--color-text-secondary)',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            📝 MCQ Quiz ({mcqCards.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('flashcards')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: activeMode === 'flashcards' ? 'var(--color-primary)' : 'transparent',
              color: activeMode === 'flashcards' ? '#ffffff' : 'var(--color-text-secondary)',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            🔄 Flashcards ({flashcards.length})
          </button>
        </div>
      </div>

      {rerollError && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            fontSize: '0.875rem',
          }}
        >
          {rerollError}
        </div>
      )}

      {/* MODE 1: MCQ Quiz */}
      {activeMode === 'mcq' && (
        <>
          {!isMcqCompleted ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Progress Indicator */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-surface-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${mcqProgress}%`,
                    background: 'var(--color-accent-gradient)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {mcqCards[currentMcqIndex] && (
                <MCQCardComponent
                  card={mcqCards[currentMcqIndex]}
                  questionIndex={currentMcqIndex}
                  totalQuestions={mcqCards.length}
                  selectedOption={userAnswers[currentMcqIndex]}
                  onSelectOption={handleSelectOption}
                />
              )}

              {/* Next Question Navigation */}
              {userAnswers[currentMcqIndex] !== null && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleNextMcq}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-primary)',
                      border: 'none',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-glow)',
                    }}
                  >
                    {currentMcqIndex < mcqCards.length - 1 ? 'Next Question →' : 'View Results 🎯'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <QuizResults
              mcqCards={mcqCards}
              userAnswers={userAnswers}
              noteId={quiz.noteId}
              onRetake={handleRetakeMcq}
              onReroll={handleRerollQuiz}
              isRerolling={isRerolling}
            />
          )}
        </>
      )}

      {/* MODE 2: Flashcards Review */}
      {activeMode === 'flashcards' && (
        <>
          {!isFlashCompleted ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Progress Indicator */}
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-surface-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${flashProgress}%`,
                    background: 'var(--color-accent-gradient)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {flashcards[currentFlashIndex] ? (
                <FlashCardComponent
                  key={flashcards[currentFlashIndex].id}
                  card={flashcards[currentFlashIndex]}
                  cardIndex={currentFlashIndex}
                  totalCards={flashcards.length}
                  onRate={handleRateFlashcard}
                  isRating={isSavingRating}
                />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No flashcards found for this quiz.
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.5rem',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '3rem 2rem',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: 'var(--color-accent-light)',
                  border: '2px solid var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.5rem',
                }}
              >
                🎉
              </div>

              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>
                  Flashcard Review Complete!
                </h2>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
                  You reviewed all {flashcards.length} flashcards. Spaced repetition intervals have been updated!
                </p>
                {flashRatings.length > 0 && (
                  <p style={{ margin: '0.5rem 0 0 0', color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
                    Average Recall Score:{' '}
                    {(flashRatings.reduce((acc, r) => acc + r.quality, 0) / flashRatings.length).toFixed(1)} / 5
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={handleResetFlashcards}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🔄 Review Again
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleRetakeMcq();
                    setActiveMode('mcq');
                  }}
                  style={{
                    padding: '0.75rem 1.25rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  📝 Take MCQ Quiz
                </button>

                {note && (
                  <Link
                    href={`/notes/${note.id}`}
                    style={{
                      padding: '0.75rem 1.25rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--color-surface-border)',
                      color: 'var(--color-text-secondary)',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    📖 Back to Note
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function QuizPage(props: QuizPageProps) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading quiz interface...
        </div>
      }
    >
      <QuizContent {...props} />
    </Suspense>
  );
}
