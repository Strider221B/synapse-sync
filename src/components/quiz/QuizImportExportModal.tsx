'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import type { Note } from '@/lib/db/models';
import type { QuizWithCards } from '@/lib/db/services/quiz_service';
import { DatabaseService } from '@/lib/db/database_service';
import { QuizService } from '@/lib/db/services/quiz_service';
import {
  ParsedQuizImport,
  QuizExportBundle,
  QuizImportExportService,
} from '@/lib/services/quiz_import_export_service';

export interface QuizImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: Note;
  existingQuestions?: string[];
  existingFlashcards?: string[];
  onImportSuccess: (quizWithCards: QuizWithCards) => void;
}

export function QuizImportExportModal({
  isOpen,
  onClose,
  note,
  existingQuestions = [],
  existingFlashcards = [],
  onImportSuccess,
}: QuizImportExportModalProps) {
  const modalTitleId = useId();
  const fileInputId = useId();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [activeExportChunkIndex, setActiveExportChunkIndex] = useState(0);
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null);

  // Multi-chunk import states
  const [importMode, setImportMode] = useState<'per-chunk' | 'all-in-one'>('per-chunk');
  const [activeImportChunkIndex, setActiveImportChunkIndex] = useState(0);
  const [chunkInputs, setChunkInputs] = useState<string[]>(['']);
  const [allInOneText, setAllInOneText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const importExportService = useMemo(() => new QuizImportExportService(), []);

  const exportBundle: QuizExportBundle | null = useMemo(() => {
    if (!isOpen || !note.content) return null;
    try {
      return importExportService.exportPrompts({
        noteId: note.id,
        noteTitle: note.title,
        noteContent: note.content,
        previousQuestions: existingQuestions,
        previousFlashcards: existingFlashcards,
      });
    } catch {
      return null;
    }
  }, [isOpen, note.id, note.title, note.content, existingQuestions, existingFlashcards, importExportService]);

  // Sync chunkInputs array length with totalChunks from export
  useEffect(() => {
    if (exportBundle && exportBundle.totalChunks > 0) {
      setChunkInputs((prev) => {
        if (prev.length >= exportBundle.totalChunks && prev.some((t) => t.trim())) {
          return prev;
        }
        return Array.from({ length: exportBundle.totalChunks }, (_, i) => prev[i] || '');
      });
      if (exportBundle.totalChunks > 1) {
        setImportMode('per-chunk');
      }
    }
  }, [exportBundle]);

  // Validation results per chunk
  const chunkResults = useMemo(() => {
    return chunkInputs.map((text) => {
      const trimmed = text.trim();
      if (!trimmed) return { status: 'empty' as const, parsed: null, error: null };
      try {
        const parsed = importExportService.parseImportText(trimmed);
        return { status: 'valid' as const, parsed, error: null };
      } catch (err) {
        return {
          status: 'error' as const,
          parsed: null,
          error: err instanceof Error ? err.message : 'Invalid JSON',
        };
      }
    });
  }, [chunkInputs, importExportService]);

  // Aggregated per-chunk results
  const aggregatedPerChunk = useMemo(() => {
    const allMcqs: ParsedQuizImport['mcqs'] = [];
    const allFlashcards: ParsedQuizImport['flashcards'] = [];
    let hasError = false;
    let completedChunks = 0;

    for (const res of chunkResults) {
      if (res.status === 'valid' && res.parsed) {
        allMcqs.push(...res.parsed.mcqs);
        allFlashcards.push(...res.parsed.flashcards);
        completedChunks++;
      } else if (res.status === 'error') {
        hasError = true;
      }
    }

    const parsed: ParsedQuizImport | null =
      allMcqs.length > 0 || allFlashcards.length > 0 ? { mcqs: allMcqs, flashcards: allFlashcards } : null;

    return {
      parsed,
      hasError,
      completedChunks,
      totalSlots: chunkInputs.length,
      mcqCount: allMcqs.length,
      flashcardCount: allFlashcards.length,
    };
  }, [chunkResults, chunkInputs.length]);

  // Validation for all-in-one text
  const allInOneResult = useMemo(() => {
    const trimmed = allInOneText.trim();
    if (!trimmed) return { parsed: null, error: null };
    try {
      const parsed = importExportService.parseImportText(trimmed);
      return { parsed, error: null };
    } catch (err) {
      return { parsed: null, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  }, [allInOneText, importExportService]);

  const activeParsed = importMode === 'per-chunk' ? aggregatedPerChunk.parsed : allInOneResult.parsed;
  const currentChunkResult = chunkResults[activeImportChunkIndex] || { status: 'empty' as const };

  if (!isOpen) return null;

  const handleCopyChunkPrompt = async (chunkIndex: number, promptText: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(promptText);
        setCopiedChunk(chunkIndex);
        setTimeout(() => setCopiedChunk(null), 2500);
      }
    } catch {
      // Clipboard fallback
    }
  };

  const handleDownloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (!exportBundle) return;
    const jsonStr = JSON.stringify(exportBundle, null, 2);
    const safeTitle = note.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    handleDownloadFile(jsonStr, `quiz_prompts_${safeTitle}.json`, 'application/json');
  };

  const handleDownloadMarkdown = () => {
    if (!exportBundle) return;
    const mdStr = importExportService.formatExportAsMarkdown(exportBundle);
    const safeTitle = note.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    handleDownloadFile(mdStr, `quiz_prompts_${safeTitle}.md`, 'text/markdown');
  };

  const handleChunkInputChange = (index: number, value: string) => {
    setChunkInputs((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleAddChunkSlot = () => {
    setChunkInputs((prev) => [...prev, '']);
    setActiveImportChunkIndex(chunkInputs.length);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        if (importMode === 'per-chunk') {
          handleChunkInputChange(activeImportChunkIndex, content);
        } else {
          setAllInOneText(content);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (!activeParsed) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const dbService = new DatabaseService();
      const quizService = new QuizService(dbService);
      const created = await importExportService.importQuiz(
        note.id,
        note.title,
        activeParsed,
        quizService
      );

      // Trigger background sync to Google Drive
      try {
        const { SyncManager } = await import('@/lib/db/sync_manager');
        const syncManager = SyncManager.getInstance();
        const syncService = syncManager.getSyncService();
        if (syncService && syncService.isConnected()) {
          await syncService.pushQuiz(created.quiz.id).catch(async () => {
            const { SyncQueueService } = await import('@/lib/db/services/sync_queue_service');
            const sqService = new SyncQueueService(dbService);
            await sqService.enqueue('quiz', created.quiz.id, 'create', { noteId: note.id });
            void syncManager.forceSync().catch(() => {});
          });
        }
      } catch {
        // Handled gracefully
      }

      onImportSuccess(created);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to import quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeExportChunk = exportBundle?.chunks[activeExportChunkIndex] || exportBundle?.chunks[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          maxWidth: '850px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-surface-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              id={modalTitleId}
              style={{
                margin: 0,
                fontSize: '1.2rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              Offline Quiz: Export Prompts & Import
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Avoid Gemini API rate limits by running chunked prompts in any LLM and importing the results.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
            }}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Tab Controls */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-surface-border)',
            backgroundColor: 'var(--color-surface-raised)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              borderBottom: activeTab === 'export' ? '2px solid var(--color-primary)' : '2px solid transparent',
              backgroundColor: activeTab === 'export' ? 'var(--color-surface)' : 'transparent',
              color: activeTab === 'export' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            📤 1. Export Chunk Prompts ({exportBundle?.totalChunks || 1})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              borderBottom: activeTab === 'import' ? '2px solid var(--color-primary)' : '2px solid transparent',
              backgroundColor: activeTab === 'import' ? 'var(--color-surface)' : 'transparent',
              color: activeTab === 'import' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            📥 2. Import Generated Quiz {activeParsed ? `(${activeParsed.mcqs.length} MCQs, ${activeParsed.flashcards.length} Cards)` : ''}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {activeTab === 'export' && (
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
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Document:</span> {note.title}
                  <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>•</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Chunks:</span> {exportBundle?.totalChunks || 1}
                  <span style={{ margin: '0 0.5rem', color: 'var(--color-text-muted)' }}>•</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Excluded Past Items:</span>{' '}
                  {exportBundle?.previousContextCount || 0}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleDownloadJson}
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
                    onClick={handleDownloadMarkdown}
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
                      onClick={() => handleCopyChunkPrompt(activeExportChunk.chunkIndex, activeExportChunk.prompt)}
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
          )}

          {activeTab === 'import' && (
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
                    onChange={handleFileUpload}
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
                        res.status === 'valid'
                          ? `✅ (${res.parsed?.mcqs.length || 0})`
                          : res.status === 'error'
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
                      onClick={handleAddChunkSlot}
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
                      onChange={(e) => handleChunkInputChange(activeImportChunkIndex, e.target.value)}
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
                    onChange={(e) => setAllInOneText(e.target.value)}
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
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--color-surface-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {activeParsed
              ? `${activeParsed.mcqs.length} MCQs & ${activeParsed.flashcards.length} Flashcards ready`
              : 'Paste generated chunk JSON to proceed'}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-surface-border)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            {activeTab === 'export' ? (
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-glow)',
                }}
              >
                Continue to Import →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={!activeParsed || isSubmitting}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: activeParsed && !isSubmitting ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                  color: activeParsed && !isSubmitting ? '#ffffff' : 'var(--color-text-muted)',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: activeParsed && !isSubmitting ? 'pointer' : 'not-allowed',
                  boxShadow: activeParsed && !isSubmitting ? 'var(--shadow-glow)' : 'none',
                }}
              >
                {isSubmitting
                  ? 'Importing Quiz...'
                  : activeParsed
                  ? `Save Quiz (${activeParsed.mcqs.length + activeParsed.flashcards.length} items)`
                  : 'Save & Integrate Quiz'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
