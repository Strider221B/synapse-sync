'use client';

import { useEffect } from 'react';
import { SyncManager } from '@/lib/db/sync_manager';

/**
 * Client component to initialize Service Worker registration, background sync, and queue listeners.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const syncManager = SyncManager.getInstance();
    syncManager.startListening();

    // Register service worker if not already registered
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (_registration) => {
        // Attempt to register background sync tag

        await syncManager.registerBackgroundSync();

        // Listen for updates or messages from the service worker
        navigator.serviceWorker.addEventListener('message', async (event) => {
          if (event.data?.type === 'TRIGGER_SYNC_REPLAY') {
            await syncManager.processQueue();
          }
        });
      })
      .catch((error) => {
        // Service worker registration errors in development or unsecure contexts
        console.warn('Service Worker registration skipped or failed:', error);
      });

    return () => {
      syncManager.stopListening();
    };
  }, []);

  return null;
}
