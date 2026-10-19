'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClient } from '@/lib/api/client';
import { DatabaseService } from '@/lib/db/database_service';
import { NoteService } from '@/lib/db/services/note_service';
import { NotebookService } from '@/lib/db/services/notebook_service';
import { youtubeUrlUtils } from '@/lib/utils/youtube';

interface SummarizeResponse {
  title: string;
  summary: string;
  keyPoints: string[];
  markdownNotes: string;
  metadata?: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
  };
}

interface TranscriptPasterProps {
  onSuccess?: (noteId: string) => void;
}

/**
 * Component providing fallback manual transcript paste UI with server-side AI detailed note generation.
 */
export function TranscriptPaster({ onSuccess }: TranscriptPasterProps) {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setVideoUrl(val);
    const videoId = youtubeUrlUtils.extractVideoId(val);
    if (videoId && !title) {
      setTitle(`YouTube Video ${videoId}`);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcriptText.trim()) {
      setErrorMessage('Please paste transcript text to generate notes.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setStatusMessage('Sending transcript to AI note generator...');

    const apiClient = new ApiClient();
    const dbService = new DatabaseService();
    const nbService = new NotebookService(dbService);
    const noteService = new NoteService(dbService);

    try {
      const response = await apiClient.post<SummarizeResponse>('/api/summarize', {
        text: transcriptText,
        title: title || 'YouTube Lecture Notes',
        format: 'markdown',
      });

      setStatusMessage('Saving generated study notes to notebook...');

      // Find or create a default YouTube notebook
      const allNotebooks = await nbService.getAll();
      let youtubeNotebook = allNotebooks.find((nb) => nb.source === 'youtube_playlist');
      if (!youtubeNotebook) {
        youtubeNotebook = await nbService.create({
          name: 'YouTube Study Notes',
          source: 'youtube_playlist',
          sourceUrl: videoUrl || 'https://www.youtube.com',
          description: 'Study notes generated from YouTube transcripts',
          tags: ['youtube', 'study'],
        });
      }

      const noteTitle = response.title || title || 'YouTube Lecture Notes';
      const createdNote = await noteService.create({
        notebookId: youtubeNotebook.id,
        title: noteTitle,
        content: response.markdownNotes,
        contentFormat: 'markdown',
        sourceType: 'youtube_transcript',
        sourceUrl: videoUrl.trim() || undefined,
      });

      setStatusMessage('Study notes generated successfully!');
      if (onSuccess) {
        onSuccess(createdNote.id);
      } else {
        router.push(`/notes/${createdNote.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate study notes';
      setErrorMessage(msg);
      setStatusMessage(null);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        padding: '1.75rem',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ marginBottom: '1.25rem' }}>
        <h3
          style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '0.375rem',
          }}
        >
          📝 Manual Transcript Note Generator
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          Paste a transcript from any lecture or video to generate exhaustively detailed study notes.
        </p>
      </div>

      <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label
            htmlFor="youtube-url-input"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: '0.375rem',
            }}
          >
            Video URL (optional)
          </label>
          <input
            id="youtube-url-input"
            type="url"
            value={videoUrl}
            onChange={handleUrlChange}
            placeholder="https://www.youtube.com/watch?v=..."
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="youtube-title-input"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: '0.375rem',
            }}
          >
            Note Title (optional)
          </label>
          <input
            id="youtube-title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Stanford CS229: Lecture 1 - Introduction to ML"
            style={{
              width: '100%',
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="youtube-transcript-input"
            style={{
              display: 'block',
              fontSize: '0.8125rem',
              fontWeight: 500,
              color: 'var(--color-text-secondary)',
              marginBottom: '0.375rem',
            }}
          >
            Transcript Content <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <textarea
            id="youtube-transcript-input"
            required
            rows={8}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Paste raw video transcript text here..."
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              fontFamily: 'monospace',
              lineHeight: 1.5,
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--color-danger)',
              color: 'var(--color-danger)',
              fontSize: '0.875rem',
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {statusMessage && !errorMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid var(--color-success)',
              color: 'var(--color-success)',
              fontSize: '0.875rem',
            }}
          >
            ℹ️ {statusMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={isGenerating}
          style={{
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.875rem',
            border: 'none',
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            opacity: isGenerating ? 0.7 : 1,
            transition: 'all var(--transition-fast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: 'var(--shadow-glow)',
          }}
        >
          {isGenerating ? '⏳ Generating Comprehensive Notes...' : '✨ Generate Detailed Study Notes'}
        </button>
      </form>
    </div>
  );
}
