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
import { QuizExportTab } from './QuizExportTab';
import { QuizImportTab } from './QuizImportTab';

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

  useEffect(() => {
    if (exportBundle && exportBundle.totalChunks > 0) {
      setChunkInputs((prev) => {
        if (prev.length >= exportBundle.totalChunks && prev.some((t) => t.trim())) return prev;
        return Array.from({ length: exportBundle.totalChunks }, (_, i) => prev[i] || '');
      });
      if (exportBundle.totalChunks > 1) setImportMode('per-chunk');
    }
  }, [exportBundle]);

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
      const { SyncQueueService } = await import('@/lib/db/services/sync_queue_service');
      const syncQueueService = new SyncQueueService(dbService);
      const quizService = new QuizService(dbService, syncQueueService);
      const created = await importExportService.importQuiz(note.id, note.title, activeParsed, quizService);

      try {
        const { SyncManager } = await import('@/lib/db/sync_manager');
        const syncManager = SyncManager.getInstance();
        let syncService = syncManager.getSyncService();
        if (!syncService) {
          const { AuthService } = await import('@/lib/auth/auth_service');
          const auth = new AuthService();
          await auth.initialize();
          if (auth.isAuthenticated()) {
            const { GoogleDriveApiClient } = await import('@/lib/api/google_drive_client');
            const { GoogleDriveSyncService } = await import('@/lib/db/services/google_drive_sync_service');
            syncService = new GoogleDriveSyncService(dbService, new GoogleDriveApiClient(auth), auth);
            syncManager.setSyncService(syncService);
          }
        }

        if (syncService && syncService.isConnected()) {
          await syncService.pushQuiz(created.quiz.id);
          created.quiz.isSynced = true;
        } else {
          await syncQueueService.enqueue('quiz', created.quiz.id, 'create', { noteId: note.id });
          void syncManager.forceSync().catch(() => {});
        }
      } catch (syncErr) {
        console.warn('Direct Google Drive quiz push deferred to sync queue:', syncErr);
        await syncQueueService.enqueue('quiz', created.quiz.id, 'create', { noteId: note.id });
      }

      onImportSuccess(created);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to import quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <QuizExportTab
              noteTitle={note.title}
              exportBundle={exportBundle}
              activeExportChunkIndex={activeExportChunkIndex}
              setActiveExportChunkIndex={setActiveExportChunkIndex}
              copiedChunk={copiedChunk}
              onCopyChunkPrompt={handleCopyChunkPrompt}
              onDownloadJson={handleDownloadJson}
              onDownloadMarkdown={handleDownloadMarkdown}
            />
          )}

          {activeTab === 'import' && (
            <QuizImportTab
              fileInputId={fileInputId}
              importMode={importMode}
              setImportMode={setImportMode}
              activeImportChunkIndex={activeImportChunkIndex}
              setActiveImportChunkIndex={setActiveImportChunkIndex}
              chunkInputs={chunkInputs}
              chunkResults={chunkResults}
              aggregatedPerChunk={aggregatedPerChunk}
              allInOneText={allInOneText}
              allInOneResult={allInOneResult}
              submitError={submitError}
              onChunkInputChange={handleChunkInputChange}
              onAddChunkSlot={handleAddChunkSlot}
              onAllInOneTextChange={setAllInOneText}
              onFileUpload={handleFileUpload}
            />
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
