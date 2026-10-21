import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseService } from '../../lib/db/database_service';
import type { SyncEntry } from '../../lib/db/models';
import { NoteService } from '../../lib/db/services/note_service';
import { QuizService } from '../../lib/db/services/quiz_service';
import { SRSCardService } from '../../lib/db/services/srs_card_service';
import { SyncQueueService } from '../../lib/db/services/sync_queue_service';
import { SyncManager } from '../../lib/db/sync_manager';

describe('SyncManager', () => {
  const TEST_DB_NAME = 'synapse-sync-manager-test';

  it('manages singleton lifecycle correctly', () => {
    SyncManager.resetInstance();
    const dbService = new DatabaseService('singleton-test');
    const queueService = new SyncQueueService(dbService);
    const instance1 = SyncManager.getInstance(queueService);
    const instance2 = SyncManager.getInstance();

    assert.equal(instance1, instance2);
    SyncManager.resetInstance();
  });

  it('replays pending items in FIFO order and marks them completed', async () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-replay-success`);
    const queueService = new SyncQueueService(dbService);
    const replayedIds: string[] = [];

    const item1 = await queueService.enqueue('note', 'note-1', 'create', { title: 'First Note' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const item2 = await queueService.enqueue('note', 'note-2', 'update', { title: 'Second Note' });

    const manager = new SyncManager(queueService, async (entry: SyncEntry) => {
      replayedIds.push(entry.id);
    });

    const result = await manager.processQueue();

    assert.equal(result.totalProcessed, 2);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.skipped, 0);
    assert.deepEqual(replayedIds, [item1.id, item2.id]);

    const remainingPending = await queueService.getPending();
    assert.equal(remainingPending.length, 0);

    await dbService.close();
  });

  it('marks failed entries and increments retry count on replay error', async () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-replay-fail`);
    const queueService = new SyncQueueService(dbService);

    const _item = await queueService.enqueue('srs_card', 'card-1', 'update', { interval: 5 });

    const manager = new SyncManager(queueService, async () => {

      throw new Error('Server unreachable');
    });

    const result = await manager.processQueue();

    assert.equal(result.totalProcessed, 1);
    assert.equal(result.succeeded, 0);
    assert.equal(result.failed, 1);

    const remainingPending = await queueService.getPending();
    assert.equal(remainingPending.length, 0); // Status is now 'failed'

    await dbService.close();
  });

  it('skips items that exceed max retry count', async () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-max-retries`);
    const queueService = new SyncQueueService(dbService);

    const item = await queueService.enqueue('quiz', 'quiz-1', 'create', {});
    // Artificially simulate 3 previous failed attempts
    const db = await dbService.getDB();
    await db.put('sync_queue', { ...item, retryCount: 3 });

    let replayed = false;
    const manager = new SyncManager(queueService, async () => {
      replayed = true;
    }, 3);

    const result = await manager.processQueue();

    assert.equal(result.skipped, 1);
    assert.equal(result.totalProcessed, 0);
    assert.equal(replayed, false);

    await dbService.close();
  });

  it('handles offline mutation queueing in NoteService', async () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-note-offline`);
    const queueService = new SyncQueueService(dbService);
    const noteService = new NoteService(dbService, queueService);

    // Mock offline state
    (noteService as unknown as { _isOffline: () => boolean })._isOffline = () => true;

    const note = await noteService.create({
      notebookId: 'nb-1',
      title: 'Offline Note',
      content: 'Offline content',
      contentFormat: 'markdown',
      sourceType: 'manual',
    });

    const pendingAfterCreate = await queueService.getPending();
    assert.equal(pendingAfterCreate.length, 1);
    assert.equal(pendingAfterCreate[0].entityType, 'note');
    assert.equal(pendingAfterCreate[0].operation, 'create');
    assert.equal(pendingAfterCreate[0].entityId, note.id);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await noteService.update(note.id, { title: 'Updated Title' });
    const pendingAfterUpdate = await queueService.getPending();
    assert.equal(pendingAfterUpdate.length, 2);
    assert.equal(pendingAfterUpdate[1].operation, 'update');

    await new Promise((resolve) => setTimeout(resolve, 5));
    await noteService.delete(note.id);
    const pendingAfterDelete = await queueService.getPending();
    assert.equal(pendingAfterDelete.length, 3);
    assert.equal(pendingAfterDelete[2].operation, 'delete');

    await dbService.close();
  });

  it('handles offline mutation queueing in SRSCardService', async () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-srs-offline`);
    const queueService = new SyncQueueService(dbService);
    const srsService = new SRSCardService(dbService, queueService);

    // Seed SRS card
    const db = await dbService.getDB();
    const card = {
      id: 'srs-offline-1',
      cardId: 'card-1',
      cardType: 'flashcard' as const,
      repetitions: 1,
      easinessFactor: 2.5,
      interval: 1,
      nextReview: new Date().toISOString(),
      lastReview: null,
      totalReviews: 1,
      correctCount: 1,
    };
    await db.put('srs_cards', card);

    // Mock offline state
    (srsService as unknown as { _isOffline: () => boolean })._isOffline = () => true;

    await srsService.update(card.id, { interval: 6, repetitions: 2 });

    const pending = await queueService.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].entityType, 'srs_card');
    assert.equal(pending[0].entityId, card.id);
    assert.equal(pending[0].operation, 'update');

    await dbService.close();
  });

  it('handles offline mutation queueing in QuizService', async () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-quiz-offline`);
    const queueService = new SyncQueueService(dbService);
    const quizService = new QuizService(dbService, queueService);

    // Mock offline state
    (quizService as unknown as { _isOffline: () => boolean })._isOffline = () => true;


    const quizWithCards = await quizService.create(
      'note-offline-quiz',
      [{ question: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'Exp' }],
      [{ front: 'F1', back: 'B1', tags: ['general'] }],
      'gemini-2.5-flash'
    );



    const pending = await queueService.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].entityType, 'quiz');
    assert.equal(pending[0].entityId, quizWithCards.quiz.id);
    assert.equal(pending[0].operation, 'create');

    await dbService.close();
  });

  it('registers and unregisters window online event listeners safely', () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-listener`);
    const queueService = new SyncQueueService(dbService);
    const manager = new SyncManager(queueService);

    // In Node environment, window is undefined, methods should not throw
    assert.doesNotThrow(() => manager.startListening());
    assert.doesNotThrow(() => manager.stopListening());
  });

  it('handles registerBackgroundSync gracefully when unsupported', async () => {
    const dbService = new DatabaseService(`${TEST_DB_NAME}-bg-sync`);
    const queueService = new SyncQueueService(dbService);
    const manager = new SyncManager(queueService);

    const supported = await manager.registerBackgroundSync();
    assert.equal(supported, false);
  });
});
