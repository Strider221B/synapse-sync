'use client';

import React from 'react';

interface NumberInputProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * Styled numeric stepper input for configuration parameters (e.g. daily review goal).
 */
export function NumberInput({
  id,
  value,
  onChange,
  min = 1,
  max = 500,
  step = 1,
  disabled = false,
  className = '',
}: NumberInputProps) {
  const handleDecrement = () => {
    if (value - step >= min) {
      onChange(value - step);
    }
  };

  const handleIncrement = () => {
    if (value + step <= max) {
      onChange(value + step);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.min(Math.max(parsed, min), max);
      onChange(clamped);
    }
  };

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--color-surface-border)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        aria-label="Decrease value"
        className="btn-interactive"
        style={{
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRight: '1px solid var(--color-surface-border)',
          backgroundColor: 'var(--color-surface-raised)',
          color: 'var(--color-text-secondary)',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: disabled || value <= min ? 'not-allowed' : 'pointer',
          opacity: disabled || value <= min ? 0.4 : 1,
        }}
      >
        −
      </button>

      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleInputChange}
        disabled={disabled}
        style={{
          width: '64px',
          height: '36px',
          textAlign: 'center',
          backgroundColor: 'transparent',
          color: 'var(--color-text-primary)',
          border: 'none',
          fontWeight: 600,
          fontSize: '0.95rem',
          outline: 'none',
        }}
      />

      <button
        type="button"
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        aria-label="Increase value"
        className="btn-interactive"
        style={{
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderLeft: '1px solid var(--color-surface-border)',
          backgroundColor: 'var(--color-surface-raised)',
          color: 'var(--color-text-secondary)',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: disabled || value >= max ? 'not-allowed' : 'pointer',
          opacity: disabled || value >= max ? 0.4 : 1,
        }}
      >
        +
      </button>
    </div>
  );
}
