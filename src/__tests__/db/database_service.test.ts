import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DB_INDEXES, DB_STORES } from '../../lib/db/constants';
import { DatabaseService } from '../../lib/db/database_service';

describe('DatabaseService', () => {
  const TEST_DB_NAME = 'synapse-sync-db-test';
  const TEST_DB_VERSION = 1;

  it('creates a singleton connection and returns the opened database', async () => {
    const service = new DatabaseService(TEST_DB_NAME, TEST_DB_VERSION);
    const db1 = await service.getDB();
    const db2 = await service.getDB();

    assert.equal(db1, db2);
    assert.equal(db1.name, TEST_DB_NAME);
    assert.equal(db1.version, TEST_DB_VERSION);

    await service.close();
  });

  it('creates all 9 object stores and required indexes on upgrade', async () => {
    const service = new DatabaseService('synapse-sync-upgrade-test', TEST_DB_VERSION);
    const db = await service.getDB();

    const expectedStores = [
      DB_STORES.NOTEBOOKS,
      DB_STORES.NOTES,
      DB_STORES.QUIZZES,
      DB_STORES.MCQ_CARDS,
      DB_STORES.FLASHCARDS,
      DB_STORES.SRS_CARDS,
      DB_STORES.CHAT_MESSAGES,
      DB_STORES.SYNC_QUEUE,
      DB_STORES.PREFERENCES,
    ];

    for (const store of expectedStores) {
      assert.ok(db.objectStoreNames.contains(store), `Store ${store} should exist`);
    }

    const tx = db.transaction([DB_STORES.NOTEBOOKS, DB_STORES.SRS_CARDS], 'readonly');
    const notebookStore = tx.objectStore(DB_STORES.NOTEBOOKS);
    assert.ok(notebookStore.indexNames.contains(DB_INDEXES.BY_SOURCE));
    assert.ok(notebookStore.indexNames.contains(DB_INDEXES.BY_UPDATED));

    const srsStore = tx.objectStore(DB_STORES.SRS_CARDS);
    assert.ok(srsStore.indexNames.contains(DB_INDEXES.BY_CARD));
    assert.equal(srsStore.index(DB_INDEXES.BY_CARD).unique, true);

    await service.close();
  });

  it('resets db instance after closing', async () => {
    const service = new DatabaseService('synapse-sync-close-test', TEST_DB_VERSION);
    const firstInstance = await service.getDB();
    await service.close();
    const secondInstance = await service.getDB();

    assert.notEqual(firstInstance, secondInstance);
    await service.close();
  });
});
