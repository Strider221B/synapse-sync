'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { MSAL_SCOPES } from '@/lib/auth/msal_config';
import { DatabaseService } from '@/lib/db/database_service';
import { PreferencesService } from '@/lib/db/services/preferences_service';

interface OneDriveConnectButtonProps {
  onConnectionChange?: (connected: boolean) => void;
  className?: string;
}

/**
 * Interactive button component for authenticating with Microsoft and linking OneDrive.
 */
export function OneDriveConnectButton({
  onConnectionChange,
  className,
}: OneDriveConnectButtonProps) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeAccount = accounts.length > 0 ? accounts[0] : null;
  const displayName = activeAccount?.name ?? activeAccount?.username ?? 'Microsoft User';

  useEffect(() => {
    const dbService = new DatabaseService();
    const prefs = new PreferencesService(dbService);
    prefs.set('oneDriveConnected', isAuthenticated).catch(() => {});
    if (onConnectionChange) {
      onConnectionChange(isAuthenticated);
    }
  }, [isAuthenticated, onConnectionChange]);

  const handleConnect = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await instance.loginPopup({
          scopes: [...MSAL_SCOPES],
        });
        if (result.account) {
          instance.setActiveAccount(result.account);
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed');
      }
    });
  };

  const handleDisconnect = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await instance.logoutPopup({
          account: activeAccount ?? undefined,
        });
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
            Connected to OneDrive
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
          backgroundColor: '#0078d4',
          color: '#ffffff',
          border: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          cursor: isPending ? 'wait' : 'pointer',
          boxShadow: '0 2px 8px rgba(0, 120, 212, 0.35)',
          transition: 'all var(--transition-fast)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 21 21" fill="none" aria-hidden="true">
          <path d="M10 1H1V10H10V1Z" fill="#F25022" />
          <path d="M20 1H11V10H20V1Z" fill="#7FBA00" />
          <path d="M10 11H1V20H10V11Z" fill="#00A4EF" />
          <path d="M20 11H11V20H20V11Z" fill="#FFB900" />
        </svg>
        <span>{isPending ? 'Connecting...' : 'Connect OneDrive'}</span>
      </button>
      {errorMessage && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>
          {errorMessage}
        </span>
      )}
    </div>
  );
}
