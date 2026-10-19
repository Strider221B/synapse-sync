import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDBPDatabase } from 'idb';
import { DatabaseService } from '../../lib/db/database_service';
import type { SyncEntry } from '../../lib/db/models';
import type { SynapseSyncDB } from '../../lib/db/schema';
import { SyncQueueService } from '../../lib/db/services/sync_queue_service';

describe('SyncQueueService', () => {
  const TEST_DB_NAME = 'synapse-sync-queue-service-test';
  const ENTITY_ID = 'notebook-sync-1';
  const ERROR_MSG = 'Network timeout';

  it('enqueues mutations with pending status and initial retry count 0', async () => {
    const dbService = new DatabaseService(TEST_DB_NAME);
    const service = new SyncQueueService(dbService);

    const entry = await service.enqueue('notebook', ENTITY_ID, 'create', {
      name: 'Biology',
    });

    assert.ok(entry.id);
    assert.equal(entry.entityType, 'notebook');
    assert.equal(entry.entityId, ENTITY_ID);
    assert.equal(entry.operation, 'create');
    assert.equal(entry.status, 'pending');
    assert.equal(entry.retryCount, 0);

    await dbService.close();
  });

  it('retrieves pending items in FIFO order', async () => {
    const dbService = new DatabaseService('synapse-sync-queue-order-test');
    const service = new SyncQueueService(dbService);

    const first = await service.enqueue('note', 'note-1', 'create', {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await service.enqueue('note', 'note-2', 'update', {});

    const pending = await service.getPending();
    assert.equal(pending.length, 2);
    assert.equal(pending[0].id, first.id);
    assert.equal(pending[1].id, second.id);

    await dbService.close();
  });

  it('marks entry as completed', async () => {
    const dbService = new DatabaseService('synapse-sync-queue-completed-test');
    const service = new SyncQueueService(dbService);

    const entry = await service.enqueue('quiz', 'quiz-1', 'create', {});
    const completed = await service.markCompleted(entry.id);

    assert.equal(completed.status, 'completed');

    const pending = await service.getPending();
    assert.equal(pending.length, 0);

    await dbService.close();
  });

  it('marks entry as failed and increments retry count', async () => {
    const dbService = new DatabaseService('synapse-sync-queue-failed-test');
    const service = new SyncQueueService(dbService);

    const entry = await service.enqueue('srs_card', 'srs-1', 'update', {});
    const failed1 = await service.markFailed(entry.id, ERROR_MSG);

    assert.equal(failed1.status, 'failed');
    assert.equal(failed1.retryCount, 1);
    assert.equal(failed1.errorMessage, ERROR_MSG);

    const failed2 = await service.markFailed(entry.id, 'Second failure');
    assert.equal(failed2.retryCount, 2);

    await dbService.close();
  });

  it('throws when updating non-existent sync entry', async () => {
    const dbService = new DatabaseService('synapse-sync-queue-missing-test');
    const service = new SyncQueueService(dbService);

    await assert.rejects(
      async () => service.markCompleted('missing-id'),
      /Sync entry not found/
    );
    await assert.rejects(
      async () => service.markFailed('missing-id'),
      /Sync entry not found/
    );

    await dbService.close();
  });

  it('works with a mocked DatabaseService instance', async () => {
    const mockEntry: SyncEntry = {
      id: 'mock-sync-1',
      entityType: 'note',
      entityId: 'note-1',
      operation: 'create',
      payload: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'pending',
      retryCount: 0,
    };

    const mockDB = {
      getAllFromIndex: async () => [mockEntry],
    } as unknown as IDBPDatabase<SynapseSyncDB>;

    const mockDbService = {
      getDB: async () => mockDB,
    } as unknown as DatabaseService;

    const service = new SyncQueueService(mockDbService);
    const pending = await service.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, 'mock-sync-1');
  });
});
