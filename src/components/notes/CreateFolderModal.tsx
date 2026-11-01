'use client';

import React, { useState, useTransition } from 'react';
import type { Notebook } from '@/lib/db/models';
import { DatabaseService } from '@/lib/db/database_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

export interface CreateFolderModalProps {
  isOpen: boolean;
  parentId: string | null;
  notebooks: Notebook[];
  onClose: () => void;
  onCreated: (notebook: Notebook) => void;
}

/**
 * Modal dialog for creating top-level folders or nested sub-folders.
 */
export function CreateFolderModal({
  isOpen,
  parentId,
  notebooks,
  onClose,
  onCreated,
}: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(parentId);
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Folder name is required');
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
          parentId: selectedParentId || null,
          description: description.trim(),
          source: 'manual',
          tags,
        });

        onCreated(created);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create folder');
      }
    });
  };

  return (
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
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            marginBottom: '1.25rem',
          }}
        >
          {selectedParentId ? 'Create New Sub-folder' : 'Create New Folder'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                marginBottom: '0.35rem',
              }}
            >
              Folder Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stanford CS229, Week 1, Algorithms"
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
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                marginBottom: '0.35rem',
              }}
            >
              Parent Folder (for nesting sub-folders)
            </label>
            <select
              value={selectedParentId ?? ''}
              onChange={(e) => setSelectedParentId(e.target.value || null)}
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
              <option value="">📁 None (Top-Level Folder)</option>
              {notebooks.map((nb) => (
                <option key={nb.id} value={nb.id}>
                  📁 {nb.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                marginBottom: '0.35rem',
              }}
            >
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description of this subject or topic..."
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
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                marginBottom: '0.35rem',
              }}
            >
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="lecture-notes, chapter-1, exams"
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

          {error && <div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{error}</div>}

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
              {isPending ? 'Creating...' : selectedParentId ? 'Create Sub-folder' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

