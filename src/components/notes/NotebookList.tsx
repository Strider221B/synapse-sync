'use client';

import React, { useState, useTransition } from 'react';
import type { Notebook } from '@/lib/db/models';
import { DatabaseService } from '@/lib/db/database_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

interface NotebookListProps {
  notebooks: Notebook[];
  noteCounts?: Record<string, number>;
  selectedNotebookId?: string | null;
  onSelectNotebook?: (id: string | null) => void;
  onNotebookCreated?: (notebook: Notebook) => void;
}

/**
 * Component for viewing, selecting, and creating notebooks.
 */
export function NotebookList({
  notebooks,
  noteCounts,
  selectedNotebookId,
  onSelectNotebook,
  onNotebookCreated,
}: NotebookListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Notebook name is required');
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const dbService = new DatabaseService();
        const notebookService = new NotebookService(dbService);
        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);

        const created = await notebookService.create({
          name: name.trim(),
          description: description.trim(),
          source: 'manual',
          tags,
        });

        setName('');
        setDescription('');
        setTagsInput('');
        setShowCreateModal(false);
        if (onNotebookCreated) {
          onNotebookCreated(created);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create notebook');
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Notebooks
        </h3>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            fontWeight: 600,
            border: '1px solid var(--color-primary-glow)',
            cursor: 'pointer',
          }}
        >
          + New Notebook
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectNotebook?.(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelectNotebook?.(null);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.625rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            backgroundColor: selectedNotebookId === null || selectedNotebookId === undefined
              ? 'var(--color-primary-light)'
              : 'transparent',
            color: selectedNotebookId === null || selectedNotebookId === undefined
              ? 'var(--color-primary)'
              : 'var(--color-text-secondary)',
            fontWeight: selectedNotebookId === null || selectedNotebookId === undefined ? 600 : 500,
            border: selectedNotebookId === null || selectedNotebookId === undefined
              ? '1px solid var(--color-primary-glow)'
              : '1px solid transparent',
          }}
        >
          <span>📚 All Notes</span>
        </div>

        {notebooks.map((nb) => {
          const isSelected = selectedNotebookId === nb.id;
          return (
            <div
              key={nb.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectNotebook?.(nb.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectNotebook?.(nb.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.625rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                backgroundColor: isSelected ? 'var(--color-primary-light)' : 'transparent',
                color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: isSelected ? 600 : 500,
                border: isSelected ? '1px solid var(--color-primary-glow)' : '1px solid transparent',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📁 {nb.name}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-surface-raised)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {noteCounts?.[nb.id] ?? 0}
              </span>
            </div>
          );
        })}
      </div>

      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem',
          }}
          onClick={() => setShowCreateModal(false)}
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '1.25rem' }}>
              Create New Notebook
            </h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                  Notebook Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Stanford CS229, Biology 101"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                  Description (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Short summary of this subject..."
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="machine-learning, lecture-notes"
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-surface-border)',
                    color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              {error && (
                <div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{error}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                  {isPending ? 'Creating...' : 'Create Notebook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
