'use client';

import React from 'react';
import type { Note } from '@/lib/db/models';

interface NoteCardProps {
  note: Note;
  notebookName?: string;
  onClick?: (id: string) => void;
}

function getSourceIcon(sourceType: Note['sourceType']): { icon: string; label: string; color: string } {
  switch (sourceType) {
    case 'gdrive_docx':
      return { icon: '📄', label: 'Drive Docx', color: '#0f9d58' };
    case 'gdrive_md':
      return { icon: '📝', label: 'Drive MD', color: '#4285f4' };
    case 'gdrive_doc':
      return { icon: '📑', label: 'Google Doc', color: '#4285f4' };
    case 'youtube_transcript':
      return { icon: '🎬', label: 'YouTube', color: '#ef4444' };
    default:
      return { icon: '✍️', label: 'Manual', color: 'var(--color-primary)' };
  }
}

/**
 * Reusable card displaying note summary, source metadata, and metrics.
 */
export function NoteCard({ note, notebookName, onClick }: NoteCardProps) {
  const sourceInfo = getSourceIcon(note.sourceType);
  const readTimeMinutes = Math.max(1, Math.round(note.wordCount / 250));
  const formattedDate = new Date(note.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleClick = () => {
    if (onClick) {
      onClick(note.id);
    }
  };

  const previewSnippet = note.content
    .replace(/[#*`_>\[\]]/g, '')
    .trim()
    .slice(0, 140);

  return (
    <article
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-primary-glow)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-surface-border)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.75rem',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            color: 'var(--color-text-secondary)',
            fontWeight: 500,
          }}
        >
          <span>{sourceInfo.icon}</span>
          <span>{sourceInfo.label}</span>
        </span>

        {notebookName && (
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-primary)',
              backgroundColor: 'var(--color-primary-light)',
              padding: '0.15rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 500,
            }}
          >
            📁 {notebookName}
          </span>
        )}
      </div>

      <h3
        style={{
          fontSize: '1.05rem',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {note.title}
      </h3>

      {previewSnippet && (
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {previewSnippet}...
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          color: 'var(--color-text-muted)',
          marginTop: 'auto',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--color-surface-border-subtle)',
        }}
      >
        <span>
          {note.wordCount.toLocaleString()} words • {readTimeMinutes} min
        </span>
        <span>{formattedDate}</span>
      </div>
    </article>
  );
}
