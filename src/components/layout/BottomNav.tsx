'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReviewNavBadge } from '@/components/review/ReviewNavBadge';

interface MobileNavItem {
  label: string;
  href: string;
  icon: string;
  hasBadge?: boolean;
}

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { label: 'Home', href: '/', icon: '🏠' },
  { label: 'Notes', href: '/notes', icon: '📚' },
  { label: 'Review', href: '/review', icon: '🔄', hasBadge: true },
  { label: 'Quizzes', href: '/quizzes', icon: '📝' },
  { label: 'Settings', href: '/settings', icon: '⚙️' },
];

/**
 * Mobile Bottom Navigation Component.
 * Displays on viewport widths < 768px with the 5 core navigation items.
 */
export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (!pathname) return href === '/';
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="bottom-nav"
      aria-label="Mobile navigation"
      role="navigation"
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className="btn-interactive"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '48px',
              minHeight: '48px',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              position: 'relative',
              transition: 'all var(--transition-fast)',
            }}
          >
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
              {item.hasBadge && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-10px',
                  }}
                >
                  <ReviewNavBadge />
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: active ? 600 : 500,
                marginTop: '2px',
              }}
            >
              {item.label}
            </span>
            {active && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  width: '16px',
                  height: '3px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary)',
                }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
