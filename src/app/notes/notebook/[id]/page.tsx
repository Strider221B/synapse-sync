'use client';

import React, { Suspense, use, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NoteCard } from '@/components/notes/NoteCard';
import { MoveFolderModal } from '@/components/notes/MoveFolderModal';
import { DatabaseService } from '@/lib/db/database_service';
import type { Note, Notebook } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

interface NotebookDetailPageProps {
  params: Promise<{ id: string }>;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-surface-border)',
  color: 'var(--color-text-primary)',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-raised)',
  border: '1px solid var(--color-surface-border)', color: 'var(--color-text-primary)',
  fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer',
};

function NotebookDetailContent({ params }: NotebookDetailPageProps) {
  const resolvedParams = use(params);
  const notebookId = resolvedParams.id;
  const router = useRouter();

  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [allNotebooks, setAllNotebooks] = useState<Notebook[]>([]);
  const [subfolders, setSubfolders] = useState<Notebook[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit & Move State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editParentId, setEditParentId] = useState<string>('');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(async () => {
    const dbService = new DatabaseService();
    const nbService = new NotebookService(dbService);
    const noteService = new NoteService(dbService);

    const [foundNb, foundNotes, foundSubfolders, allNbs] = await Promise.all([
      nbService.getById(notebookId),
      noteService.getByNotebook(notebookId),
      nbService.getByParent(notebookId),
      nbService.getAll(),
    ]);

    setNotebook(foundNb ?? null);
    setNotes(foundNotes);
    setSubfolders(foundSubfolders);
    setAllNotebooks(allNbs);
    if (foundNb) {
      setEditName(foundNb.name);
      setEditDescription(foundNb.description ?? '');
      setEditParentId(foundNb.parentId ?? '');
    }
    setIsLoading(false);
  }, [notebookId]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const isEmpty = notes.length === 0 && subfolders.length === 0;

  const availableParents = useMemo(() => {
    if (!notebook) return [];
    const descendants = NotebookService.getDescendantIdsFromList(notebook.id, allNotebooks);
    return allNotebooks.filter((nb) => nb.id !== notebook.id && !descendants.has(nb.id));
  }, [notebook, allNotebooks]);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    startTransition(async () => {
      const dbService = new DatabaseService();
      const nbService = new NotebookService(dbService);
      const targetParentId = editParentId.trim() ? editParentId.trim() : null;
      if (targetParentId !== (notebook?.parentId ?? null)) {
        await nbService.move(notebookId, targetParentId);
      }
      const updated = await nbService.update(notebookId, {
        name: editName.trim(),
        description: editDescription.trim(),
      });
      setNotebook(updated);
      setIsEditing(false);
      void loadData();

      const { SyncManager } = await import('@/lib/db/sync_manager');
      const syncManager = SyncManager.getInstance();
      const syncService = syncManager.getSyncService();
      if (syncService && syncService.isConnected()) {
        await syncService.pushNotebook(updated);
      }
      void syncManager.forceSync().catch(() => {});
    });
  };

  const handleDeleteNotebook = async () => {
    if (!notebook) return;
    if (!isEmpty) {
      alert('Cannot delete folder: it contains notes or subfolders. Delete or move them first.');
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to delete the empty folder "${notebook.name}"?`
    );
    if (!confirmed) return;

    const dbService = new DatabaseService();
    const nbService = new NotebookService(dbService);
    await nbService.delete(notebook.id);

    const { SyncManager } = await import('@/lib/db/sync_manager');
    const syncService = SyncManager.getInstance().getSyncService();
    if (syncService) {
      await syncService.deleteRemoteNotebook(notebook.id).catch(() => {});
    }
    void SyncManager.getInstance().forceSync().catch(() => {});

    router.push('/notes');
  };

  if (isLoading) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading notebook details...
      </div>
    );
  }

  if (!notebook) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Notebook Not Found
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0.75rem 0 1.5rem 0' }}>
          The requested notebook could not be located.
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
          Back to Notes
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Navigation */}
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
        ← Back to All Notes
      </Link>

      {/* Notebook Header Banner */}
      <div
        style={{
          padding: '2rem',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 'var(--radius-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {isEditing ? (
          <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                Notebook Name *
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                Description
              </label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                Parent Folder (for nesting sub-folders)
              </label>
              <select
                value={editParentId}
                onChange={(e) => setEditParentId(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">📁 None (Top-Level Folder)</option>
                {availableParents.map((nb) => (
                  <option key={nb.id} value={nb.id}>
                    📁 {nb.name} {nb.parentId ? '(Sub-folder)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{ padding: '0.45rem 1rem', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--color-surface-border)', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                style={{ padding: '0.45rem 1.25rem', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 600, fontSize: '0.85rem' }}
              >
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ maxWidth: '640px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {notebook.source}
                </span>
                <span style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)' }}>
                  {notes.length} note{notes.length === 1 ? '' : 's'}
                </span>
              </div>

              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                📁 {notebook.name}
              </h1>

              {notebook.description && (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', marginTop: '0.5rem', lineHeight: 1.5 }}>
                  {notebook.description}
                </p>
              )}

              {notebook.tags && notebook.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
                  {notebook.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--color-surface-raised)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-surface-border)',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(true)}
                style={actionBtnStyle}
              >
                📁 Move Folder
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                style={actionBtnStyle}
              >
                ✏️ Edit Notebook
              </button>
              <button
                type="button"
                disabled={!isEmpty}
                onClick={handleDeleteNotebook}
                title={
                  isEmpty
                    ? `Delete empty notebook "${notebook.name}"`
                    : `Cannot delete: contains ${notes.length} note${notes.length === 1 ? '' : 's'} and ${subfolders.length} sub-folder${subfolders.length === 1 ? '' : 's'}`
                }
                style={{
                  padding: '0.5rem 0.875rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-surface-border)',
                  color: isEmpty ? 'var(--color-error)' : 'var(--color-text-muted)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: isEmpty ? 'pointer' : 'not-allowed',
                  opacity: isEmpty ? 1 : 0.4,
                }}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-folders in this notebook (if any) */}
      {subfolders.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Sub-folders ({subfolders.length})
            </h2>
          </div>
          <div className="notes-subfolders-grid" style={{ marginBottom: '2rem' }}>
            {subfolders.map((sf) => (
              <Link
                key={sf.id}
                href={`/notes/notebook/${sf.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-surface-border)',
                  textDecoration: 'none',
                  color: 'var(--color-text-primary)',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                  <span style={{ fontSize: '1.1rem' }}>📁</span>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sf.name}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  Manage →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Notes Grid */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Notes in this Notebook
          </h2>
          <Link
            href="/notes/import"
            style={{
              fontSize: '0.825rem',
              fontWeight: 600,
              color: 'var(--color-primary)',
              backgroundColor: 'var(--color-primary-light)',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            + Import / Add Note
          </Link>
        </div>

        {notes.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              backgroundColor: 'var(--color-surface)',
              border: '1px dashed var(--color-surface-border)',
              borderRadius: 'var(--radius-lg)',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            No notes have been added to this notebook yet.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                notebookName={notebook.name}
                onClick={(id) => router.push(`/notes/${id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Move Folder Modal */}
      <MoveFolderModal
        folder={notebook}
        notebooks={allNotebooks}
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        onMoved={(updated) => {
          setNotebook(updated);
          setIsMoveModalOpen(false);
          void loadData();
        }}
      />
    </div>
  );
}

/**
 * Notebook detail page displaying metadata, member notes, and notebook management actions.
 */
export default function NotebookDetailPage({ params }: NotebookDetailPageProps) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Loading notebook...
        </div>
      }
    >
      <NotebookDetailContent params={params} />
    </Suspense>
  );
}

