'use client';

import React, { useEffect, useState } from 'react';
import { GoogleDriveConnectButton } from '@/components/auth/GoogleDriveConnectButton';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { SettingRow } from '@/components/settings/SettingRow';
import { NumberInput } from '@/components/settings/NumberInput';
import { SelectDropdown, type SelectOption } from '@/components/settings/SelectDropdown';
import { ClearDataModal } from '@/components/settings/ClearDataModal';
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

const THROTTLE_OPTIONS: SelectOption[] = [
  { value: 'low', label: 'Low (Paid Plan - Faster)' },
  { value: 'high', label: 'High (Free Tier - Throttled)' },
];

export default function SettingsPage() {
  const toast = useToast();

  const [dailyGoal, setDailyGoal] = useState<number>(20);
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [throttleSpeed, setThrottleSpeed] = useState<string>('low');
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState<boolean>(false);

  useEffect(() => {
    async function loadPreferences() {
      try {
        const dbService = new DatabaseService();
        const prefs = new PreferencesService(dbService);
        const goal = await prefs.get<number>('dailyCardGoal');
        const diff = await prefs.get<string>('quizDifficulty');
        const throttle = await prefs.get<string>('throttleSpeed');
        const lastSync = await prefs.get<string>('lastSyncTimestamp');

        if (goal !== undefined) setDailyGoal(goal);
        if (diff !== undefined) setDifficulty(diff);
        if (throttle !== undefined) setThrottleSpeed(throttle);
        if (lastSync) setLastSyncTime(lastSync);
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

  const handleThrottleSpeedChange = async (newSpeed: string) => {
    setThrottleSpeed(newSpeed);
    try {
      const dbService = new DatabaseService();
      const prefs = new PreferencesService(dbService);
      await prefs.set('throttleSpeed', newSpeed);
      toast.success(`Throttle speed set to ${newSpeed === 'high' ? 'High' : 'Low'}`);
    } catch {
      toast.error('Failed to save throttle speed preference');
    }
  };

  const handleForceSyncDrive = async () => {
    setIsSyncingDrive(true);
    try {
      const { SyncManager } = await import('@/lib/db/sync_manager');
      const syncManager = SyncManager.getInstance();
      const result = await syncManager.forceSync();
      const nowIso = new Date().toISOString();
      setLastSyncTime(nowIso);
      if ('pushedNotes' in result) {
        toast.success(`Synced ${result.pushedNotes} note(s) & ${result.pushedQuizzes} quiz(zes) to Google Drive`);
      } else {
        toast.success('Synchronization completed');
      }
    } catch (err) {
      console.error('Settings sync failed:', err);
      toast.error(err instanceof Error ? err.message : 'Google Drive sync failed');
    } finally {
      setIsSyncingDrive(false);
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
        data: { notebooks, notes, quizzes, flashcards, srsCards },
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
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
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
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
          Cloud & Synchronization
        </h2>
        <SettingRow
          label="Google Drive Integration"
          description="Link your Google account to import documents and sync study notes from Google Drive."
        >
          <GoogleDriveConnectButton />
        </SettingRow>

        <SettingRow
          label="Force Cloud Sync"
          description={
            lastSyncTime
              ? `Manually push local notes & quizzes and retrieve cloud updates. Last synced: ${new Date(lastSyncTime).toLocaleString()}`
              : 'Manually push local notes & quizzes and retrieve cloud updates. Never synced.'
          }
        >
          <button
            type="button"
            onClick={handleForceSyncDrive}
            disabled={isSyncingDrive}
            className="btn-interactive"
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-surface-border)',
              backgroundColor: 'var(--color-surface-raised)',
              color: 'var(--color-text-primary)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: isSyncingDrive ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span style={{ display: 'inline-block', animation: isSyncingDrive ? 'spin 1s linear infinite' : 'none' }}>
              🔄
            </span>
            {isSyncingDrive ? 'Syncing...' : 'Force Sync Now'}
          </button>
        </SettingRow>
      </section>

      {/* 3. Study & AI Preferences */}
      <section
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-surface-border)',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
          Study & AI Preferences
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

        <SettingRow
          label="Throttle Speed"
          description="Controls request pacing between AI chunks. Use high for free tier gemini (15 RPM limit). Low is recommended for Paid plans."
          htmlFor="throttle-speed-select"
        >
          <SelectDropdown
            id="throttle-speed-select"
            value={throttleSpeed}
            onChange={handleThrottleSpeedChange}
            options={THROTTLE_OPTIONS}
            ariaLabel="Throttle Speed"
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
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
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
        <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
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

      {/* Clear Data Confirmation Modal */}
      <ClearDataModal
        isOpen={confirmClearOpen}
        isClearing={isClearing}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={handleClearAllData}
      />
    </div>
  );
}
