'use client';

import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Reusable Pulsing Skeleton Component for loading states across all data-dependent pages.
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  borderRadius,
  className = '',
  style = {},
}: SkeletonProps) {
  const getDefaultDimensions = () => {
    switch (variant) {
      case 'circular':
        return {
          width: width ?? '40px',
          height: height ?? '40px',
          borderRadius: '50%',
        };
      case 'card':
        return {
          width: width ?? '100%',
          height: height ?? '160px',
          borderRadius: borderRadius ?? 'var(--radius-lg)',
        };
      case 'rectangular':
        return {
          width: width ?? '100%',
          height: height ?? '80px',
          borderRadius: borderRadius ?? 'var(--radius-md)',
        };
      case 'text':
      default:
        return {
          width: width ?? '100%',
          height: height ?? '1rem',
          borderRadius: borderRadius ?? 'var(--radius-xs)',
        };
    }
  };

  const defaults = getDefaultDimensions();

  return (
    <div
      className={`skeleton-shimmer ${className}`}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: defaults.width,
        height: defaults.height,
        borderRadius: defaults.borderRadius,
        ...style,
      }}
    />
  );
}
