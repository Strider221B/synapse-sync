'use client';

import React, { useEffect, useState } from 'react';
import { DatabaseService } from '@/lib/db/database_service';
import { PreferencesService } from '@/lib/db/services/preferences_service';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeToggleProps {
  variant?: 'segmented' | 'compact' | 'select';
  className?: string;
  id?: string;
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'system', label: 'System', icon: '💻' },
];

const LOCAL_STORAGE_THEME_KEY = 'synapse_theme';

function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Interactive Theme Toggle component supporting Dark, Light, and System preferences.
 * Persists theme in IndexedDB via PreferencesService and applies data-theme to the <html> tag.
 */
export function ThemeToggle({
  variant = 'segmented',
  className = '',
  id = 'theme-toggle',
}: ThemeToggleProps) {
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>('dark');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    let active = true;

    async function loadTheme() {
      try {
        const local = localStorage.getItem(LOCAL_STORAGE_THEME_KEY) as ThemeMode | null;
        if (local && (local === 'dark' || local === 'light' || local === 'system')) {
          if (active) setCurrentTheme(local);
          applyTheme(local);
        }

        const dbService = new DatabaseService();
        const prefs = new PreferencesService(dbService);
        const savedTheme = (await prefs.get<ThemeMode>('theme')) ?? 'dark';

        if (active) {
          setCurrentTheme(savedTheme);
          applyTheme(savedTheme);
          localStorage.setItem(LOCAL_STORAGE_THEME_KEY, savedTheme);
        }
      } catch {
        // Fallback to existing attribute or dark
        const htmlTheme = document.documentElement.getAttribute('data-theme') as ThemeMode | null;
        if (active && htmlTheme) {
          setCurrentTheme(htmlTheme);
        }
      } finally {
        if (active) setMounted(true);
      }
    }

    loadTheme();
    return () => {
      active = false;
    };
  }, []);

  const handleThemeChange = async (theme: ThemeMode) => {
    setCurrentTheme(theme);
    applyTheme(theme);
    try {
      localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
      const dbService = new DatabaseService();
      const prefs = new PreferencesService(dbService);
      await prefs.set('theme', theme);
    } catch {
      // Best-effort persistence
    }
  };

  if (!mounted) {
    return (
      <div
        id={id}
        className={className}
        style={{
          display: 'inline-flex',
          height: '36px',
          width: '120px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-surface-border)',
        }}
        aria-hidden="true"
      />
    );
  }

  if (variant === 'select') {
    return (
      <div className={className} id={id} style={{ display: 'inline-flex', alignItems: 'center' }}>
        <select
          value={currentTheme}
          onChange={(e) => handleThemeChange(e.target.value as ThemeMode)}
          aria-label="Select color theme"
          style={{
            padding: '0.5rem 0.875rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-surface-border)',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {THEME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.icon} {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      id={id}
      className={className}
      role="group"
      aria-label="Theme selection"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-surface-border)',
        gap: '2px',
      }}
    >
      {THEME_OPTIONS.map((opt) => {
        const isSelected = currentTheme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleThemeChange(opt.value)}
            aria-pressed={isSelected}
            aria-label={`Switch to ${opt.label} theme`}
            title={`Switch to ${opt.label} theme`}
            className="btn-interactive"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              backgroundColor: isSelected ? 'var(--color-primary)' : 'transparent',
              color: isSelected ? '#ffffff' : 'var(--color-text-secondary)',
              fontSize: '0.775rem',
              fontWeight: isSelected ? 600 : 500,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              boxShadow: isSelected ? '0 1px 3px rgba(0, 0, 0, 0.2)' : 'none',
            }}
          >
            <span>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
