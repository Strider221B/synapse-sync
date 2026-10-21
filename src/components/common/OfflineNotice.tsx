'use client';

import React, { useEffect, useState } from 'react';

export interface OfflineNoticeProps {
  featureName: string;
  description?: string;
}

/**
 * Banner displayed when an AI or cloud network feature is accessed without an active internet connection.
 */
export function OfflineNotice({ featureName, description }: OfflineNoticeProps) {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return !navigator.onLine;
    }
    return false;
  });


  useEffect(() => {
    const handleOnline = () => setIsOffline(false);

    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.875rem',
        padding: '1rem 1.25rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        color: 'var(--color-text-primary)',
        marginBottom: '1.25rem',
      }}
      data-testid="offline-notice-banner"
    >
      <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>⚡</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-warning)', marginBottom: '0.25rem' }}>
          {featureName} requires an internet connection
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {description ??
            'This feature connects to AI or cloud services. You can continue studying your cached notes, quizzes, and flashcards offline.'}
        </div>
      </div>
    </div>
  );
}
