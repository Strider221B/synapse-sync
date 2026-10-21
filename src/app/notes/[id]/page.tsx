'use client';

import React, { Suspense, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MarkdownRenderer } from '@/components/notes/MarkdownRenderer';
import { ApiClient } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note, Notebook, Quiz } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';
import { QuizService } from '@/lib/db/services/quiz_service';

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
  const [quizError, setQuizError] = useState<string | null>(null);

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
        const foundNb = await nbService.getById(foundNote.notebookId);
        if (active) setNotebook(foundNb ?? null);
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
            : err.message.includes('internet connection') || err.message.includes('offline')
            ? 'This feature requires an internet connection.'
            : err.message.includes('TEXT_TOO_SHORT')
            ? 'Note needs more content (at least 50 characters) to generate a quiz.'
            : err.message
          : 'Failed to generate quiz. Please try again.';
      setQuizError(errorMsg);

    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete "${note.title}"?`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    const dbService = new DatabaseService();
    const noteService = new NoteService(dbService);

    await noteService.delete(note.id);
    router.push('/notes');
  };

  if (isLoading) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading note content...
      </div>
    );
  }

  if (!note) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Note Not Found
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0.75rem 0 1.5rem 0' }}>
          The requested note does not exist or may have been deleted.
        </p>
        <Link
          href="/notes"
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 600,
          }}
        >
          Return to Notes
        </Link>
      </div>
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
          {quizzes.length > 0 && (
            <Link
              href={`/quiz/${quizzes[quizzes.length - 1].id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent-light)',
                border: '1px solid var(--color-accent)',
                color: 'var(--color-accent)',
                fontSize: '0.775rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <span>🎯</span> {quizzes.length} {quizzes.length === 1 ? 'Quiz Available' : 'Quizzes Available'}
            </Link>
          )}

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
            {isGeneratingQuiz ? 'Generating quiz...' : 'Generate Quiz'}
          </button>

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
            {note.sourceType.startsWith('onedrive')
              ? '☁️ OneDrive'
              : note.sourceType === 'youtube_transcript'
              ? '🎬 YouTube'
              : '✍️ Manual'}
          </span>

          {notebook && (
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
          )}

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

