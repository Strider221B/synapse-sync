'use client';

import React, { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MarkdownRenderer } from '@/components/notes/MarkdownRenderer';
import { Skeleton } from '@/components/common/Skeleton';
import { ErrorState } from '@/components/common/ErrorState';
import { DEFAULT_AI_MODEL } from '@/lib/api/ai_config';
import { ApiClient } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note, Notebook, Quiz } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';
import { QuizService } from '@/lib/db/services/quiz_service';
import { PreferencesService } from '@/lib/db/services/preferences_service';
import { ClipboardService } from '@/lib/utils/clipboard_service';

interface NoteReaderPageProps {
  params: Promise<{ id: string }>;
}

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

function NoteReaderContent({ params }: NoteReaderPageProps) {
  const resolvedParams = use(params);
  const noteId = resolvedParams.id;
  const router = useRouter();

  const [note, setNote] = useState<Note | null>(null);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    currentChunk: number;
    totalChunks: number;
    mcqCount: number;
    flashcardCount: number;
    throttleSpeed?: string;
  } | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [folderPath, setFolderPath] = useState<Notebook[]>([]);

  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const noteService = new NoteService(dbService);
    const nbService = new NotebookService(dbService);
    const quizService = new QuizService(dbService);

    async function fetchNote() {
      const foundNote = await noteService.getById(noteId);
      if (!active) return;
      if (!foundNote) {
        setIsLoading(false);
        return;
      }
      setNote(foundNote);
      if (foundNote.notebookId) {
        const [foundNb, path] = await Promise.all([
          nbService.getById(foundNote.notebookId),
          nbService.getFolderPath(foundNote.notebookId),
        ]);
        if (active) {
          setNotebook(foundNb ?? null);
          setFolderPath(path);
        }
      }

      const foundQuizzes = await quizService.getByNote(noteId);
      if (active) {
        setQuizzes(foundQuizzes);
      }

      setIsLoading(false);
    }

    fetchNote();
    return () => {
      active = false;
    };
  }, [noteId]);

  const handleGenerateQuiz = async () => {
    if (!note || isGeneratingQuiz) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setQuizError('Quiz generation requires an internet connection to connect to Gemini AI. You can still study existing quizzes and flashcards offline.');
      return;
    }
    if (!note.content || note.content.trim().length < 50) {
      setQuizError('Note needs more content (at least 50 characters) to generate a quiz.');
      return;
    }

    setIsGeneratingQuiz(true);
    setQuizError(null);
    setGenerationProgress(null);

    try {
      const words = note.content.trim().split(/\s+/);
      const CHUNK_WORDS = 2500;
      const client = new ApiClient();
      let allMCQs: GenerateQuizApiResponse['mcqs'] = [];
      let allFlashcards: GenerateQuizApiResponse['flashcards'] = [];
      let lastModel = DEFAULT_AI_MODEL;

      const dbService = new DatabaseService();
      const prefs = new PreferencesService(dbService);
      const quizService = new QuizService(dbService);
      const throttleSpeed = (await prefs.get<string>('throttleSpeed')) || 'low';
      const delayMs = throttleSpeed === 'high' ? 4000 : 0;

      let existingQuestions: string[] = [];
      let existingFlashcards: string[] = [];
      if (quizzes.length > 0) {
        try {
          const latest = await quizService.getQuizWithCards(quizzes[quizzes.length - 1].id);
          existingQuestions = latest?.mcqCards.map((c) => c.question) || [];
          existingFlashcards = latest?.flashcards.map((f) => f.front) || [];
        } catch {
          // Fall back gracefully to empty context
        }
      }

      if (words.length <= CHUNK_WORDS) {
        setGenerationProgress({ currentChunk: 1, totalChunks: 1, mcqCount: 0, flashcardCount: 0, throttleSpeed });
        const response = await client.post<GenerateQuizApiResponse>('/api/generate-quiz', {
          text: note.content,
          difficulty: 'medium',
          mcqCount: 5,
          flashcardCount: 5,
          throttleSpeed,
          previousContext: {
            questions: existingQuestions,
            flashcards: existingFlashcards,
          },
        });
        allMCQs = response.mcqs;
        allFlashcards = response.flashcards;
        lastModel = response.metadata?.model || DEFAULT_AI_MODEL;
      } else {
        const chunks: string[] = [];
        for (let i = 0; i < words.length; i += CHUNK_WORDS) {
          chunks.push(words.slice(i, i + CHUNK_WORDS).join(' '));
        }

        for (let idx = 0; idx < chunks.length; idx++) {
          if (idx > 0 && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          setGenerationProgress({
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
          const response = await client.post<GenerateQuizApiResponse>('/api/generate-quiz', {
            text: chunks[idx],
            difficulty: 'medium',
            mcqCount: 5,
            flashcardCount: 5,
            throttleSpeed,
            previousContext: chunkContext,
          });
          allMCQs.push(...response.mcqs);
          allFlashcards.push(...response.flashcards);
          lastModel = response.metadata?.model || DEFAULT_AI_MODEL;
        }
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
        }
      }
      void syncManager.forceSync().catch(() => {});

      router.push(`/quiz/${newQuiz.quiz.id}`);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message.includes('429') || err.message.includes('RATE_LIMITED')
            ? 'Gemini API rate limit reached. Try again in a minute.'
            : err.message.includes('internet connection') || err.message.includes('offline')
            ? 'This feature requires an internet connection.'
            : err.message.includes('TEXT_TOO_SHORT')
            ? 'Note needs more content (at least 50 characters) to generate a quiz.'
            : err.message
          : 'Failed to generate quiz. Please try again.';
      setQuizError(errorMsg);
    } finally {
      setIsGeneratingQuiz(false);
      setGenerationProgress(null);
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete "${note.title}"?`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    const dbService = new DatabaseService();
    const { SyncQueueService } = await import('@/lib/db/services/sync_queue_service');
    const syncQueueService = new SyncQueueService(dbService);
    const noteService = new NoteService(dbService, syncQueueService);

    await noteService.delete(note.id);
    router.push('/notes');
  };

  const handleCopyNote = async () => {
    if (!note) return;
    const clipboardService = new ClipboardService();
    const formatted = clipboardService.formatNote(note);
    const success = await clipboardService.copyToClipboard(formatted);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem 0' }}>
        <Skeleton variant="text" width="160px" height="24px" />
        <Skeleton variant="text" width="70%" height="40px" />
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Skeleton variant="text" width="120px" height="20px" />
          <Skeleton variant="text" width="80px" height="20px" />
        </div>
        <Skeleton variant="card" height="340px" />
      </div>
    );
  }

  if (!note) {
    return (
      <ErrorState
        title="Note Not Found"
        message="The requested study note does not exist or may have been deleted from local storage."
        actionLabel="Return to Notes"
        onRetry={() => router.push('/notes')}
      />
    );
  }

  const readTimeMinutes = Math.max(1, Math.round(note.wordCount / 250));
  const formattedDate = new Date(note.updatedAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--color-surface-border)',
        }}
      >
        <Link
          href="/notes"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          ← Back to Notes
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {quizzes.length > 0 ? (
            <>
              <Link
                href={`/quiz/${quizzes[quizzes.length - 1].id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: 'var(--shadow-glow)',
                }}
              >
                <span>🎯</span> Study Stored Quiz (v{quizzes[quizzes.length - 1].version})
              </Link>

              <button
                type="button"
                onClick={handleGenerateQuiz}
                disabled={isGeneratingQuiz}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-raised)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-surface-border)',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: isGeneratingQuiz ? 'not-allowed' : 'pointer',
                  opacity: isGeneratingQuiz ? 0.7 : 1,
                  transition: 'all var(--transition-fast)',
                }}
                title="Re-trigger quiz and flashcard generation across the entire document"
              >
                <span>{isGeneratingQuiz ? '⏳' : '🔄'}</span>
                {isGeneratingQuiz
                  ? generationProgress
                    ? `Generating chunk ${generationProgress.currentChunk}/${generationProgress.totalChunks}...`
                    : 'Generating quiz...'
                  : 'Re-trigger Generation'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleGenerateQuiz}
              disabled={isGeneratingQuiz}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                border: '1px solid var(--color-primary-glow)',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: isGeneratingQuiz ? 'not-allowed' : 'pointer',
                opacity: isGeneratingQuiz ? 0.7 : 1,
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>{isGeneratingQuiz ? '⏳' : '📝'}</span>
              {isGeneratingQuiz
                ? generationProgress
                  ? `Generating chunk ${generationProgress.currentChunk}/${generationProgress.totalChunks}...`
                  : 'Generating quiz...'
                : 'Generate Quiz'}
            </button>
          )}

          <Link
            href={`/chat?noteId=${note.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-primary)',
              fontSize: '0.825rem',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all var(--transition-fast)',
            }}
            data-testid="ask-ai-button"
          >
            <span>💬</span> Ask AI Tutor
          </Link>

          <button
            type="button"
            onClick={handleCopyNote}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: isCopied ? 'var(--color-success-bg)' : 'var(--color-surface-raised)',
              border: `1px solid ${isCopied ? 'var(--color-success)' : 'var(--color-surface-border)'}`,
              color: isCopied ? 'var(--color-success)' : 'var(--color-text-primary)',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            title="Copy note content to clipboard"
          >
            <span>{isCopied ? '✓' : '📋'}</span>
            <span>{isCopied ? 'Copied!' : 'Copy Note'}</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-surface-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-error)',
              fontSize: '0.825rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Live Chunk Generation Progress Indicator */}
      {isGeneratingQuiz && generationProgress && (
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
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>
              ⚡ Generating quiz & flashcards across document (Chunk {generationProgress.currentChunk} of {generationProgress.totalChunks} • {generationProgress.throttleSpeed === 'high' ? 'High throttle (Free Tier)' : 'Low throttle (Paid Plan)'})...
            </span>
            <span>
              {generationProgress.mcqCount + generationProgress.flashcardCount} questions accumulated
            </span>
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
                width: `${(generationProgress.currentChunk / generationProgress.totalChunks) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--color-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Stored Quiz Banner */}
      {quizzes.length > 0 && !isGeneratingQuiz && (
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎯</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '0.925rem' }}>
                  Stored Quiz Ready
                </span>
                <span
                  style={{
                    fontSize: '0.725rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                >
                  v{quizzes[quizzes.length - 1].version}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 500 }}>
                  ☁️ Stored on Google Drive
                </span>
              </div>
              {quizzes.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Retake version:</span>
                  {quizzes.map((q) => (
                    <Link
                      key={q.id}
                      href={`/quiz/${q.id}`}
                      style={{
                        padding: '0.1rem 0.45rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        backgroundColor: q.id === quizzes[quizzes.length - 1].id ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
                        border: '1px solid var(--color-surface-border)',
                        color: q.id === quizzes[quizzes.length - 1].id ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      v{q.version}
                    </Link>
                  ))}
                </div>
              )}
              <p style={{ margin: '0.2rem 0 0 0', color: 'var(--color-text-secondary)', fontSize: '0.825rem' }}>
                Questions and flashcards are ready to study. You can also re-trigger generation if desired.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Link
              href={`/quiz/${quizzes[quizzes.length - 1].id}`}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              Open Quiz →
            </Link>
            <button
              type="button"
              onClick={handleGenerateQuiz}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-raised)',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-secondary)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              🔄 Re-trigger
            </button>
          </div>
        </div>
      )}

      {quizError && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-error-bg)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{quizError}</span>
          <button
            type="button"
            onClick={() => setQuizError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-error)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Note Header Metadata */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.75rem',
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-secondary)',
              fontWeight: 500,
            }}
          >
            {note.sourceType.startsWith('gdrive')
              ? '📁 Google Drive'
              : note.sourceType === 'youtube_transcript'
              ? '🎬 YouTube'
              : '✍️ Manual'}
          </span>

          {folderPath.length > 0 ? (
            folderPath.map((folder, idx) => (
              <React.Fragment key={folder.id}>
                {idx > 0 && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>/</span>}
                <Link
                  href={`/notes/notebook/${folder.id}`}
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-primary)',
                    backgroundColor: 'var(--color-primary-light)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 500,
                  }}
                >
                  📁 {folder.name}
                </Link>
              </React.Fragment>
            ))
          ) : notebook ? (
            <Link
              href={`/notes/notebook/${notebook.id}`}
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-primary)',
                backgroundColor: 'var(--color-primary-light)',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 500,
              }}
            >
              📁 {notebook.name}
            </Link>
          ) : null}

          {note.sourceUrl && (
            <a
              href={note.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                textDecoration: 'underline',
              }}
            >
              Open Original Source ↗
            </a>
          )}
        </div>

        <h1
          style={{
            fontSize: '2.1rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--color-text-primary)',
            lineHeight: 1.25,
            margin: 0,
          }}
        >
          {note.title}
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            fontSize: '0.825rem',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>{note.wordCount.toLocaleString()} words</span>
          <span>•</span>
          <span>{readTimeMinutes} min read</span>
          <span>•</span>
          <span>Updated {formattedDate}</span>
        </div>
      </header>

      {/* Note Reader Body */}
      <article
        style={{
          padding: '2rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {note.contentFormat === 'markdown' ? (
          <MarkdownRenderer content={note.content} />
        ) : (
          <div
            style={{
              whiteSpace: 'pre-wrap',
              lineHeight: 1.75,
              fontSize: '1rem',
              color: 'var(--color-text-secondary)',
            }}
          >
            {note.content}
          </div>
        )}
      </article>
    </div>
  );
}

/**
 * Mobile-responsive reader view for study notes with Markdown rendering and quick actions.
 */
export default function NoteReaderPage({ params }: NoteReaderPageProps) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading note...
        </div>
      }
    >
      <NoteReaderContent params={params} />
    </Suspense>
  );
}

