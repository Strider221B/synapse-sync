'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note, Notebook } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

interface ServerSyncPayload {
  notebooks: Notebook[];
  notes: Note[];
}

/**
 * Displays YouTube notebooks, videos count, and individual lecture notes with server synchronization.
 */
export function YouTubeNotesViewer() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notesByNotebook, setNotesByNotebook] = useState<Record<string, Note[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const loadLocalData = useCallback(async () => {
    const dbService = new DatabaseService();
    const nbService = new NotebookService(dbService);
    const noteService = new NoteService(dbService);

    const allNotebooks = await nbService.getAll();
    const ytNotebooks = allNotebooks.filter((nb) => nb.source === 'youtube_playlist');
    setNotebooks(ytNotebooks);

    const groupedNotes: Record<string, Note[]> = {};
    for (const nb of ytNotebooks) {
      const notes = await noteService.getByNotebook(nb.id);
      groupedNotes[nb.id] = notes;
    }
    setNotesByNotebook(groupedNotes);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const dbService = new DatabaseService();
    const nbService = new NotebookService(dbService);
    const noteService = new NoteService(dbService);

    async function loadData() {
      const allNotebooks = await nbService.getAll();
      const ytNotebooks = allNotebooks.filter((nb) => nb.source === 'youtube_playlist');
      const groupedNotes: Record<string, Note[]> = {};
      for (const nb of ytNotebooks) {
        const notes = await noteService.getByNotebook(nb.id);
        groupedNotes[nb.id] = notes;
      }
      if (active) {
        setNotebooks(ytNotebooks);
        setNotesByNotebook(groupedNotes);
        setIsLoading(false);
      }
    }

    void Promise.resolve().then(loadData);
    return () => {
      active = false;
    };
  }, []);

  const handleSyncWithServer = async () => {
    setIsSyncing(true);
    setSyncStatus('Checking server for newly processed notes...');

    const apiClient = new ApiClient();
    const dbService = new DatabaseService();
    const nbService = new NotebookService(dbService);
    const noteService = new NoteService(dbService);

    try {
      const data = await apiClient.get<ServerSyncPayload>('/api/youtube-notes');
      let newNotesCount = 0;

      if (data.notebooks) {
        for (const serverNb of data.notebooks) {
          const existing = await nbService.getById(serverNb.id);
          if (!existing) {
            await nbService.create({
              name: serverNb.name,
              source: 'youtube_playlist',
              sourceUrl: serverNb.sourceUrl,
              description: serverNb.description,
              tags: serverNb.tags || ['youtube'],
            });
          }
        }
      }

      if (data.notes) {
        for (const serverNote of data.notes) {
          const existing = await noteService.getById(serverNote.id);
          if (!existing) {
            await noteService.create({
              notebookId: serverNote.notebookId,
              title: serverNote.title,
              content: serverNote.content,
              contentFormat: serverNote.contentFormat || 'markdown',
              sourceType: 'youtube_transcript',
              sourceUrl: serverNote.sourceUrl,
            });
            newNotesCount += 1;
          }
        }
      }

      await loadLocalData();
      setSyncStatus(
        newNotesCount > 0
          ? `Synced ${newNotesCount} new note(s) from server!`
          : 'Everything is up to date.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setSyncStatus(`Sync error: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading YouTube study notes...
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            YouTube Study Notebooks
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0' }}>
            {notebooks.length} notebook(s) available
          </p>
        </div>

        <button
          onClick={handleSyncWithServer}
          disabled={isSyncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.625rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          {isSyncing ? '⏳ Syncing...' : '🔄 Sync from Server'}
        </button>
      </div>

      {syncStatus && (
        <div
          style={{
            padding: '0.625rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid var(--color-primary)',
            color: 'var(--color-text-primary)',
            fontSize: '0.8125rem',
            marginBottom: '1.5rem',
          }}
        >
          ℹ️ {syncStatus}
        </div>
      )}

      {notebooks.length === 0 ? (
        <div
          style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px dashed var(--color-border)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📺</div>
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              marginBottom: '0.5rem',
            }}
          >
            No YouTube Notebooks Found
          </h3>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
              maxWidth: '520px',
              margin: '0 auto 1.5rem auto',
              lineHeight: 1.6,
            }}
          >
            Run the local CLI tool to process entire YouTube video series or playlists and push detailed notes
            to this device:
          </p>
          <div
            style={{
              display: 'inline-block',
              textAlign: 'left',
              padding: '0.75rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              color: 'var(--color-primary-light)',
            }}
          >
            python tools/youtube_cli/main.py process --url &lt;youtube_playlist_url&gt;
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {notebooks.map((nb) => {
            const notes = notesByNotebook[nb.id] || [];
            return (
              <div
                key={nb.id}
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--color-border)',
                  padding: '1.5rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '1rem',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontSize: '1.125rem',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        margin: '0 0 0.25rem 0',
                      }}
                    >
                      {nb.name}
                    </h3>
                    {nb.description && (
                      <p
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--color-text-muted)',
                          margin: '0 0 0.5rem 0',
                        }}
                      >
                        {nb.description}
                      </p>
                    )}
                    {nb.sourceUrl && (
                      <a
                        href={nb.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-primary)',
                          textDecoration: 'none',
                        }}
                      >
                        🔗 Open YouTube Playlist ↗
                      </a>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.25rem 0.625rem',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {notes.length} note{notes.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  {notes.map((note) => (
                    <Link
                      key={note.id}
                      href={`/notes/${note.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-primary)',
                        textDecoration: 'none',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1rem' }}>▶️</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{note.title}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {note.wordCount.toLocaleString()} words
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
