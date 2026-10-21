import { DatabaseService } from './database_service';
import type { SyncEntry } from './models';
import { SyncQueueService } from './services/sync_queue_service';


export interface SyncReplayResult {
  totalProcessed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export type SyncReplayHandler = (entry: SyncEntry) => Promise<void>;

/**
 * Manages background and online synchronization of offline mutation events.
 */
export class SyncManager {
  private static readonly _DEFAULT_MAX_RETRIES = 3;
  private static readonly _EVENT_ONLINE = 'online';
  private static readonly _SYNC_EVENT_NAME = 'synapse-sync-completed';
  private static readonly _SYNC_TAG = 'sync-queue';
  private static _instance: SyncManager | null = null;

  private readonly _syncQueueService: SyncQueueService;
  private readonly _replayHandler?: SyncReplayHandler;
  private readonly _maxRetries: number;
  private _isProcessing: boolean = false;
  private _onlineListener: (() => void) | null = null;

  public static getInstance(syncQueueService?: SyncQueueService): SyncManager {
    if (!SyncManager._instance) {
      const sqService = syncQueueService ?? new SyncQueueService(new DatabaseService());
      SyncManager._instance = new SyncManager(sqService);
    }
    return SyncManager._instance;
  }

  public static resetInstance(): void {
    if (SyncManager._instance) {
      SyncManager._instance.stopListening();
      SyncManager._instance = null;
    }
  }

  public constructor(
    syncQueueService: SyncQueueService,
    replayHandler?: SyncReplayHandler,
    maxRetries: number = SyncManager._DEFAULT_MAX_RETRIES
  ) {
    this._syncQueueService = syncQueueService;
    this._replayHandler = replayHandler;
    this._maxRetries = maxRetries;
  }

  /**
   * Returns whether a synchronization replay cycle is currently executing.
   */
  public isProcessing(): boolean {
    return this._isProcessing;
  }

  /**
   * Processes all pending sync queue items in FIFO order.
   */
  public async processQueue(): Promise<SyncReplayResult> {
    if (this._isProcessing || !this._isOnline()) {
      return { totalProcessed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }
    this._isProcessing = true;
    const result: SyncReplayResult = { totalProcessed: 0, succeeded: 0, failed: 0, skipped: 0 };

    try {
      const pending = await this._syncQueueService.getPending();
      for (const entry of pending) {
        if (entry.retryCount >= this._maxRetries) {
          result.skipped += 1;
          continue;
        }
        result.totalProcessed += 1;
        const success = await this.__processSingleEntry(entry);
        if (success) {
          result.succeeded += 1;
        } else {
          result.failed += 1;
        }
      }
      if (result.succeeded > 0) {
        this._notifySyncCompleted(result.succeeded);
      }
    } finally {
      this._isProcessing = false;
    }
    return result;
  }

  /**
   * Registers a window online event listener to trigger synchronization automatically.
   */
  public startListening(): void {
    if (typeof window === 'undefined' || this._onlineListener) {
      return;
    }
    this._onlineListener = () => {
      this.__onOnlineEvent();
    };
    window.addEventListener(SyncManager._EVENT_ONLINE, this._onlineListener);
  }

  /**
   * Unregisters the window online event listener.
   */
  public stopListening(): void {
    if (typeof window !== 'undefined' && this._onlineListener) {
      window.removeEventListener(SyncManager._EVENT_ONLINE, this._onlineListener);
      this._onlineListener = null;
    }
  }

  /**
   * Attempts to register with the browser Background Sync API if supported.
   */
  public async registerBackgroundSync(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker) {
      return false;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'sync' in reg && typeof (reg as { sync?: { register: (tag: string) => Promise<void> } }).sync?.register === 'function') {
        await (reg as { sync: { register: (tag: string) => Promise<void> } }).sync.register(SyncManager._SYNC_TAG);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }


  /**
   * Dispatches a custom notification event indicating changes have synced.
   */
  protected _notifySyncCompleted(succeededCount: number): void {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent(SyncManager._SYNC_EVENT_NAME, {
        detail: { count: succeededCount, timestamp: new Date().toISOString() },
      });
      window.dispatchEvent(event);
    }
  }

  /**
   * Checks whether the current environment reports online connectivity.
   */
  protected _isOnline(): boolean {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
      return true;
    }
    return navigator.onLine;
  }


  /**
   * Replays a single queued synchronization mutation.
   */
  protected async _replayEntry(entry: SyncEntry): Promise<void> {
    if (this._replayHandler) {
      await this._replayHandler(entry);
      return;
    }
    // Default replay logic for entities
    await this.__defaultReplay(entry);
  }

  private async __processSingleEntry(entry: SyncEntry): Promise<boolean> {
    try {
      await this._replayEntry(entry);
      await this._syncQueueService.markCompleted(entry.id);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this._syncQueueService.markFailed(entry.id, msg);
      return false;
    }
  }

  private async __defaultReplay(entry: SyncEntry): Promise<void> {
    // If the entry has an API endpoint or payload to push, verify connectivity
    if (entry.entityType === 'srs_card' || entry.entityType === 'note') {
      // Local mutation is already in IndexedDB; sync entry serves as sync journal
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  private __onOnlineEvent(): void {
    void this.processQueue();
  }
}
