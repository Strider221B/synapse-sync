'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NoteCard } from '@/components/notes/NoteCard';
import { NotebookList } from '@/components/notes/NotebookList';
import { Skeleton } from '@/components/common/Skeleton';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note, Notebook } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

/**
 * Main notes directory page with notebook filtering, instant search, and note cards.
 */
export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const noteService = new NoteService(dbService);
    const nbService = new NotebookService(dbService);

    async function loadData() {
      setIsLoading(true);
      const [allNotes, allNotebooks] = await Promise.all([
        noteService.getAll(),
        nbService.getAll(),
      ]);
      if (active) {
        setNotes(allNotes);
        setNotebooks(allNotebooks);
        setIsLoading(false);
      }
    }

    void Promise.resolve().then(loadData);
    const handleSyncComplete = () => {
      void loadData();
    };
    window.addEventListener('synapse-sync-completed', handleSyncComplete);

    return () => {
      active = false;
      window.removeEventListener('synapse-sync-completed', handleSyncComplete);
    };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    startTransition(async () => {
      const dbService = new DatabaseService();
      const noteService = new NoteService(dbService);

      if (!query.trim()) {
        const allNotes = await noteService.getAll();
        setNotes(allNotes);
      } else {
        const filtered = await noteService.search(query);
        setNotes(filtered);
      }
    });
  };

  const noteCounts = notes.reduce<Record<string, number>>((acc, note) => {
    acc[note.notebookId] = (acc[note.notebookId] ?? 0) + 1;
    return acc;
  }, {});

  const displayedNotes = notes.filter((n) => {
    if (!selectedNotebookId) return true;
    return n.notebookId === selectedNotebookId;
  });

  const selectedNotebook = notebooks.find((nb) => nb.id === selectedNotebookId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
            Study Notes & Documents
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            Browse lecture transcriptions, Word summaries, and Markdown study materials.
          </p>
        </div>

        <Link
          href="/notes/import"
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
            boxShadow: 'var(--shadow-glow)',
            transition: 'all var(--transition-fast)',
          }}
        >
          <span>📥</span> Import / Create Note
        </Link>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '600px' }}>
        <input
          type="search"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search notes across title and content..."
          style={{
            width: '100%',
            padding: '0.75rem 1rem 0.75rem 2.5rem',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--color-text-primary)',
            fontSize: '0.9rem',
            outline: 'none',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '0.85rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-muted)',
            fontSize: '0.95rem',
          }}
        >
          🔍
        </span>
      </div>

      {/* Main Grid: Sidebar + Notes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: '2rem',
          alignItems: 'start',
        }}
      >
        {/* Notebooks Sidebar */}
        <aside
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
          }}
        >
          <NotebookList
            notebooks={notebooks}
            noteCounts={noteCounts}
            selectedNotebookId={selectedNotebookId}
            onSelectNotebook={(id) => setSelectedNotebookId(id)}
            onNotebookCreated={(nb) => {
              setNotebooks((prev) => [...prev, nb]);
              setSelectedNotebookId(nb.id);
            }}
          />
        </aside>

        {/* Notes Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {selectedNotebook && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                backgroundColor: 'var(--color-surface-raised)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  📁 {selectedNotebook.name}
                </h2>
                {selectedNotebook.description && (
                  <p style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', marginTop: '0.2rem' }}>
                    {selectedNotebook.description}
                  </p>
                )}
              </div>
              <Link
                href={`/notes/notebook/${selectedNotebook.id}`}
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-primary-light)',
                }}
              >
                Manage Notebook →
              </Link>
            </div>
          )}

          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="card" height="130px" />
              ))}
            </div>
          ) : displayedNotes.length === 0 ? (
            <div
              style={{
                padding: '3.5rem 2rem',
                backgroundColor: 'var(--color-surface)',
                border: '1px dashed var(--color-surface-border)',
                borderRadius: 'var(--radius-xl)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div style={{ fontSize: '2.5rem' }}>📚</div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {searchQuery ? 'No matching notes found' : 'No notes in this notebook yet'}
              </h3>
              <p style={{ maxWidth: '420px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {searchQuery
                  ? 'Try searching with different keywords or clear your search query.'
                  : 'Import notes from Google Drive or create a new markdown note manually.'}
              </p>
              <Link
                href="/notes/import"
                style={{
                  padding: '0.625rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                + Add Your First Note
              </Link>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1.25rem',
              }}
            >
              {displayedNotes.map((note) => {
                const noteNb = notebooks.find((nb) => nb.id === note.notebookId);
                return (
                  <NoteCard
                    key={note.id}
                    note={note}
                    notebookName={noteNb?.name}
                    onClick={(id) => router.push(`/notes/${id}`)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
