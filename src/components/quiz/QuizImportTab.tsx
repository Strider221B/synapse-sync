'use client';

import React from 'react';
import type { ParsedQuizImport } from '@/lib/services/quiz_import_export_service';

export interface ChunkValidationResult {
  status: 'empty' | 'valid' | 'error';
  parsed: ParsedQuizImport | null;
  error: string | null;
}

export interface AggregatedChunksSummary {
  parsed: ParsedQuizImport | null;
  hasError: boolean;
  completedChunks: number;
  totalSlots: number;
  mcqCount: number;
  flashcardCount: number;
}

export interface QuizImportTabProps {
  fileInputId: string;
  importMode: 'per-chunk' | 'all-in-one';
  setImportMode: (mode: 'per-chunk' | 'all-in-one') => void;
  activeImportChunkIndex: number;
  setActiveImportChunkIndex: (idx: number) => void;
  chunkInputs: string[];
  chunkResults: ChunkValidationResult[];
  aggregatedPerChunk: AggregatedChunksSummary;
  allInOneText: string;
  allInOneResult: { parsed: ParsedQuizImport | null; error: string | null };
  submitError: string | null;
  onChunkInputChange: (index: number, val: string) => void;
  onAddChunkSlot: () => void;
  onAllInOneTextChange: (val: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function QuizImportTab({
  fileInputId,
  importMode,
  setImportMode,
  activeImportChunkIndex,
  setActiveImportChunkIndex,
  chunkInputs,
  chunkResults,
  aggregatedPerChunk,
  allInOneText,
  allInOneResult,
  submitError,
  onChunkInputChange,
  onAddChunkSlot,
  onAllInOneTextChange,
  onFileUpload,
}: QuizImportTabProps) {
  const currentChunkResult = chunkResults[activeImportChunkIndex] || { status: 'empty' as const };

  return (
    <>
      {/* Import Mode Selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-raised)', padding: '0.2rem' }}>
          <button
            type="button"
            onClick={() => setImportMode('per-chunk')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: importMode === 'per-chunk' ? 'var(--color-surface)' : 'transparent',
              color: importMode === 'per-chunk' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: importMode === 'per-chunk' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            🧩 Paste by Chunk ({chunkInputs.length})
          </button>
          <button
            type="button"
            onClick={() => setImportMode('all-in-one')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: importMode === 'all-in-one' ? 'var(--color-surface)' : 'transparent',
              color: importMode === 'all-in-one' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              boxShadow: importMode === 'all-in-one' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            📋 Paste All at Once / Single File
          </button>
        </div>

        <label
          htmlFor={fileInputId}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            fontSize: '0.775rem',
            fontWeight: 600,
            cursor: 'pointer',
            color: 'var(--color-text-primary)',
          }}
        >
          📁 Upload .json
          <input
            id={fileInputId}
            type="file"
            accept=".json,application/json"
            onChange={onFileUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Per-Chunk Mode UI */}
      {importMode === 'per-chunk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Chunk Tabs */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {chunkInputs.map((_, idx) => {
              const res = chunkResults[idx];
              const statusIcon =
                res?.status === 'valid'
                  ? `✅ (${res.parsed?.mcqs.length || 0})`
                  : res?.status === 'error'
                  ? '⚠️ Error'
                  : '⚪ Empty';
              const isSelected = idx === activeImportChunkIndex;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImportChunkIndex(idx)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                    backgroundColor: isSelected ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
                    color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    fontSize: '0.775rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Chunk {idx + 1} {statusIcon}
                </button>
              );
            })}

            <button
              type="button"
              onClick={onAddChunkSlot}
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--color-surface-border)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-muted)',
                fontSize: '0.775rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Add another chunk input slot"
            >
              + Add Chunk
            </button>
          </div>

          {/* Active Chunk Textarea */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Paste JSON for Chunk {activeImportChunkIndex + 1}:
              </span>
              {currentChunkResult.status === 'valid' && currentChunkResult.parsed && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>
                  ✓ Detected: {currentChunkResult.parsed.mcqs.length} MCQs, {currentChunkResult.parsed.flashcards.length} Flashcards
                </span>
              )}
              {currentChunkResult.status === 'error' && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', fontWeight: 600 }}>
                  ⚠️ {currentChunkResult.error}
                </span>
              )}
            </div>

            <textarea
              placeholder={`Paste JSON output for Chunk ${activeImportChunkIndex + 1} here...`}
              value={chunkInputs[activeImportChunkIndex] || ''}
              onChange={(e) => onChunkInputChange(activeImportChunkIndex, e.target.value)}
              style={{
                width: '100%',
                height: '180px',
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.775rem',
                lineHeight: 1.45,
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-raised)',
                border: `1px solid ${currentChunkResult.status === 'error' ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
                color: 'var(--color-text-primary)',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Multi-Chunk Aggregation Summary Banner */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: aggregatedPerChunk.parsed ? 'var(--color-success-bg)' : 'var(--color-surface-raised)',
              border: `1px solid ${aggregatedPerChunk.parsed ? 'var(--color-success)' : 'var(--color-surface-border)'}`,
              fontSize: '0.825rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontWeight: 600 }}>📊 Total Accumulated: </span>
              {aggregatedPerChunk.mcqCount} MCQs and {aggregatedPerChunk.flashcardCount} Flashcards
              <span style={{ margin: '0 0.5rem', opacity: 0.6 }}>•</span>
              <span>{aggregatedPerChunk.completedChunks} of {aggregatedPerChunk.totalSlots} chunks filled</span>
            </div>
          </div>
        </div>
      )}

      {/* All-in-One Mode UI */}
      {importMode === 'all-in-one' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Paste all chunk outputs or combined JSON here:
          </span>
          <textarea
            placeholder='Paste one or more chunk JSON outputs here (multiple ```json blocks or sequential JSON objects are automatically merged)...'
            value={allInOneText}
            onChange={(e) => onAllInOneTextChange(e.target.value)}
            style={{
              width: '100%',
              height: '220px',
              padding: '0.75rem',
              fontFamily: 'monospace',
              fontSize: '0.775rem',
              lineHeight: 1.45,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-raised)',
              border: `1px solid ${allInOneResult.error ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
              color: 'var(--color-text-primary)',
              resize: 'vertical',
            }}
          />

          {allInOneResult.error && (
            <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', fontSize: '0.8rem' }}>
              ⚠️ {allInOneResult.error}
            </div>
          )}

          {allInOneResult.parsed && (
            <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', fontSize: '0.8rem', fontWeight: 600 }}>
              ✅ Ready: {allInOneResult.parsed.mcqs.length} MCQs and {allInOneResult.parsed.flashcards.length} Flashcards detected.
            </div>
          )}
        </div>
      )}

      {submitError && (
        <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', fontSize: '0.8rem' }}>
          ⚠️ {submitError}
        </div>
      )}
    </>
  );
}

