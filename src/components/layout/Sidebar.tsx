'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReviewNavBadge } from '@/components/review/ReviewNavBadge';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  hasBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: '🏠' },
  { label: 'Study Notes', href: '/notes', icon: '📚' },
  { label: 'YouTube Import', href: '/youtube', icon: '🎬' },
  { label: 'Quizzes', href: '/quizzes', icon: '📝' },
  { label: 'Review', href: '/review', icon: '🔄', hasBadge: true },
  { label: 'AI Chat', href: '/chat', icon: '💬' },
  { label: 'Settings', href: '/settings', icon: '⚙️' },
];

interface SidebarProps {
  className?: string;
}

/**
 * Desktop Sidebar Navigation Component.
 * Features brand header, collapsible option, active route indicators, and SRS badges.
 */
export function Sidebar({ className = '' }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const isActive = (href: string) => {
    if (!pathname) return href === '/';
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`app-sidebar ${className}`}
      aria-label="Desktop primary navigation"
      style={{
        width: collapsed ? '80px' : 'var(--sidebar-width)',
        transition: 'width var(--transition-base)',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          marginBottom: '2rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--color-surface-border-subtle)',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            textDecoration: 'none',
          }}
          aria-label="SynapseSync Home"
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'var(--color-accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
              fontWeight: 700,
              fontSize: '1.15rem',
              color: '#ffffff',
              flexShrink: 0,
            }}
          >
            ⚡
          </div>
          {!collapsed && (
            <div>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '1.125rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text-primary)',
                }}
              >
                Synapse<span style={{ color: 'var(--color-primary)' }}>Sync</span>
              </span>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.675rem',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 500,
                }}
              >
                AI Study Companion
              </span>
            </div>
          )}
        </Link>

        {!collapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="btn-interactive"
            style={{
              padding: '0.35rem',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            ◀
          </button>
        )}
      </div>

      {collapsed && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="btn-interactive"
            style={{
              padding: '0.35rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            ▶
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <nav
        aria-label="Sidebar main links"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
          flex: 1,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className="btn-interactive"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: '0.75rem',
                padding: collapsed ? '0.75rem 0' : '0.65rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: active ? 'var(--color-primary-light)' : 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: active ? 600 : 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                border: active
                  ? '1px solid var(--color-primary-glow)'
                  : '1px solid transparent',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.hasBadge && <ReviewNavBadge />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Status / Workspace Info */}
      {!collapsed && (
        <div
          style={{
            padding: '0.875rem',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--color-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              flexShrink: 0,
            }}
          >
            SS
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
              }}
            >
              Local Workspace
            </div>
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-muted)',
              }}
            >
              Offline Ready (PWA)
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
