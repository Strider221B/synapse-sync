'use client';

import React from 'react';

interface ClearDataModalProps {
  isOpen: boolean;
  isClearing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog for permanently wiping all local IndexedDB data stores.
 */
export function ClearDataModal({
  isOpen,
  isClearing,
  onClose,
  onConfirm,
}: ClearDataModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1.5rem',
      }}
    >
      <div
        className="animate-fade-in"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          padding: '2rem',
          maxWidth: '480px',
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            marginBottom: '1rem',
          }}
        >
          ⚠️
        </div>

        <h3
          id="clear-modal-title"
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            marginBottom: '0.5rem',
          }}
        >
          Clear All Local Data?
        </h3>

        <p
          style={{
            fontSize: '0.9rem',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
            marginBottom: '1.5rem',
          }}
        >
          This action will permanently delete all notebooks, notes, generated quizzes, flashcards,
          and spaced repetition progress from your browser storage. This action cannot be undone.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isClearing}
            className="btn-interactive"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-surface-border)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isClearing}
            className="btn-interactive"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: 'var(--color-error)',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isClearing ? 'wait' : 'pointer',
            }}
          >
            {isClearing ? 'Clearing...' : 'Yes, Delete All'}
          </button>
        </div>
      </div>
    </div>
  );
}
