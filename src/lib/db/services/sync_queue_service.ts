import { v4 as uuidv4 } from 'uuid';
import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { SyncEntry } from '../models';

export type SyncEntityType = SyncEntry['entityType'];
export type SyncOperation = SyncEntry['operation'];
export type SyncStatus = SyncEntry['status'];

/**
 * Service managing the offline sync queue.
 */
export class SyncQueueService {
  private static readonly _ERROR_ENTRY_NOT_FOUND = 'Sync entry not found';
  private static readonly _STATUS_PENDING: SyncStatus = 'pending';
  private static readonly _STATUS_COMPLETED: SyncStatus = 'completed';
  private static readonly _STATUS_FAILED: SyncStatus = 'failed';
  private static readonly _INITIAL_RETRY_COUNT = 0;
  private static readonly _RETRY_INCREMENT = 1;

  private readonly _databaseService: DatabaseService;

  public constructor(databaseService: DatabaseService) {
    this._databaseService = databaseService;
  }

  /**
   * Enqueues a new synchronization operation with pending status.
   */
  public async enqueue(
    entityType: SyncEntityType,
    entityId: string,
    operation: SyncOperation,
    payload: Record<string, unknown>
  ): Promise<SyncEntry> {
    const db = await this._databaseService.getDB();
    const entry: SyncEntry = {
      id: uuidv4(),
      entityType,
      entityId,
      operation,
      payload,
      createdAt: new Date().toISOString(),
      status: SyncQueueService._STATUS_PENDING,
      retryCount: SyncQueueService._INITIAL_RETRY_COUNT,
    };

    await db.put(DB_STORES.SYNC_QUEUE, entry);
    return entry;
  }

  /**
   * Retrieves all pending sync entries sorted in FIFO order by creation timestamp.
   */
  public async getPending(): Promise<SyncEntry[]> {
    const db = await this._databaseService.getDB();
    const entries = await db.getAllFromIndex(
      DB_STORES.SYNC_QUEUE,
      DB_INDEXES.BY_STATUS,
      SyncQueueService._STATUS_PENDING
    );
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Marks a sync entry as successfully completed.
   */
  public async markCompleted(id: string): Promise<SyncEntry> {
    const db = await this._databaseService.getDB();
    const existing = await db.get(DB_STORES.SYNC_QUEUE, id);
    if (!existing) {
      throw new Error(`${SyncQueueService._ERROR_ENTRY_NOT_FOUND}: ${id}`);
    }

    const updated: SyncEntry = {
      ...existing,
      status: SyncQueueService._STATUS_COMPLETED,
    };

    await db.put(DB_STORES.SYNC_QUEUE, updated);
    return updated;
  }

  /**
   * Marks a sync entry as failed and increments retry count.
   */
  public async markFailed(id: string, errorMessage?: string): Promise<SyncEntry> {
    const db = await this._databaseService.getDB();
    const existing = await db.get(DB_STORES.SYNC_QUEUE, id);
    if (!existing) {
      throw new Error(`${SyncQueueService._ERROR_ENTRY_NOT_FOUND}: ${id}`);
    }

    const updated: SyncEntry = {
      ...existing,
      status: SyncQueueService._STATUS_FAILED,
      retryCount: existing.retryCount + SyncQueueService._RETRY_INCREMENT,
      errorMessage,
    };

    await db.put(DB_STORES.SYNC_QUEUE, updated);
    return updated;
  }
}
