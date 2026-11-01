'use client';

import React, { useMemo, useState, useTransition } from 'react';
import type { Notebook } from '@/lib/db/models';
import { DatabaseService } from '@/lib/db/database_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

export interface MoveFolderModalProps {
  folder: Notebook | null;
  notebooks: Notebook[];
  isOpen: boolean;
  onClose: () => void;
  onMoved: (updatedFolder: Notebook) => void;
}

interface MoveFolderModalDialogProps {
  folder: Notebook;
  notebooks: Notebook[];
  onClose: () => void;
  onMoved: (updatedFolder: Notebook) => void;
}

function MoveFolderModalDialog({
  folder,
  notebooks,
  onClose,
  onMoved,
}: MoveFolderModalDialogProps) {
  const [targetParentId, setTargetParentId] = useState<string>(folder.parentId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Exclude current folder and all of its recursive descendants to prevent circular hierarchy
  const availableParents = useMemo(() => {
    const descendantIds = NotebookService.getDescendantIdsFromList(folder.id, notebooks);
    return notebooks.filter((nb) => nb.id !== folder.id && !descendantIds.has(nb.id));
  }, [folder.id, notebooks]);

  const handleMove = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const dbService = new DatabaseService();
        const notebookService = new NotebookService(dbService);
        const newParentId = targetParentId.trim() ? targetParentId.trim() : null;
        const updated = await notebookService.move(folder.id, newParentId);
        onMoved(updated);
        onClose();

        const { SyncManager } = await import('@/lib/db/sync_manager');
        const syncManager = SyncManager.getInstance();
        const syncService = syncManager.getSyncService();
        if (syncService && syncService.isConnected()) {
          await syncService.pushNotebook(updated);
        }
        void syncManager.forceSync().catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to move folder');
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-folder-title"
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
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 'var(--radius-xl)',
          padding: '1.75rem',
          width: '100%',
          maxWidth: '460px',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="move-folder-title"
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            marginBottom: '0.5rem',
          }}
        >
          Move Folder
        </h2>
        <p
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: '0.875rem',
            marginBottom: '1.25rem',
          }}
        >
          Choose a new destination for &ldquo;{folder.name}&rdquo;. All notes and sub-folders within it will be moved together.
        </p>

        <form onSubmit={handleMove} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              htmlFor="destination-folder-select"
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                marginBottom: '0.35rem',
              }}
            >
              Destination Parent Folder
            </label>
            <select
              id="destination-folder-select"
              value={targetParentId}
              onChange={(e) => setTargetParentId(e.target.value)}
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
              <option value="">📁 None (Make Top-Level Folder)</option>
              {availableParents.map((nb) => (
                <option key={nb.id} value={nb.id}>
                  📁 {nb.name} {nb.parentId ? '(Sub-folder)' : ''}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
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
              type="submit"
              disabled={isPending}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                fontWeight: 600,
                cursor: isPending ? 'wait' : 'pointer',
              }}
            >
              {isPending ? 'Moving...' : 'Move Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal dialog allowing users to move a folder and all its contents to another parent folder or top-level.
 */
export function MoveFolderModal({
  folder,
  notebooks,
  isOpen,
  onClose,
  onMoved,
}: MoveFolderModalProps) {
  if (!isOpen || !folder) return null;

  return (
    <MoveFolderModalDialog
      key={folder.id}
      folder={folder}
      notebooks={notebooks}
      onClose={onClose}
      onMoved={onMoved}
    />
  );
}
