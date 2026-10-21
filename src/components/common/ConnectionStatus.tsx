'use client';

import React, { useEffect, useState } from 'react';
import { SyncManager } from '@/lib/db/sync_manager';

/**
 * Header connection status badge displaying online/offline state and sync feedback.
 */
export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = async () => {

      setIsOnline(true);
      try {
        const syncManager = SyncManager.getInstance();
        const result = await syncManager.processQueue();
        if (result.succeeded > 0) {
          setSyncToastMessage(`Synced ${result.succeeded} change${result.succeeded === 1 ? '' : 's'}`);
          setTimeout(() => setSyncToastMessage(null), 4000);
        }
      } catch (err) {
        console.error('Auto sync on reconnection failed:', err);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleSyncComplete = (event: Event) => {
      const customEvent = event as CustomEvent<{ count: number }>;
      const count = customEvent.detail?.count ?? 0;
      if (count > 0) {
        setSyncToastMessage(`Synced ${count} change${count === 1 ? '' : 's'}`);
        setTimeout(() => setSyncToastMessage(null), 4000);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('synapse-sync-completed', handleSyncComplete);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('synapse-sync-completed', handleSyncComplete);
    };
  }, []);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
      data-testid="connection-status-badge"
    >
      {syncToastMessage && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.75rem',
            color: 'var(--color-primary)',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            padding: '0.2rem 0.6rem',
            borderRadius: 'var(--radius-full)',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          🔄 {syncToastMessage}
        </span>
      )}

      {isOnline ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.75rem',
            color: 'var(--color-success)',
            background: 'var(--color-success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-full)',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-success)',
              display: 'inline-block',
              boxShadow: '0 0 6px var(--color-success)',
            }}
          />
          Online
        </span>
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.75rem',
            color: 'var(--color-warning)',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            padding: '0.25rem 0.625rem',
            borderRadius: 'var(--radius-full)',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-warning)',
              display: 'inline-block',
              boxShadow: '0 0 6px var(--color-warning)',
            }}
          />
          Offline — studying from cache
        </span>
      )}
    </div>
  );
}
