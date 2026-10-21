'use client';

import React, { useState } from 'react';
import Link from 'next/link';

function getInitialGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 12 && hour < 17) return 'Good afternoon, Scholar';
  if (hour >= 17 || hour < 5) return 'Good evening, Scholar';
  return 'Good morning, Scholar';
}

function getInitialDateString(): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toDateString();
  }
}

export function DashboardHeader() {
  const [greeting] = useState<string>(getInitialGreeting);
  const [dateString] = useState<string>(getInitialDateString);

  return (
    <section
      className="animate-fade-in"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-xl)',
        padding: '2.25rem',
        background:
          'linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(139, 92, 246, 0.12) 100%)',
        border: '1px solid var(--color-surface-border)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ maxWidth: '720px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.85rem',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-primary-light)',
            border: '1px solid var(--color-primary-glow)',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--color-primary)',
            marginBottom: '0.875rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <span>📅</span> {dateString}
        </div>

        <h1
          style={{
            fontSize: '2.25rem',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.2,
            marginBottom: '0.75rem',
            color: 'var(--color-text-primary)',
          }}
        >
          {greeting}
        </h1>

        <p
          style={{
            fontSize: '1rem',
            lineHeight: 1.6,
            color: 'var(--color-text-secondary)',
            marginBottom: '1.5rem',
          }}
        >
          Your AI-powered study companion is active. Review due flashcards, synthesize notes
          from YouTube lectures, and solidify concepts with spaced repetition.
        </p>

        {/* Quick Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem' }}>
          <Link
            id="cta-take-quiz"
            href="/review"
            className="btn-interactive"
            style={{
              padding: '0.75rem 1.35rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: 'var(--shadow-glow)',
              textDecoration: 'none',
            }}
          >
            <span>🧠</span> Start Review
          </Link>

          <Link
            id="cta-import-video"
            href="/youtube"
            className="btn-interactive"
            style={{
              padding: '0.75rem 1.35rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-surface-border)',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
            }}
          >
            <span>🎬</span> YouTube Import
          </Link>

          <Link
            href="/notes/import"
            className="btn-interactive"
            style={{
              padding: '0.75rem 1.35rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-surface-border)',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
            }}
          >
            <span>📥</span> Import Notes
          </Link>

          <Link
            href="/quizzes"
            className="btn-interactive"
            style={{
              padding: '0.75rem 1.35rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-surface-border)',
              fontWeight: 600,
              fontSize: '0.875rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              textDecoration: 'none',
            }}
          >
            <span>📝</span> Quizzes
          </Link>
        </div>
      </div>
    </section>
  );
}
