'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useGoogleAuth } from '@/components/auth/GoogleAuthProviderWrapper';
import { DatabaseService } from '@/lib/db/database_service';
import { PreferencesService } from '@/lib/db/services/preferences_service';

interface GoogleDriveConnectButtonProps {
  onConnectionChange?: (connected: boolean) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Interactive button component for authenticating with Google and linking Google Drive,
 * equipped with a user selection combobox for pre-registered users.
 */
export function GoogleDriveConnectButton({
  onConnectionChange,
  className,
  compact = false,
}: GoogleDriveConnectButtonProps) {
  const {
    isAuthenticated,
    user,
    login,
    logout,
    selectedUser,
    setSelectedUser,
    registeredUsers,
  } = useGoogleAuth();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayName = user?.displayName || user?.email || `User (${selectedUser})`;

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

  const handleUserChange = (newUserId: string) => {
    if (isAuthenticated) {
      startTransition(async () => {
        try {
          await logout();
          setSelectedUser(newUserId);
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'User switch failed');
        }
      });
    } else {
      setSelectedUser(newUserId);
    }
  };

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: compact ? '0.35rem' : '0.5rem',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {/* 1. Pre-registered User Selection Combobox */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
        <label
          htmlFor="user-select-combobox"
          className="user-select-label"
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.02em',
          }}
        >
          User:
        </label>
        <select
          id="user-select-combobox"
          aria-label="Select User Account"
          value={selectedUser}
          disabled={isPending}
          onChange={(e) => handleUserChange(e.target.value)}
          style={{
            padding: compact ? '0.3rem 0.55rem' : '0.45rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-raised)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-surface-border)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: isPending ? 'wait' : 'pointer',
            outline: 'none',
            boxShadow: 'var(--shadow-sm)',
            flexShrink: 0,
          }}
        >
          {registeredUsers.length > 0 ? (
            registeredUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))
          ) : (
            <>
              <option value="SC">SC</option>
              <option value="DB">DB</option>
            </>
          )}
        </select>
      </div>

      {/* 2. Login or Connected Status Button */}
      {isAuthenticated ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: compact ? '0.4rem' : '0.625rem',
            padding: compact ? '0.3rem 0.6rem' : '0.45rem 0.875rem',
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-surface-border)',
            borderRadius: 'var(--radius-md)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
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
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {!compact && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Connected ({selectedUser})
              </span>
            )}
            <span
              className="user-display-name"
              style={{
                fontSize: compact ? '0.75rem' : '0.8125rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                maxWidth: compact ? '110px' : '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName}
            </span>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isPending}
            className="disconnect-btn btn-interactive"
            style={{
              padding: '0.25rem 0.45rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-surface-border)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: isPending ? 'wait' : 'pointer',
              transition: 'all var(--transition-fast)',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {isPending ? '...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={isPending}
          className="btn-interactive"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: compact ? '0.32rem 0.65rem' : '0.5rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface-raised)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-surface-border)',
            fontWeight: 600,
            fontSize: compact ? '0.8125rem' : '0.875rem',
            cursor: isPending ? 'wait' : 'pointer',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all var(--transition-fast)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 87.3 78" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
            <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47" />
            <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 10.15z" fill="#ea4335" />
            <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
            <path d="M59.8 53h27.5c0-1.55-.4-3.1-1.2-4.5L70.7 20.3c-.8-1.4-1.95-2.5-3.3-3.3L53.65 40.8z" fill="#2684fc" />
            <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3L53.65 40.8 40.7 63.5H13.75c1.35.8 2.5 1.9 3.3 3.3l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.35h49.35z" fill="#ffba00" />
          </svg>
          <span style={{ whiteSpace: 'nowrap' }}>
            {isPending ? (
              'Connecting...'
            ) : (
              <>
                <span>Connect </span>
                <span className="hide-on-mobile">Google </span>
                <span>Drive</span>
              </>
            )}
          </span>
        </button>
      )}

      {errorMessage && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-error)', whiteSpace: 'nowrap' }}>
          {errorMessage}
        </span>
      )}
    </div>
  );
}
