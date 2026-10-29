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
  const [activeChunkIndex, setActiveChunkIndex] = useState(0);
  const [copiedChunk, setCopiedChunk] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [parsedImport, setParsedImport] = useState<ParsedQuizImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Live validate importText whenever it changes
  useEffect(() => {
    const trimmed = importText.trim();
    if (!trimmed) {
      setParsedImport(null);
      setImportError(null);
      return;
    }
    try {
      const parsed = importExportService.parseImportText(trimmed);
      setParsedImport(parsed);
      setImportError(null);
    } catch (err) {
      setParsedImport(null);
      setImportError(err instanceof Error ? err.message : 'Invalid quiz JSON format');
    }
  }, [importText, importExportService]);

  if (!isOpen) return null;

  const handleCopyChunkPrompt = async (chunkIndex: number, promptText: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(promptText);
        setCopiedChunk(chunkIndex);
        setTimeout(() => setCopiedChunk(null), 2500);
      }
    } catch {
      // Fallback if clipboard API is restricted
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        setImportText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async () => {
    if (!parsedImport) return;
    setIsSubmitting(true);
    try {
      const dbService = new DatabaseService();
      const quizService = new QuizService(dbService);
      const created = await importExportService.importQuiz(
        note.id,
        note.title,
        parsedImport,
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
        // Sync queue fallback handled gracefully
      }

      onImportSuccess(created);
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeChunk = exportBundle?.chunks[activeChunkIndex] || exportBundle?.chunks[0];

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
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
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
            📥 2. Import Generated Quiz {parsedImport ? `(${parsedImport.mcqs.length} MCQs)` : ''}
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
                      onClick={() => setActiveChunkIndex(idx)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: idx === activeChunkIndex ? '1px solid var(--color-primary)' : '1px solid var(--color-surface-border)',
                        backgroundColor: idx === activeChunkIndex ? 'var(--color-primary-light)' : 'var(--color-surface)',
                        color: idx === activeChunkIndex ? 'var(--color-primary)' : 'var(--color-text-secondary)',
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
              {activeChunk && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    flex: 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      Prompt for Chunk {activeChunk.chunkIndex} of {activeChunk.totalChunks} ({activeChunk.wordCount} words):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyChunkPrompt(activeChunk.chunkIndex, activeChunk.prompt)}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: copiedChunk === activeChunk.chunkIndex ? 'var(--color-success-bg)' : 'var(--color-primary)',
                        color: copiedChunk === activeChunk.chunkIndex ? 'var(--color-success)' : '#ffffff',
                        border: `1px solid ${copiedChunk === activeChunk.chunkIndex ? 'var(--color-success)' : 'var(--color-primary)'}`,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      {copiedChunk === activeChunk.chunkIndex ? '✓ Copied Prompt!' : '📋 Copy Prompt'}
                    </button>
                  </div>

                  <textarea
                    readOnly
                    value={activeChunk.prompt}
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

              {/* Next Steps Guide */}
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
                💡 <strong>How to use:</strong> Copy the prompt above and paste it into Google Gemini (AI Studio or gemini.google.com), Claude, or ChatGPT. When the AI finishes, switch to the <strong>Import</strong> tab and paste the JSON output.
              </div>
            </>
          )}

          {activeTab === 'import' && (
            <>
              {/* File Upload & Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  Paste AI JSON Output (or upload .json file):
                </span>
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
                  📁 Select JSON File
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Textarea for JSON */}
              <textarea
                placeholder='Paste generated JSON here, e.g. {"mcqs": [...], "flashcards": [...]}'
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                style={{
                  width: '100%',
                  height: '220px',
                  padding: '0.75rem',
                  fontFamily: 'monospace',
                  fontSize: '0.775rem',
                  lineHeight: 1.45,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-surface-raised)',
                  border: `1px solid ${importError ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
                  color: 'var(--color-text-primary)',
                  resize: 'vertical',
                }}
              />

              {/* Status / Error feedback */}
              {importError && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-error-bg)',
                    border: '1px solid var(--color-error)',
                    color: 'var(--color-error)',
                    fontSize: '0.8rem',
                  }}
                >
                  ⚠️ {importError}
                </div>
              )}

              {parsedImport && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-success-bg)',
                    border: '1px solid var(--color-success)',
                    color: 'var(--color-success)',
                    fontSize: '0.825rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    ✅ Ready to import: {parsedImport.mcqs.length} MCQs and {parsedImport.flashcards.length} Flashcards detected.
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                    All items will be initialized with SM-2 spaced repetition tracking and synced with Google Drive.
                  </div>
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
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
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
              disabled={!parsedImport || isSubmitting}
              style={{
                padding: '0.5rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: parsedImport && !isSubmitting ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                color: parsedImport && !isSubmitting ? '#ffffff' : 'var(--color-text-muted)',
                border: 'none',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: parsedImport && !isSubmitting ? 'pointer' : 'not-allowed',
                boxShadow: parsedImport && !isSubmitting ? 'var(--shadow-glow)' : 'none',
              }}
            >
              {isSubmitting ? 'Importing Quiz...' : 'Save & Integrate Quiz'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

