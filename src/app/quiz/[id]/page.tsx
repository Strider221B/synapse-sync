'use client';

import React, { Suspense, use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEFAULT_AI_MODEL } from '@/lib/api/ai_config';
import { ApiClient } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import type { Flashcard, MCQCard, Note, Quiz } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { QuizService } from '@/lib/db/services/quiz_service';
import { SRSCardService } from '@/lib/db/services/srs_card_service';
import { PreferencesService } from '@/lib/db/services/preferences_service';
import { SyncQueueService } from '@/lib/db/services/sync_queue_service';
import { MCQCard as MCQCardComponent } from '@/components/quiz/MCQCard';
import { QuizResults } from '@/components/quiz/QuizResults';
import { FlashCard as FlashCardComponent } from '@/components/quiz/FlashCard';
import { SM2Engine } from '@/lib/srs/sm2';
import { ClipboardService } from '@/lib/utils/clipboard_service';
import { useGoogleAuth } from '@/components/auth/GoogleAuthProviderWrapper';

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
    stats?: {
      total_calls: number;
      successful_calls: number;
      timed_out_calls: number;
      retry_calls: number;
      backup_key_calls: number;
      backup_failovers: number;
      active_key_index: number;
      active_key_masked: string;
      total_keys_configured?: number;
    };
  };
}

function QuizContent({ params }: QuizPageProps) {
  const resolvedParams = use(params);
  const quizId = resolvedParams.id;
  const router = useRouter();
  const { isAuthenticated } = useGoogleAuth();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [mcqCards, setMcqCards] = useState<MCQCard[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMode, setActiveMode] = useState<QuizMode>('mcq');
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);

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
  const [rerollProgress, setRerollProgress] = useState<{
    currentChunk: number;
    totalChunks: number;
    mcqCount: number;
    flashcardCount: number;
    throttleSpeed?: string;
  } | null>(null);
  const [availableQuizzes, setAvailableQuizzes] = useState<Quiz[]>([]);
  const [rerollError, setRerollError] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const rerollAbortControllerRef = useRef<AbortController | null>(null);

  const handleCancelReroll = () => {
    if (rerollAbortControllerRef.current) {
      rerollAbortControllerRef.current.abort();
      rerollAbortControllerRef.current = null;
    }
  };

  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const quizService = new QuizService(dbService);
    const noteService = new NoteService(dbService);

    async function loadQuizData() {
      const quizWithCards = await quizService.getQuizWithCards(quizId);
      if (!active || !quizWithCards) {
        if (active) setIsLoading(false);
        return;
      }

      setQuiz(quizWithCards.quiz);
      setMcqCards(quizWithCards.mcqCards);
      setFlashcards(quizWithCards.flashcards);
      setUserAnswers(new Array(quizWithCards.mcqCards.length).fill(null));

      const [foundNote, allQuizzes] = await Promise.all([
        noteService.getById(quizWithCards.quiz.noteId),
        quizService.getByNote(quizWithCards.quiz.noteId),
      ]);
      if (active) {
        if (foundNote) setNote(foundNote);
        setAvailableQuizzes([...allQuizzes].sort((a, b) => b.version - a.version));
        setIsLoading(false);
      }

      if (!quizWithCards.quiz.isSynced) {
        import('@/lib/db/sync_manager').then(({ SyncManager }) => {
          const syncService = SyncManager.getInstance().getSyncService();
          if (syncService && syncService.isConnected()) {
            syncService.pushQuiz(quizId).then(() => {
              if (active) {
                setQuiz((prev) => (prev ? { ...prev, isSynced: true } : prev));
              }
            }).catch((syncErr) => {
              console.warn('Auto-sync quiz to Drive deferred:', syncErr);
            });
          }
        });
      }
    }

    loadQuizData();
    return () => {
      active = false;
    };
  }, [quizId]);

  useEffect(() => {
    const handleSyncComplete = async () => {
      const dbService = new DatabaseService();
      const db = await dbService.getDB();
      const updatedQuiz = await db.get('quizzes', quizId);
      if (updatedQuiz) {
        setQuiz(updatedQuiz);
      }
    };
    window.addEventListener('synapse-sync-completed', handleSyncComplete);
    return () => {
      window.removeEventListener('synapse-sync-completed', handleSyncComplete);
    };
  }, [quizId]);

  const handleManualSync = async () => {
    if (!quiz || isSyncingDrive) return;
    setIsSyncingDrive(true);
    try {
      const { SyncManager } = await import('@/lib/db/sync_manager');
      const syncManager = SyncManager.getInstance();
      const syncService = syncManager.getSyncService();
      if (syncService && syncService.isConnected()) {
        await syncService.pushQuiz(quiz.id);
        setQuiz((prev) => (prev ? { ...prev, isSynced: true } : prev));
      } else {
        await syncManager.forceSync();
        const dbService = new DatabaseService();
        const db = await dbService.getDB();
        const updated = await db.get('quizzes', quiz.id);
        if (updated) setQuiz(updated);
      }
    } catch (err) {
      console.error('Failed to sync quiz to Google Drive:', err);
    } finally {
      setIsSyncingDrive(false);
    }
  };

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
          const result = SM2Engine.calculate(srsCard, quality);
          const isCorrect = quality >= 3;

          await srsService.update(srsCard.id, {
            repetitions: result.repetitions,
            easinessFactor: result.easinessFactor,
            interval: result.interval,
            nextReview: result.nextReview,
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
    if (!note || isRerolling) return;
    setIsRerolling(true);
    setRerollError(null);
    setRerollProgress(null);

    const abortController = new AbortController();
    rerollAbortControllerRef.current = abortController;

    try {
      const words = note.content.trim().split(/\s+/);
      const CHUNK_WORDS = 2500;
      const client = new ApiClient();
      let allMCQs: GenerateQuizApiResponse['mcqs'] = [];
      let allFlashcards: GenerateQuizApiResponse['flashcards'] = [];
      let lastModel = DEFAULT_AI_MODEL;

      const dbService = new DatabaseService();
      const prefs = new PreferencesService(dbService);
      const throttleSpeed = (await prefs.get<string>('throttleSpeed')) || 'low';
      const delayMs = throttleSpeed === 'high' ? 4000 : 0;
      const sessionId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const existingQuestions = mcqCards.map((c) => c.question);
      const existingFlashcards = flashcards.map((f) => f.front);

      if (words.length <= CHUNK_WORDS) {
        setRerollProgress({ currentChunk: 1, totalChunks: 1, mcqCount: 0, flashcardCount: 0, throttleSpeed });
        const response = await client.post<GenerateQuizApiResponse>(
          '/api/generate-quiz',
          {
            text: note.content,
            difficulty: 'medium',
            mcqCount: 5,
            flashcardCount: 5,
            throttleSpeed,
            previousContext: {
              questions: existingQuestions,
              flashcards: existingFlashcards,
            },
            chunkIndex: 1,
            totalChunks: 1,
            sessionId,
          },
          { signal: abortController.signal }
        );
        allMCQs = response.mcqs;
        allFlashcards = response.flashcards;
        lastModel = response.metadata?.model || DEFAULT_AI_MODEL;
      } else {
        const chunks: string[] = [];
        for (let i = 0; i < words.length; i += CHUNK_WORDS) {
          chunks.push(words.slice(i, i + CHUNK_WORDS).join(' '));
        }

        for (let idx = 0; idx < chunks.length; idx++) {
          if (abortController.signal.aborted) {
            break;
          }
          if (idx > 0 && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          if (abortController.signal.aborted) {
            break;
          }
          setRerollProgress({
            currentChunk: idx + 1,
            totalChunks: chunks.length,
            mcqCount: allMCQs.length,
            flashcardCount: allFlashcards.length,
            throttleSpeed,
          });
          const chunkContext = {
            questions: [...existingQuestions, ...allMCQs.map((q) => q.question)],
            flashcards: [...existingFlashcards, ...allFlashcards.map((f) => f.front)],
          };

          let chunkSuccess = false;
          let lastChunkError: unknown = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            if (abortController.signal.aborted) break;
            try {
              const response = await client.post<GenerateQuizApiResponse>(
                '/api/generate-quiz',
                {
                  text: chunks[idx],
                  difficulty: 'medium',
                  mcqCount: 5,
                  flashcardCount: 5,
                  throttleSpeed,
                  previousContext: chunkContext,
                  chunkIndex: idx + 1,
                  totalChunks: chunks.length,
                  sessionId,
                },
                { signal: abortController.signal }
              );
              allMCQs.push(...response.mcqs);
              allFlashcards.push(...response.flashcards);
              lastModel = response.metadata?.model || DEFAULT_AI_MODEL;
              chunkSuccess = true;
              break;
            } catch (chunkErr) {
              lastChunkError = chunkErr;
              if (abortController.signal.aborted) break;
              if (attempt === 0) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
          }

          if (!chunkSuccess) {
            if (abortController.signal.aborted) break;
            if (allMCQs.length > 0) {
              console.warn(`Chunk ${idx + 1} failed, saving ${allMCQs.length} accumulated questions`, lastChunkError);
              break;
            }
            throw lastChunkError;
          }
        }
      }

      if (abortController.signal.aborted && allMCQs.length === 0) {
        return;
      }

      if (allMCQs.length === 0) {
        throw new Error('Failed to generate any quiz questions.');
      }

      const formattedMCQs = allMCQs.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      }));

      const formattedFlashcards = allFlashcards.map((f) => ({
        front: f.front,
        back: f.back,
        tags: [note.title],
      }));

      const quizService = new QuizService(dbService);
      const newQuiz = await quizService.create(
        note.id,
        formattedMCQs,
        formattedFlashcards,
        lastModel
      );

      // Save directly to Google Drive and trigger sync
      const { SyncManager } = await import('@/lib/db/sync_manager');
      const syncManager = SyncManager.getInstance();
      const syncService = syncManager.getSyncService();
      if (syncService && syncService.isConnected()) {
        try {
          await syncService.pushQuiz(newQuiz.quiz.id);
        } catch (syncErr) {
          console.warn('Direct Google Drive quiz push deferred to sync queue:', syncErr);
          const { SyncQueueService } = await import('@/lib/db/services/sync_queue_service');
          const sqService = new SyncQueueService(dbService);
          await sqService.enqueue('quiz', newQuiz.quiz.id, 'create', { noteId: note.id });
          void syncManager.forceSync().catch(() => {});
        }
      } else {
        const { SyncQueueService } = await import('@/lib/db/services/sync_queue_service');
        const sqService = new SyncQueueService(dbService);
        await sqService.enqueue('quiz', newQuiz.quiz.id, 'create', { noteId: note.id });
        void syncManager.forceSync().catch(() => {});
      }

      router.push(`/quiz/${newQuiz.quiz.id}`);
    } catch (err: unknown) {
      if (err instanceof Error && (err.message.includes('aborted') || err.message.includes('ABORTED'))) {
        return;
      }
      const errorMsg =
        err instanceof Error
          ? err.message.includes('429') || err.message.includes('RATE_LIMITED')
            ? 'Gemini API rate limit reached. Try again in a minute.'
            : err.message.includes('TIMEOUT') || err.message.includes('timed out') || err.message.includes('408')
            ? 'Quiz generation timed out. Please try again.'
            : err.message
          : 'Failed to generate new quiz. Please try again.';
      setRerollError(errorMsg);
    } finally {
      setIsRerolling(false);
      setRerollProgress(null);
      rerollAbortControllerRef.current = null;
    }
  };

  const handleCopyAll = async () => {
    const clipboardService = new ClipboardService();
    let text = '';
    if (activeMode === 'mcq') {
      text = clipboardService.formatQuizMCQs(mcqCards, note?.title);
    } else {
      text = flashcards
        .map((fc, idx) => `--- Flashcard ${idx + 1} ---\n${clipboardService.formatFlashcard(fc)}`)
        .join('\n\n');
    }
    const success = await clipboardService.copyToClipboard(text);
    if (success) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleDeleteCurrentMcq = async () => {
    const currentCard = mcqCards[currentMcqIndex];
    if (!currentCard) return;
    const confirmed = window.confirm(`Delete Question ${currentMcqIndex + 1}? This action cannot be undone.`);
    if (!confirmed) return;

    const dbService = new DatabaseService();
    const syncQueueService = new SyncQueueService(dbService);
    const quizService = new QuizService(dbService, syncQueueService);
    await quizService.deleteMCQCard(currentCard.id);

    const updated = mcqCards.filter((_, idx) => idx !== currentMcqIndex);
    const updatedAnswers = userAnswers.filter((_, idx) => idx !== currentMcqIndex);
    setMcqCards(updated);
    setUserAnswers(updatedAnswers);
    if (currentMcqIndex >= updated.length) {
      setCurrentMcqIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleDeleteCurrentFlashcard = async () => {
    const currentCard = flashcards[currentFlashIndex];
    if (!currentCard) return;
    const confirmed = window.confirm(`Delete Flashcard ${currentFlashIndex + 1}? This action cannot be undone.`);
    if (!confirmed) return;

    const dbService = new DatabaseService();
    const syncQueueService = new SyncQueueService(dbService);
    const quizService = new QuizService(dbService, syncQueueService);
    await quizService.deleteFlashcard(currentCard.id);

    const updated = flashcards.filter((_, idx) => idx !== currentFlashIndex);
    setFlashcards(updated);
    if (currentFlashIndex >= updated.length) {
      setCurrentFlashIndex(Math.max(0, updated.length - 1));
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
          {availableQuizzes.length > 1 ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                Version:
              </span>
              <select
                value={quiz.id}
                onChange={(e) => router.push(`/quiz/${e.target.value}`)}
                aria-label="Select quiz version"
                style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  backgroundColor: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-surface-border)',
                  color: 'var(--color-text-primary)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {availableQuizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    v{q.version} ({new Date(q.generatedAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          ) : (
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
          )}
        </div>

        {/* Mode Switcher Tabs & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {quiz?.isSynced ? (
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-primary)',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              ☁️ Saved to Drive
            </span>
          ) : isAuthenticated ? (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncingDrive}
              title="Quiz is stored locally. Click to sync to Google Drive."
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-warning, #d97706)',
                backgroundColor: 'transparent',
                border: '1px dashed var(--color-warning, #d97706)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.2rem 0.5rem',
                cursor: isSyncingDrive ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 500,
              }}
            >
              {isSyncingDrive ? '⏳ Syncing to Drive...' : '☁️ Sync to Drive'}
            </button>
          ) : (
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-secondary)',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              title="Stored in local browser workspace."
            >
              💾 Local Workspace
            </span>
          )}

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

          <button
            type="button"
            onClick={activeMode === 'mcq' ? handleRetakeMcq : handleResetFlashcards}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            title="Retake or reset this version from question 1"
          >
            <span>🔁</span> Retake
          </button>

          <button
            type="button"
            onClick={handleCopyAll}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: copiedAll ? 'var(--color-success-bg)' : 'var(--color-surface-raised)',
              border: `1px solid ${copiedAll ? 'var(--color-success)' : 'var(--color-surface-border)'}`,
              color: copiedAll ? 'var(--color-success)' : 'var(--color-text-secondary)',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            title={activeMode === 'mcq' ? 'Copy all MCQs to clipboard' : 'Copy all flashcards to clipboard'}
          >
            <span>{copiedAll ? '✓' : '📋'}</span> {copiedAll ? 'Copied!' : activeMode === 'mcq' ? 'Copy Quiz' : 'Copy Cards'}
          </button>

          <button
            type="button"
            onClick={handleRerollQuiz}
            disabled={isRerolling}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: isRerolling ? 'not-allowed' : 'pointer',
              opacity: isRerolling ? 0.7 : 1,
              transition: 'all var(--transition-fast)',
            }}
            title="Re-trigger quiz and flashcard generation across the entire document"
          >
            <span>{isRerolling ? '⏳' : '🔄'}</span> Re-trigger
          </button>
        </div>
      </div>

      {/* Re-roll Progress Indicator */}
      {isRerolling && rerollProgress && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary-light)',
            border: '1px solid var(--color-primary-glow)',
            color: 'var(--color-primary)',
            fontSize: '0.875rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
            <span>
              ⚡ Re-generating questions across document (Chunk {rerollProgress.currentChunk} of {rerollProgress.totalChunks} • {rerollProgress.throttleSpeed === 'high' ? 'High throttle (Free Tier)' : 'Low throttle (Paid Plan)'})...
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>
                {rerollProgress.mcqCount + rerollProgress.flashcardCount} questions accumulated
              </span>
              <button
                type="button"
                onClick={handleCancelReroll}
                style={{
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--color-error)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
                title="Cancel re-generation and keep accumulated questions"
              >
                Cancel
              </button>
            </div>
          </div>
          <div
            style={{
              width: '100%',
              height: '6px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(rerollProgress.currentChunk / rerollProgress.totalChunks) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--color-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

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
              {/* Progress & Question Selector Header */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Question {currentMcqIndex + 1} of {mcqCards.length}
                  </span>
                  {mcqCards.length > 5 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      <span>Jump:</span>
                      <select
                        value={currentMcqIndex}
                        onChange={(e) => setCurrentMcqIndex(Number(e.target.value))}
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-surface-border)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-primary)',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                        }}
                      >
                        {mcqCards.map((_, idx) => (
                          <option key={idx} value={idx}>
                            Q{idx + 1} {userAnswers[idx] !== null ? '✓' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

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
              </div>

              {mcqCards.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                  No questions left in this quiz.
                </div>
              ) : mcqCards[currentMcqIndex] && (
                <MCQCardComponent
                  card={mcqCards[currentMcqIndex]}
                  questionIndex={currentMcqIndex}
                  totalQuestions={mcqCards.length}
                  selectedOption={userAnswers[currentMcqIndex]}
                  onSelectOption={handleSelectOption}
                  onDelete={handleDeleteCurrentMcq}
                />
              )}

              {/* Navigation Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                {currentMcqIndex > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentMcqIndex((prev) => prev - 1)}
                    style={{
                      padding: '0.625rem 1.25rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-surface-border)',
                      color: 'var(--color-text-secondary)',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    ← Previous Question
                  </button>
                ) : (
                  <div />
                )}

                {userAnswers[currentMcqIndex] !== null && (
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
                )}
              </div>
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
                  onDelete={handleDeleteCurrentFlashcard}
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
