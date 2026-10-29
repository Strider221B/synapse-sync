'use client';

import React from 'react';
import type { QuizExportBundle } from '@/lib/services/quiz_import_export_service';

export interface QuizExportTabProps {
  noteTitle: string;
  exportBundle: QuizExportBundle | null;
  activeExportChunkIndex: number;
  setActiveExportChunkIndex: (idx: number) => void;
  copiedChunk: number | null;
  onCopyChunkPrompt: (chunkIndex: number, promptText: string) => void;
  onDownloadJson: () => void;
  onDownloadMarkdown: () => void;
}

export function QuizExportTab({
  noteTitle,
  exportBundle,
  activeExportChunkIndex,
  setActiveExportChunkIndex,
  copiedChunk,
  onCopyChunkPrompt,
  onDownloadJson,
  onDownloadMarkdown,
}: QuizExportTabProps) {
  const activeExportChunk = exportBundle?.chunks[activeExportChunkIndex] || exportBundle?.chunks[0];

  return (
    <>
      {/* Metadata Summary Banner */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-surface-raised)',
          border: '1px solid var(--color-surface-border)',
          fontSize: '0.825rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Document:</span> {noteTitle}
          <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>•</span>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Chunks:</span> {exportBundle?.totalChunks || 1}
          <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>•</span>
          <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Excluded Past Items:</span>{' '}
          {exportBundle?.previousContextCount || 0}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onDownloadJson}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
            }}
          >
            💾 Download JSON
          </button>
          <button
            type="button"
            onClick={onDownloadMarkdown}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-surface-border)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--color-text-primary)',
            }}
          >
            📄 Download MD
          </button>
        </div>
      </div>

      {/* Chunk Selector if Multi-Chunk */}
      {exportBundle && exportBundle.totalChunks > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {exportBundle.chunks.map((chk, idx) => (
            <button
              key={chk.chunkIndex}
              type="button"
              onClick={() => setActiveExportChunkIndex(idx)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: idx === activeExportChunkIndex ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                backgroundColor: idx === activeExportChunkIndex ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: idx === activeExportChunkIndex ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Chunk {chk.chunkIndex} ({chk.wordCount} words)
            </button>
          ))}
        </div>
      )}

      {/* Active Chunk Prompt Card */}
      {activeExportChunk && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Prompt for Chunk {activeExportChunk.chunkIndex} of {activeExportChunk.totalChunks} ({activeExportChunk.wordCount} words):
            </span>
            <button
              type="button"
              onClick={() => onCopyChunkPrompt(activeExportChunk.chunkIndex, activeExportChunk.prompt)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: copiedChunk === activeExportChunk.chunkIndex ? 'var(--color-success-bg)' : 'var(--color-primary)',
                color: copiedChunk === activeExportChunk.chunkIndex ? 'var(--color-success)' : '#ffffff',
                border: `1px solid ${copiedChunk === activeExportChunk.chunkIndex ? 'var(--color-success)' : 'var(--color-primary)'}`,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {copiedChunk === activeExportChunk.chunkIndex ? '✓ Copied Prompt!' : '📋 Copy Prompt'}
            </button>
          </div>

          <textarea
            readOnly
            value={activeExportChunk.prompt}
            style={{
              width: '100%',
              height: '240px',
              padding: '0.75rem',
              fontFamily: 'monospace',
              fontSize: '0.775rem',
              lineHeight: 1.45,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-raised)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-text-primary)',
              resize: 'vertical',
            }}
          />
        </div>
      )}

      {/* Instructions */}
      <div
        style={{
          fontSize: '0.8rem',
          lineHeight: 1.5,
          color: 'var(--color-text-secondary)',
          backgroundColor: 'var(--color-primary-light)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
        }}
      >
        💡 <strong>How to use:</strong> Copy each chunk prompt into Google Gemini, Claude, or ChatGPT. In the <strong>Import</strong> tab, you can paste the JSON for each chunk into its own slot or paste all chunks together.
      </div>
    </>
  );
}

