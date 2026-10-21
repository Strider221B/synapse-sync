'use client';

import React from 'react';

interface SettingRowProps {
  label: string;
  description?: string;
  children?: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

/**
 * Labeled setting row component with label and description on the left,
 * and form control on the right.
 */
export function SettingRow({
  label,
  description,
  children,
  htmlFor,
  className = '',
}: SettingRowProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.25rem 0',
        borderBottom: '1px solid var(--color-surface-border-subtle)',
        gap: '1.5rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 240px' }}>
        <label
          htmlFor={htmlFor}
          style={{
            display: 'block',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: description ? '0.25rem' : 0,
            cursor: htmlFor ? 'pointer' : 'default',
          }}
        >
          {label}
        </label>
        {description && (
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            {description}
          </p>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}
