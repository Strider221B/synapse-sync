'use client';

import React, { useState } from 'react';
import { YouTubeNotesViewer } from '@/components/youtube/YouTubeNotesViewer';
import { TranscriptPaster } from '@/components/youtube/TranscriptPaster';

/**
 * Main YouTube Study Hub page providing study notebook browsing and transcript note generation.
 */
export default function YouTubePage() {
  const [activeTab, setActiveTab] = useState<'viewer' | 'manual'>('viewer');

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.75rem' }}>▶️</span>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            YouTube Study Hub
          </h1>
        </div>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
          Access exhaustively detailed lecture notes from YouTube playlists and videos processed locally or via transcript paste.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '2rem',
        }}
      >
        <button
          onClick={() => setActiveTab('viewer')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'viewer' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'viewer' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: '0.9375rem',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          📚 Study Notebooks
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          style={{
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'manual' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'manual' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: 600,
            fontSize: '0.9375rem',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          📝 Manual Transcript Paste
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'viewer' ? (
        <YouTubeNotesViewer />
      ) : (
        <div style={{ maxWidth: '720px' }}>
          <TranscriptPaster />
        </div>
      )}
    </div>
  );
}
