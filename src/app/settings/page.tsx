'use client';

import React, { useEffect, useState } from 'react';
import { GoogleDriveConnectButton } from '@/components/auth/GoogleDriveConnectButton';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { SettingRow } from '@/components/settings/SettingRow';
import { NumberInput } from '@/components/settings/NumberInput';
import { SelectDropdown, type SelectOption } from '@/components/settings/SelectDropdown';
import { useToast } from '@/components/common/ToastNotification';
import { DatabaseService } from '@/lib/db/database_service';
import { PreferencesService } from '@/lib/db/services/preferences_service';
import { NoteService } from '@/lib/db/services/note_service';
import { DB_NAME, DB_STORES } from '@/lib/db/constants';

const DIFFICULTY_OPTIONS: SelectOption[] = [
  { value: 'easy', label: 'Easy (Introductory concepts)' },
  { value: 'medium', label: 'Medium (Standard exam level)' },
  { value: 'hard', label: 'Hard (Deep analytical & edge cases)' },
];

export default function SettingsPage() {
  const toast = useToast();

  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  useEffect(() => {
    async function loadPreferences() {
      try {
        const dbService = new DatabaseService();
        const prefs = new PreferencesService(dbService);
        const goal = await prefs.get<number>('dailyCardGoal');
        const diff = await prefs.get<string>('quizDifficulty');

        if (goal !== undefined) setDailyGoal(goal);
        if (diff !== undefined) setDifficulty(diff);
      } catch (err) {
        console.error('Failed to load user preferences:', err);
      }
    }

    loadPreferences();
  }, []);

  const handleDailyGoalChange = async (newGoal: number) => {
    setDailyGoal(newGoal);
    try {
      const dbService = new DatabaseService();
      const prefs = new PreferencesService(dbService);
      await prefs.set('dailyCardGoal', newGoal);
      toast.success(`Daily card goal updated to ${newGoal}`);
    } catch {
      toast.error('Failed to save daily goal preference');
    }
  };

  const handleDifficultyChange = async (newDiff: string) => {
    setDifficulty(newDiff);
    try {
      const dbService = new DatabaseService();
      const prefs = new PreferencesService(dbService);
      await prefs.set('quizDifficulty', newDiff);
      toast.success(`Default quiz difficulty updated to ${newDiff}`);
    } catch {
      toast.error('Failed to save difficulty preference');
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const dbService = new DatabaseService();
      const noteService = new NoteService(dbService);
      const db = await dbService.getDB();

      const [notes, notebooks, quizzes, flashcards, srsCards] = await Promise.all([
        noteService.getAll(),
        db.getAll(DB_STORES.NOTEBOOKS),
        db.getAll(DB_STORES.QUIZZES),
        db.getAll(DB_STORES.FLASHCARDS),
        db.getAll(DB_STORES.SRS_CARDS),
      ]);

      const exportPayload = {
        app: 'SynapseSync',
        version: '0.1.0',
        exportedAt: new Date().toISOString(),
        data: {
          notebooks,
          notes,
          quizzes,
          flashcards,
          srsCards,
        },
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `synapse-sync-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      toast.success('Notes and study data exported successfully');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export study data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearAllData = async () => {
    setIsClearing(true);
    try {
      const dbService = new DatabaseService();
      const db = await dbService.getDB();

      // Clear all stores cleanly
      const storeNames = [
        DB_STORES.NOTEBOOKS,
        DB_STORES.NOTES,
        DB_STORES.QUIZZES,
        DB_STORES.MCQ_CARDS,
        DB_STORES.FLASHCARDS,
        DB_STORES.SRS_CARDS,
        DB_STORES.CHAT_MESSAGES,
        DB_STORES.SYNC_QUEUE,
      ] as const;

      for (const store of storeNames) {
        await db.clear(store);
      }

      setConfirmClearOpen(false);
      toast.success('All local study data cleared successfully');
    } catch (err) {
      console.error('Clear data error:', err);
      toast.error('Failed to clear database');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
            marginBottom: '0.5rem',
          }}
        >
          Settings & Preferences
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
          Configure theme preferences, study goals, cloud connections, and local data storage.
        </p>
      </div>

      {/* 1. Appearance & Theme */}
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2
          style={{
            fontSize: '1.15rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          Appearance
        </h2>

        <SettingRow
          label="Interface Theme"
          description="Choose between dark theme, light theme, or follow your operating system appearance."
        >
          <ThemeToggle id="settings-theme-toggle" />
        </SettingRow>
      </section>

      {/* 2. Cloud & Storage Connections */}
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2
          style={{
            fontSize: '1.15rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          Cloud & Synchronization
        </h2>

        <SettingRow
          label="Google Drive Integration"
          description="Link your Google account to import documents and sync study notes from Google Drive."
        >
          <GoogleDriveConnectButton />
        </SettingRow>
      </section>

      {/* 3. Study Preferences */}
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2
          style={{
            fontSize: '1.15rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          Study Preferences
        </h2>

        <SettingRow
          label="Daily Review Goal"
          description="Target number of spaced repetition flashcards to review per session."
          htmlFor="daily-goal-input"
        >
          <NumberInput
            id="daily-goal-input"
            value={dailyGoal}
            onChange={handleDailyGoalChange}
            min={5}
            max={200}
            step={5}
          />
        </SettingRow>

        <SettingRow
          label="Default Quiz Difficulty"
          description="Controls the conceptual complexity of AI-generated quizzes."
          htmlFor="quiz-difficulty-select"
        >
          <SelectDropdown
            id="quiz-difficulty-select"
            value={difficulty}
            onChange={handleDifficultyChange}
            options={DIFFICULTY_OPTIONS}
            ariaLabel="Default quiz difficulty"
          />
        </SettingRow>
      </section>

      {/* 4. Data Management */}
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2
          style={{
            fontSize: '1.15rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          Data Management
        </h2>

        <SettingRow
          label="Export Study Notes"
          description="Download a complete JSON archive of all your notebooks, notes, quizzes, and SRS cards."
        >
          <button
            type="button"
            onClick={handleExportData}
            disabled={isExporting}
            className="btn-interactive"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-surface-border)',
              backgroundColor: 'var(--color-surface-raised)',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isExporting ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>📦</span> {isExporting ? 'Exporting...' : 'Export JSON'}
          </button>
        </SettingRow>

        <SettingRow
          label="Clear Local Database"
          description="Permanently delete all locally cached notes, quizzes, flashcards, and chat logs."
        >
          <button
            type="button"
            onClick={() => setConfirmClearOpen(true)}
            className="btn-interactive"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-error)',
              backgroundColor: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>🗑️</span> Clear All Data
          </button>
        </SettingRow>
      </section>

      {/* 5. About & Version Info */}
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2
          style={{
            fontSize: '1.15rem',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: '0.75rem',
          }}
        >
          About SynapseSync
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
            <span>Application Version</span>
            <strong style={{ color: 'var(--color-text-primary)' }}>0.1.0 (Production Candidate)</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
            <span>Local Database</span>
            <strong style={{ color: 'var(--color-text-primary)' }}>IndexedDB ({DB_NAME} v1)</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
            <span>Offline Capabilities</span>
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Active (Serwist PWA)</span>
          </div>
        </div>
      </section>

      {/* Confirmation Modal for Clear Data */}
      {confirmClearOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.5rem',
          }}
        >
          <div
            className="animate-fade-in"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-surface-border)',
              padding: '2rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-error-bg)',
                color: 'var(--color-error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                marginBottom: '1rem',
              }}
            >
              ⚠️
            </div>

            <h3
              id="clear-modal-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                marginBottom: '0.5rem',
              }}
            >
              Clear All Local Data?
            </h3>

            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5,
                marginBottom: '1.5rem',
              }}
            >
              This action will permanently delete all notebooks, notes, generated quizzes, flashcards,
              and spaced repetition progress from your browser storage. This action cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                disabled={isClearing}
                className="btn-interactive"
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-surface-border)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleClearAllData}
                disabled={isClearing}
                className="btn-interactive"
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  backgroundColor: 'var(--color-error)',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: isClearing ? 'wait' : 'pointer',
                }}
              >
                {isClearing ? 'Clearing...' : 'Yes, Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
