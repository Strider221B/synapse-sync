import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDBPDatabase } from 'idb';
import { DatabaseService } from '../../lib/db/database_service';
import type { UserPreference } from '../../lib/db/models';
import type { SynapseSyncDB } from '../../lib/db/schema';
import {
  PreferencesService,
  PREFERENCE_DEFAULTS,
} from '../../lib/db/services/preferences_service';

describe('PreferencesService', () => {
  const TEST_DB_NAME = 'synapse-preferences-service-test';
  const KEY_THEME = 'theme';
  const KEY_DAILY_GOAL = 'dailyCardGoal';
  const VALUE_DARK = 'dark';
  const VALUE_CUSTOM_GOAL = 50;

  it('returns default value when key has not been explicitly configured', async () => {
    const dbService = new DatabaseService(TEST_DB_NAME);
    const service = new PreferencesService(dbService);

    const theme = await service.get<string>(KEY_THEME);
    assert.equal(theme, PREFERENCE_DEFAULTS.theme);

    const goal = await service.get<number>(KEY_DAILY_GOAL);
    assert.equal(goal, PREFERENCE_DEFAULTS.dailyCardGoal);

    const unknown = await service.get('unknown-key-xyz');
    assert.equal(unknown, undefined);

    await dbService.close();
  });

  it('sets and retrieves custom preference values', async () => {
    const dbService = new DatabaseService('synapse-preferences-custom-test');
    const service = new PreferencesService(dbService);

    await service.set(KEY_THEME, VALUE_DARK);
    await service.set(KEY_DAILY_GOAL, VALUE_CUSTOM_GOAL);

    const theme = await service.get<string>(KEY_THEME);
    const goal = await service.get<number>(KEY_DAILY_GOAL);

    assert.equal(theme, VALUE_DARK);
    assert.equal(goal, VALUE_CUSTOM_GOAL);

    await dbService.close();
  });

  it('merges stored preferences with defaults in getAll()', async () => {
    const dbService = new DatabaseService('synapse-preferences-getall-test');
    const service = new PreferencesService(dbService);

    await service.set(KEY_THEME, 'light');

    const all = await service.getAll();
    assert.equal(all.theme, 'light');
    assert.equal(all.dailyCardGoal, 20);
    assert.equal(all.pomodoroWorkMinutes, 25);

    await dbService.close();
  });

  it('works with a mocked DatabaseService instance', async () => {
    const mockPreference: UserPreference = {
      key: 'theme',
      value: 'dark',
    };

    const mockDB = {
      get: async () => mockPreference,
    } as unknown as IDBPDatabase<SynapseSyncDB>;

    const mockDbService = {
      getDB: async () => mockDB,
    } as unknown as DatabaseService;

    const service = new PreferencesService(mockDbService);
    const result = await service.get<string>('theme');
    assert.equal(result, 'dark');
  });
});
