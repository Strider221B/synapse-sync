'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note, Quiz } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { QuizService } from '@/lib/db/services/quiz_service';
import { Skeleton } from '@/components/common/Skeleton';

interface NoteQuizSummary {
  note: Note;
  quizzes: Quiz[];
  latestQuiz: Quiz;
  lastGeneratedDate: string;
}

function QuizListContent() {
  const searchParams = useSearchParams();
  const filterNoteId = searchParams.get('noteId');

  const [summaries, setSummaries] = useState<NoteQuizSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const quizService = new QuizService(dbService);
    const noteService = new NoteService(dbService);

    async function loadData() {
      const allNotes = await noteService.getAll();
      const results: NoteQuizSummary[] = [];

      for (const note of allNotes) {
        if (filterNoteId && note.id !== filterNoteId) {
          continue;
        }

        const quizzes = await quizService.getByNote(note.id);
        if (quizzes.length > 0) {
          // Sort quizzes by version descending
          const sorted = [...quizzes].sort((a, b) => b.version - a.version);
          const latest = sorted[0];
          results.push({
            note,
            quizzes: sorted,
            latestQuiz: latest,
            lastGeneratedDate: latest.generatedAt,
          });
        }
      }

      // Sort notes by latest quiz date descending
      results.sort((a, b) => new Date(b.lastGeneratedDate).getTime() - new Date(a.lastGeneratedDate).getTime());

      if (active) {
        setSummaries(results);
        setIsLoading(false);
      }
    }

    loadData();
    const handleSyncComplete = () => {
      void loadData();
    };
    window.addEventListener('synapse-sync-completed', handleSyncComplete);

    return () => {
      active = false;
      window.removeEventListener('synapse-sync-completed', handleSyncComplete);
    };
  }, [filterNoteId]);

  const filteredSummaries = summaries.filter((item) =>
    item.note.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 0.5rem 0',
              color: 'var(--color-text-primary)',
            }}
          >
            Quizzes & Flashcards
          </h1>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
            Test your understanding with AI-generated multiple-choice questions and spaced repetition cards.
          </p>
        </div>

        <Link
          href="/notes"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.875rem',
            textDecoration: 'none',
            boxShadow: 'var(--shadow-glow)',
          }}
        >
          <span>📚</span> Browse Notes to Generate
        </Link>
      </div>

      {/* Filter / Search Bar */}
      {summaries.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search quizzes by note title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              maxWidth: '400px',
              padding: '0.625rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-surface-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
          {filterNoteId && (
            <Link
              href="/quiz"
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Clear note filter ✕
            </Link>
          )}
        </div>
      )}

      {/* Content Area */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="card" height="150px" />
          ))}
        </div>
      ) : summaries.length === 0 ? (
        <div
          style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            backgroundColor: 'var(--color-surface)',
            border: '1px dashed var(--color-surface-border)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              backgroundColor: 'var(--color-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
            }}
          >
            📝
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            No Quizzes Generated Yet
          </h2>
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', maxWidth: '420px', lineHeight: 1.5 }}>
            Open any study note in SynapseSync and click the <strong>&quot;Generate Quiz&quot;</strong> button to generate AI
            questions and flashcards.
          </p>
          <Link
            href="/notes"
            style={{
              marginTop: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Go to Study Notes
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {filteredSummaries.map(({ note, quizzes, latestQuiz, lastGeneratedDate }) => (
            <div
              key={note.id}
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1.25rem',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all var(--transition-fast)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-surface-border)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {quizzes.length} {quizzes.length === 1 ? 'quiz version' : 'quiz versions'}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    v{latestQuiz.version}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    margin: 0,
                    color: 'var(--color-text-primary)',
                    lineHeight: 1.4,
                  }}
                >
                  {note.title}
                </h3>

                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Generated {new Date(lastGeneratedDate).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Link
                  href={`/quiz/${latestQuiz.id}`}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    padding: '0.625rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    boxShadow: 'var(--shadow-glow)',
                  }}
                >
                  Take Quiz →
                </Link>

                <Link
                  href={`/notes/${note.id}`}
                  style={{
                    padding: '0.625rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                  }}
                >
                  📖 Note
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function QuizzesPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading quiz catalog...
        </div>
      }
    >
      <QuizListContent />
    </Suspense>
  );
}
