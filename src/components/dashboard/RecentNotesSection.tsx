'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useGoogleAuth } from '@/components/auth/GoogleAuthProviderWrapper';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { Skeleton } from '@/components/common/Skeleton';

export function RecentNotesSection() {
  const { isAuthenticated } = useGoogleAuth();
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;

    async function loadNotes() {
      if (!isAuthenticated) {
        if (active) {
          setRecentNotes([]);
          setLoading(false);
        }
        return;
      }
      try {
        const dbService = new DatabaseService();
        const noteService = new NoteService(dbService);
        const notes = await noteService.getAll();
        if (active) {
          const sorted = [...notes]
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 5);
          setRecentNotes(sorted);
        }
      } catch (err) {
        console.error('Failed to load recent notes:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadNotes();

    const handleRefresh = () => {
      loadNotes();
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

  return (
    <section aria-label="Recent Notes">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
          }}
        >
          Recent Study Notes
        </h2>
        <Link
          href="/notes"
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--color-primary)',
            textDecoration: 'none',
          }}
        >
          View All Notes →
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height="74px" />
          ))}
        </div>
      ) : recentNotes.length === 0 ? (
        <div
          style={{
            padding: '2.5rem',
            textAlign: 'center',
            backgroundColor: 'var(--color-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-surface-border)',
          }}
        >
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.75rem' }}>
            📚
          </span>
          <p
            style={{
              fontSize: '0.95rem',
              color: 'var(--color-text-secondary)',
              marginBottom: '1rem',
            }}
          >
            No study notes yet. Import lecture notes or transcribe a YouTube video to begin!
          </p>
          <Link
            href="/notes/import"
            className="btn-interactive"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Import Your First Note
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {recentNotes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className="card-interactive"
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                boxShadow: 'var(--shadow-sm)',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.625rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                  }}
                >
                  {note.sourceType.replace('_', ' ')}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {note.wordCount} words
                </span>
              </div>

              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.4,
                }}
              >
                {note.title}
              </h3>

              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                  marginTop: 'auto',
                }}
              >
                Updated {new Date(note.updatedAt).toLocaleDateString()}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
