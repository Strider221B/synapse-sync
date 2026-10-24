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
          <header className="app-header">
            <div className="app-header-brand">
              <span className="app-header-brand-icon" aria-hidden="true">⚡</span>
              <span className="app-header-brand-title">SynapseSync</span>
              <span className="app-header-breadcrumb-sep">/</span>
              <strong className="app-header-section-title">Knowledge Hub</strong>
            </div>

            <div className="app-header-actions">
              <GoogleDriveConnectButton compact />
              <ThemeToggle id="header-theme-toggle" variant="compact" />
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
