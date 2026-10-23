import { DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { ChatMessage, SRSCard } from '../models';
import type { GoogleDriveApiClient } from '../../api/google_drive_client';
import { PreferencesService } from './preferences_service';

export interface AppStateStudyStats {
  cardsDueToday: number;
  studyStreakDays: number;
  studyStreakYesterday: number;
  lastReviewDate: string | null;
  totalReviewsCompleted: number;
  masteredCards: number;
}

export interface AppStatePayload {
  version: number;
  updatedAt: string;
  userId?: string;
  studyStats: AppStateStudyStats;
  preferences: Record<string, unknown>;
  srsCards: SRSCard[];
  chatMessages: ChatMessage[];
}

/**
 * Service managing synchronization of global application state with Google Drive.
 */
export class AppStateSyncService {
  private static readonly _APP_FOLDER_NAME = 'SynapseSync';
  private static readonly _STATE_FILE_NAME = 'app_state.json';
  private static readonly _JSON_MIME = 'application/json';
  private static readonly _PAYLOAD_VERSION = 1;
  private static readonly _MASTERED_INTERVAL_THRESHOLD = 21;
  private static readonly _DATE_SLICE_LENGTH = 10;
  private static readonly _MS_PER_DAY = 86400000;
  private static readonly _PREF_STREAK_DAYS = 'studyStreakDays';
  private static readonly _PREF_STREAK_YESTERDAY = 'studyStreakYesterday';
  private static readonly _PREF_CARDS_DUE = 'cardsDueToday';

  private readonly _databaseService: DatabaseService;
  private readonly _gdriveClient: GoogleDriveApiClient;
  private readonly _preferencesService: PreferencesService;
  private _appFolderId: string | null = null;

  public constructor(
    databaseService: DatabaseService,
    googleDriveClient: GoogleDriveApiClient,
    preferencesService?: PreferencesService
  ) {
    this._databaseService = databaseService;
    this._gdriveClient = googleDriveClient;
    this._preferencesService = preferencesService ?? new PreferencesService(databaseService);
  }

  /**
   * Pushes the complete local application state snapshot to Google Drive.
   */
  public async pushAppState(userId?: string): Promise<AppStatePayload> {
    const payload = await this.buildLocalPayload(userId);
    const folderId = await this._getAppFolderId();
    const content = JSON.stringify(payload, null, 2);

    await this._gdriveClient.saveFile(
      AppStateSyncService._STATE_FILE_NAME,
      content,
      AppStateSyncService._JSON_MIME,
      folderId
    );
    await this._cacheStatsInPreferences(payload.studyStats);
    return payload;
  }

  /**
   * Pulls application state snapshot from Google Drive and restores into local stores.
   */
  public async pullAppState(): Promise<AppStatePayload | null> {
    const folderId = await this._getAppFolderId();
    const file = await this._gdriveClient.findFileByName(AppStateSyncService._STATE_FILE_NAME, folderId);
    if (!file) {
      return this._handleMissingRemoteState();
    }
    const rawText = await this._gdriveClient.getFileText(file.id);
    const payload = JSON.parse(rawText) as AppStatePayload;
    await this._restoreRemotePayload(payload);
    return payload;
  }

  /**
   * Constructs the application state payload from current local IndexedDB data.
   */
  public async buildLocalPayload(userId?: string): Promise<AppStatePayload> {
    const db = await this._databaseService.getDB();
    const [srsCards, chatMessages, preferences] = await Promise.all([
      db.getAll(DB_STORES.SRS_CARDS),
      db.getAll(DB_STORES.CHAT_MESSAGES),
      this._preferencesService.getAll(),
    ]);

    const studyStats = this.computeStudyStats(srsCards);
    return {
      version: AppStateSyncService._PAYLOAD_VERSION,
      updatedAt: new Date().toISOString(),
      userId,
      studyStats,
      preferences,
      srsCards,
      chatMessages,
    };
  }

  /**
   * Computes streak, due cards, and mastery statistics from SRS card records.
   */
  public computeStudyStats(cards: SRSCard[]): AppStateStudyStats {
    const nowIso = new Date().toISOString();
    let cardsDueToday = 0;
    let totalReviewsCompleted = 0;
    let masteredCards = 0;

    for (const card of cards) {
      if (card.nextReview <= nowIso) cardsDueToday += 1;
      totalReviewsCompleted += card.repetitions;
      if (card.interval >= AppStateSyncService._MASTERED_INTERVAL_THRESHOLD) {
        masteredCards += 1;
      }
    }
    const { streakDays, streakYesterday, lastReviewDate } = this._computeStreakValues(cards);
    return {
      cardsDueToday,
      studyStreakDays: streakDays,
      studyStreakYesterday: streakYesterday,
      lastReviewDate,
      totalReviewsCompleted,
      masteredCards,
    };
  }

  /**
   * Restores an imported application state payload into local IndexedDB object stores.
   */
  protected async _restoreRemotePayload(payload: AppStatePayload): Promise<void> {
    const db = await this._databaseService.getDB();
    const tx = db.transaction([DB_STORES.SRS_CARDS, DB_STORES.CHAT_MESSAGES], 'readwrite');

    for (const card of payload.srsCards || []) {
      await tx.objectStore(DB_STORES.SRS_CARDS).put(card);
    }
    for (const message of payload.chatMessages || []) {
      await tx.objectStore(DB_STORES.CHAT_MESSAGES).put(message);
    }
    await tx.done;

    await this._restorePreferences(payload.preferences);
    await this._cacheStatsInPreferences(payload.studyStats);
  }

  /**
   * Writes preferences from remote payload into local preferences store.
   */
  protected async _restorePreferences(preferences: Record<string, unknown>): Promise<void> {
    if (!preferences) return;
    for (const [key, value] of Object.entries(preferences)) {
      if (value !== undefined && value !== null) {
        await this._preferencesService.set(key, value as never);
      }
    }
  }

  /**
   * Caches computed study stats in preferences for instant offline dashboard reading.
   */
  protected async _cacheStatsInPreferences(stats: AppStateStudyStats): Promise<void> {
    await this._preferencesService.set(AppStateSyncService._PREF_STREAK_DAYS, stats.studyStreakDays);
    await this._preferencesService.set(AppStateSyncService._PREF_STREAK_YESTERDAY, stats.studyStreakYesterday);
    await this._preferencesService.set(AppStateSyncService._PREF_CARDS_DUE, stats.cardsDueToday);
  }

  /**
   * Computes consecutive streak today, streak yesterday, and latest review date.
   */
  private _computeStreakValues(cards: SRSCard[]): {
    streakDays: number;
    streakYesterday: number;
    lastReviewDate: string | null;
  } {
    const reviewDates = new Set<string>();
    let latestDate: string | null = null;
    for (const card of cards) {
      if (card.lastReview) {
        const datePart = card.lastReview.slice(0, AppStateSyncService._DATE_SLICE_LENGTH);
        reviewDates.add(datePart);
        if (!latestDate || datePart > latestDate) latestDate = datePart;
      }
    }
    const streakYesterday = this._computeStreakFromOffset(reviewDates, 1);
    const todayStr = new Date().toISOString().slice(0, AppStateSyncService._DATE_SLICE_LENGTH);
    const studiedToday = reviewDates.has(todayStr);
    const streakDays = studiedToday ? 1 + streakYesterday : streakYesterday;
    return { streakDays, streakYesterday, lastReviewDate: latestDate };
  }

  /**
   * Computes backward streak count beginning at a relative day offset (1 = yesterday).
   */
  private _computeStreakFromOffset(dates: Set<string>, startOffsetDays: number): number {
    let streak = 0;
    let offset = startOffsetDays;
    while (true) {
      const targetDate = new Date(Date.now() - offset * AppStateSyncService._MS_PER_DAY);
      const str = targetDate.toISOString().slice(0, AppStateSyncService._DATE_SLICE_LENGTH);
      if (dates.has(str)) {
        streak += 1;
        offset += 1;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Initializes or pushes default state when no remote state file was found.
   */
  private async _handleMissingRemoteState(): Promise<AppStatePayload> {
    return this.pushAppState();
  }

  /**
   * Retrieves or creates the SynapseSync root folder on Google Drive.
   */
  private async _getAppFolderId(): Promise<string> {
    if (!this._appFolderId) {
      const folder = await this._gdriveClient.getOrCreateFolder(AppStateSyncService._APP_FOLDER_NAME);
      this._appFolderId = folder.id;
    }
    return this._appFolderId;
  }
}
