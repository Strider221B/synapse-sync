import React, { Suspense } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { ConnectionStatus } from '@/components/common/ConnectionStatus';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { GoogleDriveConnectButton } from '@/components/auth/GoogleDriveConnectButton';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastProvider } from '@/components/common/ToastNotification';

interface AppLayoutProps {
  children: React.ReactNode;
}

/**
 * Responsive application layout combining desktop sidebar, mobile bottom navigation,
 * application header with connection status and theme toggles, and global providers.
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <ToastProvider>
      <div className="app-container">
        {/* Desktop Sidebar (screens >= 768px) */}
        <Suspense fallback={<aside className="app-sidebar" aria-label="Loading navigation" />}>
          <Sidebar />
        </Suspense>

        {/* Main Content Area */}
        <div className="app-main">
          {/* Top Header */}
          <header
            style={{
              height: 'var(--header-height)',
              borderBottom: '1px solid var(--color-surface-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 var(--space-6)',
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              position: 'sticky',
              top: 0,
              zIndex: 30,
            }}
          >
            <div
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>SynapseSync</span>
              <span style={{ color: 'var(--color-text-muted)' }}>/</span>
              <strong style={{ color: 'var(--color-text-primary)' }}>Knowledge Hub</strong>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
              }}
            >
              <GoogleDriveConnectButton compact />
              <ThemeToggle id="header-theme-toggle" />
              <ConnectionStatus />
            </div>
          </header>

          {/* Main Content with Error Boundary */}
          <main className="app-content">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>

        {/* Mobile Bottom Navigation (screens < 768px) */}
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
