import { DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { UserPreference } from '../models';

export const PREFERENCE_DEFAULTS: Readonly<Record<string, UserPreference['value'] | null>> = {
  theme: 'system',
  dailyCardGoal: 20,
  quizDifficulty: 'medium',
  throttleSpeed: 'low',
  googleDriveConnected: false,
  lastSyncTimestamp: null as unknown as string,
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
};

export type KnownPreferenceKey = keyof typeof PREFERENCE_DEFAULTS;

/**
 * Service managing user settings and application preferences in IndexedDB.
 */
export class PreferencesService {
  private readonly _databaseService: DatabaseService;

  public constructor(databaseService: DatabaseService) {
    this._databaseService = databaseService;
  }

  /**
   * Retrieves a preference value by key, falling back to predefined default if absent.
   */
  public async get<T = UserPreference['value']>(key: string): Promise<T | undefined> {
    const db = await this._databaseService.getDB();
    const entry = await db.get(DB_STORES.PREFERENCES, key);
    if (entry !== undefined) {
      return entry.value as T;
    }
    if (Object.prototype.hasOwnProperty.call(PREFERENCE_DEFAULTS, key)) {
      return PREFERENCE_DEFAULTS[key] as T;
    }
    return undefined;
  }

  /**
   * Retrieves all stored preferences, merged with known defaults.
   */
  public async getAll(): Promise<Record<string, unknown>> {
    const db = await this._databaseService.getDB();
    const entries = await db.getAll(DB_STORES.PREFERENCES);
    const result: Record<string, unknown> = { ...PREFERENCE_DEFAULTS };

    for (const entry of entries) {
      result[entry.key] = entry.value;
    }
    return result;
  }

  /**
   * Sets or updates a preference key-value pair.
   */
  public async set<T extends UserPreference['value']>(key: string, value: T): Promise<void> {
    const db = await this._databaseService.getDB();
    const preference: UserPreference = { key, value };
    await db.put(DB_STORES.PREFERENCES, preference);
  }
}
