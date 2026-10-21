'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DISMISS_TIME_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = DEFAULT_DISMISS_TIME_MS) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);
    },
    []
  );

  const success = useCallback(
    (message: string, duration?: number) => showToast(message, 'success', duration),
    [showToast]
  );
  const error = useCallback(
    (message: string, duration?: number) => showToast(message, 'error', duration),
    [showToast]
  );
  const info = useCallback(
    (message: string, duration?: number) => showToast(message, 'info', duration),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <div
        id="toast-container"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          top: '1.25rem',
          right: '1.25rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
          pointerEvents: 'none',
          maxWidth: '380px',
          width: 'calc(100vw - 2.5rem)',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration ?? DEFAULT_DISMISS_TIME_MS);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const getThemeProps = () => {
    switch (toast.type) {
      case 'success':
        return {
          icon: '✅',
          border: 'rgba(16, 185, 129, 0.4)',
          bg: 'var(--color-surface-raised)',
          badgeColor: 'var(--color-success)',
        };
      case 'error':
        return {
          icon: '❌',
          border: 'rgba(239, 68, 68, 0.4)',
          bg: 'var(--color-surface-raised)',
          badgeColor: 'var(--color-error)',
        };
      case 'info':
      default:
        return {
          icon: 'ℹ️',
          border: 'rgba(59, 130, 246, 0.4)',
          bg: 'var(--color-surface-raised)',
          badgeColor: 'var(--color-info)',
        };
    }
  };

  const theme = getThemeProps();

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        animation: 'toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        backgroundColor: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: 'var(--radius-lg)',
        padding: '0.75rem 1rem',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{theme.icon}</span>
      <p
        style={{
          margin: 0,
          fontSize: '0.875rem',
          color: 'var(--color-text-primary)',
          fontWeight: 500,
          flex: 1,
          lineHeight: 1.4,
        }}
      >
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss toast"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-muted)',
          fontSize: '1rem',
          cursor: 'pointer',
          padding: '0.2rem',
          borderRadius: 'var(--radius-xs)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
