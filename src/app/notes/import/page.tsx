'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useIsAuthenticated } from '@azure/msal-react';
import { OneDriveConnectButton } from '@/components/auth/OneDriveConnectButton';
import { OneDrivePicker, type SelectedFilePayload } from '@/components/notes/OneDrivePicker';
import { ApiClient } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import type { Notebook } from '@/lib/db/models';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';

interface DocxParseResponse {
  text: string;
  metadata: {
    paragraphCount: number;
    wordCount: number;
    estimatedReadTimeMinutes: number;
  };
}

/**
 * Import notes page supporting OneDrive sync, local file parsing, and manual note creation.
 */
export default function ImportNotesPage() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const [activeTab, setActiveTab] = useState<'onedrive' | 'manual'>('onedrive');

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual Note Form state
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');

  useEffect(() => {
    const dbService = new DatabaseService();
    const nbService = new NotebookService(dbService);
    nbService.getAll().then((items) => {
      setNotebooks(items);
      if (items.length > 0 && !selectedNotebookId) {
        setSelectedNotebookId(items[0].id);
      }
    });
  }, [selectedNotebookId]);

  const handleImportOneDriveFiles = async (files: SelectedFilePayload[]) => {
    setStatusMessage(`Processing ${files.length} document(s)...`);
    setErrorMessage(null);

    const dbService = new DatabaseService();
    const noteService = new NoteService(dbService);
    const apiClient = new ApiClient();

    try {
      let importedCount = 0;
      for (const { item, blob } of files) {
        let textContent = '';
        const isDocx = item.name.toLowerCase().endsWith('.docx');

        if (isDocx) {
          const formData = new FormData();
          formData.append('file', blob, item.name);
          const parsed = await apiClient.postFormData<DocxParseResponse>('/api/parse-docx', formData);
          textContent = parsed.text;
        } else {
          textContent = await blob.text();
        }

        const noteTitle = item.name.replace(/\.[^/.]+$/, '');
        await noteService.create({
          notebookId: selectedNotebookId || 'general',
          title: noteTitle,
          content: textContent,
          contentFormat: isDocx ? 'plaintext' : 'markdown',
          sourceType: isDocx ? 'onedrive_docx' : 'onedrive_md',
          oneDriveItemId: item.id,
          sourceUrl: item.webUrl,
        });

        importedCount += 1;
      }

      setStatusMessage(`Successfully imported ${importedCount} document(s)!`);
      setTimeout(() => {
        router.push('/notes');
      }, 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Document import failed');
    }
  };

  const handleCreateManualNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualContent.trim()) {
      setErrorMessage('Both title and content are required.');
      return;
    }

    setErrorMessage(null);
    startTransition(async () => {
      try {
        const dbService = new DatabaseService();
        const noteService = new NoteService(dbService);

        const newNote = await noteService.create({
          notebookId: selectedNotebookId || 'general',
          title: manualTitle.trim(),
          content: manualContent.trim(),
          contentFormat: 'markdown',
          sourceType: 'manual',
        });

        router.push(`/notes/${newNote.id}`);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to save note');
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '860px', margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
          Import & Create Notes
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          Bring in Word syllabi and Markdown notes from OneDrive, or draft fresh study notes manually.
        </p>
      </div>

      {/* Destination Notebook Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem 1.25rem',
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-surface-border)',
        }}
      >
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Import into Notebook:
        </span>
        <select
          value={selectedNotebookId}
          onChange={(e) => setSelectedNotebookId(e.target.value)}
          style={{
            padding: '0.45rem 0.85rem',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        >
          <option value="">(No specific notebook / General)</option>
          {notebooks.map((nb) => (
            <option key={nb.id} value={nb.id}>
              {nb.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-surface-border)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('onedrive')}
          style={{
            padding: '0.625rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: activeTab === 'onedrive' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderBottom: activeTab === 'onedrive' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          ☁️ Microsoft OneDrive
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          style={{
            padding: '0.625rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            color: activeTab === 'manual' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            borderBottom: activeTab === 'manual' ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          ✍️ Create Manual Note
        </button>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '0.875rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-success-bg)',
            color: 'var(--color-success)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: '0.875rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-error-bg)',
            color: 'var(--color-error)',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Tab 1: OneDrive */}
      {activeTab === 'onedrive' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                OneDrive Integration
              </h2>
              <p style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)' }}>
                Connect your account and select Word (.docx) or Markdown (.md) documents.
              </p>
            </div>
            <OneDriveConnectButton />
          </div>

          {isAuthenticated ? (
            <OneDrivePicker onImportFiles={handleImportOneDriveFiles} />
          ) : (
            <div
              style={{
                padding: '3rem 2rem',
                backgroundColor: 'var(--color-surface)',
                border: '1px dashed var(--color-surface-border)',
                borderRadius: 'var(--radius-xl)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div style={{ fontSize: '2.5rem' }}>☁️</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Connect your Microsoft Account
              </h3>
              <p style={{ maxWidth: '440px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                Authorize SynapseSync with PKCE OAuth to securely browse your study folders and import lecture notes.
              </p>
              <OneDriveConnectButton />
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Manual Note */}
      {activeTab === 'manual' && (
        <form onSubmit={handleCreateManualNote} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
              Note Title *
            </label>
            <input
              type="text"
              required
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="e.g. Backpropagation & Neural Networks"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-primary)',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
              Note Content (Markdown supported) *
            </label>
            <textarea
              required
              rows={12}
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              placeholder="# Key Concepts&#10;&#10;Write your study notes here using Markdown..."
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text-primary)',
                fontSize: '0.95rem',
                fontFamily: 'var(--font-family-mono)',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.6,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={isPending}
              style={{
                padding: '0.75rem 1.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.9rem',
                boxShadow: 'var(--shadow-glow)',
                cursor: isPending ? 'wait' : 'pointer',
              }}
            >
              {isPending ? 'Saving Note...' : 'Save Study Note'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
