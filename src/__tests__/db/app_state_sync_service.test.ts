import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import { DatabaseService } from '../../lib/db/database_service';
import { AppStateSyncService } from '../../lib/db/services/app_state_sync_service';
import { PreferencesService } from '../../lib/db/services/preferences_service';
import { DB_STORES } from '../../lib/db/constants';
import type { GoogleDriveApiClient, DriveItem } from '../../lib/api/google_drive_client';
import type { SRSCard } from '../../lib/db/models';

describe('AppStateSyncService', () => {
  const createMockDriveClient = (existingStateJson?: string) => {
    const savedFiles: Record<string, { content: string; parentFolderId: string }> = {};
    if (existingStateJson) {
      savedFiles['app_state.json'] = { content: existingStateJson, parentFolderId: 'folder-root-synapse' };
    }

    const client: Partial<GoogleDriveApiClient> = {
      getOrCreateFolder: async (name: string) => {
        return { id: `folder-${name}-id`, name, folder: {} } as DriveItem;
      },
      findFileByName: async (name: string, parentFolderId = 'root') => {
        if (savedFiles[name] && (savedFiles[name].parentFolderId === parentFolderId || parentFolderId.includes('folder'))) {
          return { id: `file-${name}-id`, name, file: { mimeType: 'application/json' } } as DriveItem;
        }
        return null;
      },
      saveFile: async (name: string, content: string | Blob, _mime = 'application/json', parentFolderId = 'root') => {
        const text = typeof content === 'string' ? content : '';
        savedFiles[name] = { content: text, parentFolderId };
        return { id: `file-${name}-id`, name, file: { mimeType: 'application/json' } } as DriveItem;
      },
      getFileText: async (fileId: string) => {
        for (const [name, data] of Object.entries(savedFiles)) {
          if (`file-${name}-id` === fileId) {
            return data.content;
          }
        }
        return '{}';
      },
    };

    return { client: client as GoogleDriveApiClient, savedFiles };
  };

  it('computes streak and study statistics accurately from SRS cards', () => {
    const dbService = new DatabaseService('test-app-state-stats');
    const { client } = createMockDriveClient();
    const service = new AppStateSyncService(dbService, client);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const cards: SRSCard[] = [
      {
        id: 'srs-1',
        cardId: 'card-1',
        cardType: 'flashcard',
        repetitions: 3,
        interval: 25,
        easinessFactor: 2.6,
        nextReview: new Date(Date.now() - 3600000).toISOString(),
        lastReview: `${todayStr}T10:00:00.000Z`,
        totalReviews: 3,
        correctCount: 3,
      },
      {
        id: 'srs-2',
        cardId: 'card-2',
        cardType: 'mcq',
        repetitions: 2,
        interval: 6,
        easinessFactor: 2.5,
        nextReview: new Date(Date.now() + 86400000).toISOString(),
        lastReview: `${yesterdayStr}T15:00:00.000Z`,
        totalReviews: 2,
        correctCount: 2,
      },
    ];

    const stats = service.computeStudyStats(cards);
    assert.equal(stats.cardsDueToday, 1);
    assert.equal(stats.totalReviewsCompleted, 5);
    assert.equal(stats.masteredCards, 1);
    assert.equal(stats.studyStreakYesterday, 1);
    assert.equal(stats.studyStreakDays, 2);
  });

  it('pushes local application state snapshot to Google Drive', async () => {
    const dbService = new DatabaseService('test-app-state-push');
    const { client, savedFiles } = createMockDriveClient();
    const prefs = new PreferencesService(dbService);
    await prefs.set('theme', 'dark');

    const db = await dbService.getDB();
    const srsCard: SRSCard = {
      id: 'srs-push-1',
      cardId: 'card-push-1',
      cardType: 'flashcard',
      repetitions: 1,
      interval: 1,
      easinessFactor: 2.5,
      nextReview: new Date().toISOString(),
      lastReview: new Date().toISOString(),
      totalReviews: 1,
      correctCount: 1,
    };
    await db.put(DB_STORES.SRS_CARDS, srsCard);

    const service = new AppStateSyncService(dbService, client, prefs);
    const payload = await service.pushAppState('SC');

    assert.equal(payload.userId, 'SC');
    assert.equal(payload.preferences.theme, 'dark');
    assert.equal(payload.srsCards.length, 1);
    assert.equal(payload.chatMessages, undefined);
    assert.ok(savedFiles['app_state.json']);

    await dbService.close();
  });

  it('pulls application state snapshot from Google Drive and restores into local stores', async () => {
    const dbService = new DatabaseService('test-app-state-pull');
    const remotePayload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      userId: 'DB',
      studyStats: {
        cardsDueToday: 2,
        studyStreakDays: 5,
        studyStreakYesterday: 4,
        lastReviewDate: '2026-10-22',
        totalReviewsCompleted: 15,
        masteredCards: 4,
      },
      preferences: { theme: 'light', dailyCardGoal: 30 },
      srsCards: [
        {
          id: 'srs-pulled-1',
          cardId: 'c-pull-1',
          cardType: 'flashcard',
          repetitions: 4,
          interval: 22,
          easinessFactor: 2.7,
          nextReview: new Date().toISOString(),
          lastReview: '2026-10-22T12:00:00.000Z',
        },
      ],
      chatMessages: [
        {
          id: 'chat-pull-1',
          noteId: 'n-1',
          role: 'user',
          content: 'Hello AI',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const { client } = createMockDriveClient(JSON.stringify(remotePayload));
    const prefs = new PreferencesService(dbService);
    const service = new AppStateSyncService(dbService, client, prefs);

    const pulled = await service.pullAppState();
    assert.ok(pulled);
    assert.equal(pulled?.userId, 'DB');

    const db = await dbService.getDB();
    const storedCard = await db.get(DB_STORES.SRS_CARDS, 'srs-pulled-1');
    assert.ok(storedCard);
    assert.equal(storedCard?.repetitions, 4);

    const storedChat = await db.get(DB_STORES.CHAT_MESSAGES, 'chat-pull-1');
    assert.ok(storedChat);

    const theme = await prefs.get('theme');
    assert.equal(theme, 'light');

    await dbService.close();
  });
});
