'use client';

import React from 'react';
import { MarkdownRenderer } from '@/components/notes/MarkdownRenderer';

export interface ChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/**
 * Chat message bubble component rendering role-styled messages with markdown support for AI.
 */
export function ChatBubble({ role, content, timestamp }: ChatBubbleProps) {
  const isUser = role === 'user';

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: '0.75rem',
        maxWidth: '85%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        margin: '0.5rem 0',
      }}
      data-testid={`chat-bubble-${role}`}
    >
      {/* Avatar Badge */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-full)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
          flexShrink: 0,
          backgroundColor: isUser ? 'var(--color-primary-light)' : 'var(--color-surface-raised)',
          border: isUser
            ? '1px solid var(--color-primary-glow)'
            : '1px solid var(--color-surface-border)',
          color: isUser ? 'var(--color-primary)' : 'var(--color-accent)',
          boxShadow: isUser ? 'none' : '0 0 12px rgba(139, 92, 246, 0.2)',
        }}
        aria-hidden="true"
      >
        {isUser ? '👤' : '🤖'}
      </div>

      {/* Bubble Content Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '100%',
        }}
      >
        <div
          style={{
            padding: '0.875rem 1.125rem',
            borderRadius: isUser
              ? '1.25rem 1.25rem 0.25rem 1.25rem'
              : '1.25rem 1.25rem 1.25rem 0.25rem',
            backgroundColor: isUser ? 'var(--color-primary)' : 'var(--color-surface)',
            color: isUser ? '#ffffff' : 'var(--color-text-primary)',
            border: isUser ? 'none' : '1px solid var(--color-surface-border)',
            boxShadow: isUser
              ? '0 2px 8px rgba(99, 102, 241, 0.25)'
              : 'var(--shadow-sm)',
            wordBreak: 'break-word',
            fontSize: '0.9375rem',
            lineHeight: 1.55,
          }}
        >
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>

        {formattedTime && (
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--color-text-muted)',
              marginTop: '0.25rem',
              padding: '0 0.25rem',
            }}
          >
            {formattedTime}
          </span>
        )}
      </div>
    </div>
  );
}
