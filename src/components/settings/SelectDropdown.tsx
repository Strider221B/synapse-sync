'use client';

import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Styled select dropdown component for configuration preferences.
 */
export function SelectDropdown({
  id,
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  ariaLabel,
}: SelectDropdownProps) {
  return (
    <div className={className} style={{ position: 'relative', display: 'inline-block' }}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-surface-border)',
          borderRadius: 'var(--radius-md)',
          padding: '0.5rem 2.25rem 0.5rem 0.875rem',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        style={{
          position: 'absolute',
          right: '0.75rem',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: 'var(--color-text-muted)',
          fontSize: '0.75rem',
        }}
        aria-hidden="true"
      >
        ▼
      </span>
    </div>
  );
}
