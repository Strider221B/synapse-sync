'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note, Notebook } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

function ChatPageContent() {
  const searchParams = useSearchParams();
  const requestedNoteId = searchParams.get('noteId');

  const [notes, setNotes] = useState<Note[]>([]);
  const [notebooks, setNotebooks] = useState<Record<string, Notebook>>({});
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(requestedNoteId);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const noteService = new NoteService(dbService);
    const nbService = new NotebookService(dbService);

    Promise.all([noteService.getAll(), nbService.getAll()])
      .then(([allNotes, allNotebooks]) => {
        if (!active) return;
        setNotes(allNotes);

        const nbMap: Record<string, Notebook> = {};
        for (const nb of allNotebooks) {
          nbMap[nb.id] = nb;
        }
        setNotebooks(nbMap);

        if (requestedNoteId && allNotes.some((n) => n.id === requestedNoteId)) {
          setSelectedNoteId(requestedNoteId);
        } else if (allNotes.length > 0) {
          setSelectedNoteId(allNotes[0].id);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load notes for chat:', err);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [requestedNoteId]);

  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  if (isLoading) {
    return (
      <div
        style={{
          padding: '4rem 1rem',
          textAlign: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        Loading AI Study Assistant...
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div
        style={{
          maxWidth: '600px',
          margin: '4rem auto',
          padding: '2.5rem',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-surface-border)',
          boxShadow: 'var(--shadow-md)',
        }}
        data-testid="no-notes-empty-state"
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-primary-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            margin: '0 auto 1.25rem auto',
          }}
        >
          📚
        </div>
        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          No Study Notes Found
        </h2>
        <p
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            marginBottom: '1.75rem',
          }}
        >
          The AI Study Assistant needs note content to reference. Import or create a study note
          first to start asking questions!
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <Link
            href="/notes/import"
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            Import Notes
          </Link>
          <Link
            href="/youtube"
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            Import YouTube
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '1000px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {/* Top Header & Note Selector Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1rem 1.25rem',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-surface-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🤖</span>
            <span
              style={{
                fontWeight: 700,
                fontSize: '1.125rem',
                color: 'var(--color-text-primary)',
              }}
            >
              AI Study Assistant
            </span>
          </div>

          {/* Note Switcher Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
            <label
              htmlFor="chat-note-select"
              style={{
                fontSize: '0.825rem',
                fontWeight: 600,
                color: 'var(--color-text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              Discussing Note:
            </label>
            <select
              id="chat-note-select"
              value={selectedNoteId ?? ''}
              onChange={(e) => setSelectedNoteId(e.target.value)}
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-primary)',
                fontSize: '0.875rem',
                fontWeight: 500,
                outline: 'none',
                cursor: 'pointer',
              }}
              data-testid="chat-note-selector"
            >
              {notes.map((n) => {
                const nbTitle = n.notebookId && notebooks[n.notebookId] ? ` (${notebooks[n.notebookId].name})` : '';
                return (
                  <option key={n.id} value={n.id}>
                    {n.title}
                    {nbTitle}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {selectedNote && (
          <Link
            href={`/notes/${selectedNote.id}`}
            style={{
              fontSize: '0.825rem',
              fontWeight: 500,
              color: 'var(--color-primary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <span>View Note</span>
            <span>↗</span>
          </Link>
        )}
      </div>

      {/* Main Chat Interface */}
      {selectedNote ? (
        <ChatInterface
          key={selectedNote.id}
          noteId={selectedNote.id}
          noteTitle={selectedNote.title}
          noteContent={selectedNote.content}
        />
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading chat...
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
