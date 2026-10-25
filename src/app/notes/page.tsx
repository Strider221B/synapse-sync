'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
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
 * Main notes directory page with folder & sub-folder hierarchy, grouped views, and responsive mobile UI.
 */
export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'list'>('grouped');
  const [isLoading, setIsLoading] = useState(true);
  const [noteToMove, setNoteToMove] = useState<Note | null>(null);
  const [targetMoveFolderId, setTargetMoveFolderId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
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

  const noteCounts = useMemo(() => {
    return notes.reduce<Record<string, number>>((acc, note) => {
      acc[note.notebookId] = (acc[note.notebookId] ?? 0) + 1;
      return acc;
    }, {});
  }, [notes]);

  const notebookMap = useMemo(() => {
    return new Map<string, Notebook>(notebooks.map((nb) => [nb.id, nb]));
  }, [notebooks]);

  // Current folder and breadcrumb path from root
  const breadcrumbPath = useMemo(() => {
    if (!selectedNotebookId) return [];
    const path: Notebook[] = [];
    let current = notebookMap.get(selectedNotebookId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? notebookMap.get(current.parentId) : undefined;
    }
    return path;
  }, [selectedNotebookId, notebookMap]);

  // Immediate sub-folders of the currently active view
  const currentSubfolders = useMemo(() => {
    return notebooks.filter((nb) => {
      if (!selectedNotebookId) {
        return !nb.parentId;
      }
      return nb.parentId === selectedNotebookId;
    });
  }, [notebooks, selectedNotebookId]);

  // Notes filtered by search and selected folder
  const displayedNotes = useMemo(() => {
    return notes.filter((n) => {
      if (!selectedNotebookId) return true;
      return n.notebookId === selectedNotebookId;
    });
  }, [notes, selectedNotebookId]);

  // Grouped notes by folder when viewing All Notes in grouped mode
  const groupedSections = useMemo(() => {
    if (selectedNotebookId || viewMode !== 'grouped') return [];

    const groups: { folder: Notebook | null; folderNotes: Note[] }[] = [];
    const notesByFolder: Record<string, Note[]> = {};

    displayedNotes.forEach((note) => {
      const folderKey = note.notebookId || '__unfiled__';
      if (!notesByFolder[folderKey]) {
        notesByFolder[folderKey] = [];
      }
      notesByFolder[folderKey].push(note);
    });

    // Add folders that have notes, ordered by notebook list
    notebooks.forEach((nb) => {
      if (notesByFolder[nb.id] && notesByFolder[nb.id].length > 0) {
        groups.push({ folder: nb, folderNotes: notesByFolder[nb.id] });
      }
    });

    // Add unfiled notes if any
    if (notesByFolder['__unfiled__'] && notesByFolder['__unfiled__'].length > 0) {
      groups.push({ folder: null, folderNotes: notesByFolder['__unfiled__'] });
    }

    return groups;
  }, [selectedNotebookId, viewMode, displayedNotes, notebooks]);

  const handleOpenMoveModal = (note: Note) => {
    setNoteToMove(note);
    setTargetMoveFolderId(note.notebookId || (notebooks[0]?.id ?? ''));
  };

  const handleConfirmMove = async () => {
    if (!noteToMove || !targetMoveFolderId) return;
    setIsMoving(true);
    try {
      const dbService = new DatabaseService();
      const noteService = new NoteService(dbService);
      const updated = await noteService.update(noteToMove.id, {
        notebookId: targetMoveFolderId,
      });

      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setNoteToMove(null);
    } finally {
      setIsMoving(false);
    }
  };

  const selectedNotebook = selectedNotebookId ? notebookMap.get(selectedNotebookId) : null;

  return (
    <div className="notes-page-container">
      {/* Top Header */}
      <div className="notes-page-header">
        <div>
          <h1 className="notes-page-title">Study Notes & Documents</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            Organize study notes into folders, review flashcards, and launch AI quizzes.
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
            textDecoration: 'none',
          }}
        >
          <span>📥</span> Import / Create Note
        </Link>
      </div>

      {/* Search Bar & View Mode Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          width: '100%',
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '540px' }}>
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

        {/* View Mode Toggle when viewing all notes */}
        {!selectedNotebookId && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.2rem',
              gap: '0.2rem',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.4rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: viewMode === 'grouped' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'grouped' ? '#ffffff' : 'var(--color-text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
              title="Group notes into folder sections"
            >
              <span>📁</span> Group by Folder
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.4rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: viewMode === 'list' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'list' ? '#ffffff' : 'var(--color-text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
              title="View all notes in a unified list"
            >
              <span>📄</span> All Notes
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Sidebar + Notes */}
      <div className="notes-main-grid">
        {/* Hierarchical Folder Tree Sidebar */}
        <aside className="notes-sidebar">
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

        {/* Notes Content Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', minWidth: 0 }}>
          {/* Breadcrumb Navigation when inside a folder */}
          {selectedNotebook && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.875rem 1.25rem',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-lg)',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              {/* Breadcrumbs */}
              <nav style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setSelectedNotebookId(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--color-text-muted)',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  📚 All Notes
                </button>
                {breadcrumbPath.map((folder, index) => {
                  const isLast = index === breadcrumbPath.length - 1;
                  return (
                    <React.Fragment key={folder.id}>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>/</span>
                      {isLast ? (
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 700, fontSize: '0.875rem' }}>
                          📁 {folder.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedNotebookId(folder.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--color-primary)',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {folder.name}
                        </button>
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>

              <Link
                href={`/notes/notebook/${selectedNotebook.id}`}
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-primary)',
                  fontWeight: 600,
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-primary-light)',
                  textDecoration: 'none',
                }}
              >
                Manage Folder →
              </Link>
            </div>
          )}

          {/* Sub-Folders Section (displayed if active folder has subfolders) */}
          {currentSubfolders.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                backgroundColor: 'var(--color-surface-raised)',
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.775rem',
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {selectedNotebook ? 'Sub-folders' : 'Top-Level Folders'} ({currentSubfolders.length})
              </span>

              <div className="notes-subfolders-grid">
                {currentSubfolders.map((sf) => (
                  <div
                    key={sf.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedNotebookId(sf.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelectedNotebookId(sf.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-surface-border)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      gap: '0.5rem',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary-glow)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-surface-border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                      <span style={{ fontSize: '1.1rem' }}>📁</span>
                      <span
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--color-text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {sf.name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--color-surface-raised)',
                        color: 'var(--color-text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {noteCounts[sf.id] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes Rendering Area */}
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
                {searchQuery ? 'No matching notes found' : 'No notes in this folder yet'}
              </h3>
              <p style={{ maxWidth: '420px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {searchQuery
                  ? 'Try searching with different keywords or clear your search query.'
                  : 'Import notes from Google Drive or create a new markdown note manually in this folder.'}
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
                  textDecoration: 'none',
                }}
              >
                + Add Your First Note
              </Link>
            </div>
          ) : !selectedNotebookId && viewMode === 'grouped' ? (
            /* Grouped View: Notes separated by folder headers */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {groupedSections.map(({ folder, folderNotes }) => (
                <div key={folder ? folder.id : 'unfiled'} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1.5px solid var(--color-surface-border)',
                      paddingBottom: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.15rem' }}>📁</span>
                      <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                        {folder ? folder.name : 'Unfiled Notes'}
                      </h2>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--color-surface-raised)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {folderNotes.length}
                      </span>
                    </div>

                    {folder && (
                      <button
                        type="button"
                        onClick={() => setSelectedNotebookId(folder.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-primary)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Open Folder →
                      </button>
                    )}
                  </div>

                  <div className="notes-cards-grid">
                    {folderNotes.map((note) => {
                      const noteNb = notebooks.find((nb) => nb.id === note.notebookId);
                      return (
                        <NoteCard
                          key={note.id}
                          note={note}
                          notebookName={noteNb?.name}
                          onClick={(id) => router.push(`/notes/${id}`)}
                          onMove={handleOpenMoveModal}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Flat Grid View: All notes displayed uniformly */
            <div className="notes-cards-grid">
              {displayedNotes.map((note) => {
                const noteNb = notebooks.find((nb) => nb.id === note.notebookId);
                return (
                  <NoteCard
                    key={note.id}
                    note={note}
                    notebookName={noteNb?.name}
                    onClick={(id) => router.push(`/notes/${id}`)}
                    onMove={handleOpenMoveModal}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Move Note to Folder Modal */}
      {noteToMove && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
          onClick={() => setNoteToMove(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              borderRadius: 'var(--radius-xl)',
              padding: '1.75rem',
              width: '100%',
              maxWidth: '440px',
              boxShadow: 'var(--shadow-lg)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
              Move Note to Folder
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Choose a folder for &ldquo;{noteToMove.title}&rdquo;:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                  Destination Folder
                </label>
                <select
                  value={targetMoveFolderId}
                  onChange={(e) => setTargetMoveFolderId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {notebooks.map((nb) => (
                    <option key={nb.id} value={nb.id}>
                      📁 {nb.name} {nb.parentId ? '(Sub-folder)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setNoteToMove(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-secondary)',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-surface-border)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMove}
                  disabled={isMoving || !targetMoveFolderId}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isMoving ? 'wait' : 'pointer',
                  }}
                >
                  {isMoving ? 'Moving...' : 'Move Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
