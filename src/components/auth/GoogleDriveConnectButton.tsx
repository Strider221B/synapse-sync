'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useGoogleAuth } from '@/components/auth/GoogleAuthProviderWrapper';
import { DatabaseService } from '@/lib/db/database_service';
import { PreferencesService } from '@/lib/db/services/preferences_service';

interface GoogleDriveConnectButtonProps {
  onConnectionChange?: (connected: boolean) => void;
  className?: string;
}

/**
 * Interactive button component for authenticating with Google and linking Google Drive.
 */
export function GoogleDriveConnectButton({
  onConnectionChange,
  className,
}: GoogleDriveConnectButtonProps) {
  const { isAuthenticated, user, login, logout } = useGoogleAuth();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayName = user?.displayName || user?.email || 'Google User';

  useEffect(() => {
    const dbService = new DatabaseService();
    const prefs = new PreferencesService(dbService);
    prefs.set('googleDriveConnected', isAuthenticated).catch(() => {});
    if (onConnectionChange) {
      onConnectionChange(isAuthenticated);
    }
  }, [isAuthenticated, onConnectionChange]);

  const handleConnect = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await login();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed');
      }
    });
  };

  const handleDisconnect = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await logout();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Sign out failed');
      }
    });
  };

  if (isAuthenticated) {
    return (
      <div
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.5rem 0.875rem',
          backgroundColor: 'var(--color-surface-raised)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-success)',
            boxShadow: '0 0 6px var(--color-success)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Connected to Google Drive
          </span>
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            {displayName}
          </span>
        </div>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={isPending}
          style={{
            marginLeft: '0.5rem',
            padding: '0.35rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-surface-border)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            fontSize: '0.75rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          {isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.375rem' }}>
      <button
        type="button"
        onClick={handleConnect}
        disabled={isPending}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '0.625rem 1.125rem',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-surface-raised)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-surface-border)',
          fontWeight: 600,
          fontSize: '0.875rem',
          cursor: isPending ? 'wait' : 'pointer',
          boxShadow: 'var(--shadow-sm)',
          transition: 'all var(--transition-fast)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 87.3 78" aria-hidden="true">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
          <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47" />
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335" />
          <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
          <path d="M59.8 53h27.5c0-1.55-.4-3.1-1.2-4.5L70.7 20.3c-.8-1.4-1.95-2.5-3.3-3.3L53.65 40.8z" fill="#2684fc" />
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3L53.65 40.8 40.7 63.5H13.75c1.35.8 2.5 1.9 3.3 3.3l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.35h49.35z" fill="#ffba00" />
        </svg>
        <span>{isPending ? 'Connecting...' : 'Connect Google Drive'}</span>
      </button>
      {errorMessage && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>
          {errorMessage}
        </span>
      )}
    </div>
  );
}
