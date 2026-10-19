import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDBPDatabase } from 'idb';
import { DB_STORES } from '../../lib/db/constants';
import { DatabaseService } from '../../lib/db/database_service';
import type { SRSCard } from '../../lib/db/models';
import type { SynapseSyncDB } from '../../lib/db/schema';
import { SRSCardService } from '../../lib/db/services/srs_card_service';

describe('SRSCardService', () => {
  const TEST_DB_NAME = 'synapse-srs-service-test';
  const CARD_ID_A = 'card-uuid-1';
  const CARD_ID_B = 'card-uuid-2';
  const CARD_ID_C = 'card-uuid-3';
  const PAST_DATE = '2026-01-01T00:00:00.000Z';
  const FUTURE_DATE = '2099-01-01T00:00:00.000Z';

  it('retrieves and updates an SRS card by cardId and id', async () => {
    const dbService = new DatabaseService(TEST_DB_NAME);
    const service = new SRSCardService(dbService);
    const db = await dbService.getDB();

    const card: SRSCard = {
      id: 'srs-1',
      cardId: CARD_ID_A,
      cardType: 'flashcard',
      repetitions: 0,
      easinessFactor: 2.5,
      interval: 0,
      nextReview: PAST_DATE,
      lastReview: null,
      totalReviews: 0,
      correctCount: 0,
    };
    await db.put(DB_STORES.SRS_CARDS, card);

    const fetched = await service.getByCardId(CARD_ID_A);
    assert.deepEqual(fetched, card);

    const updated = await service.update('srs-1', {
      repetitions: 1,
      interval: 1,
      lastReview: new Date().toISOString(),
      correctCount: 1,
      totalReviews: 1,
    });
    assert.equal(updated.repetitions, 1);
    assert.equal(updated.interval, 1);
    assert.equal(updated.totalReviews, 1);

    await dbService.close();
  });

  it('throws when updating a missing SRS card', async () => {
    const dbService = new DatabaseService('synapse-srs-missing-test');
    const service = new SRSCardService(dbService);

    await assert.rejects(
      async () => service.update('missing-srs-id', { repetitions: 2 }),
      /SRS Card not found/
    );

    await dbService.close();
  });

  it('filters due cards using the nextReview index', async () => {
    const dbService = new DatabaseService('synapse-srs-due-test');
    const service = new SRSCardService(dbService);
    const db = await dbService.getDB();

    const dueCard: SRSCard = {
      id: 'srs-due',
      cardId: CARD_ID_A,
      cardType: 'mcq',
      repetitions: 1,
      easinessFactor: 2.5,
      interval: 1,
      nextReview: PAST_DATE,
      lastReview: null,
      totalReviews: 1,
      correctCount: 1,
    };
    const futureCard: SRSCard = {
      id: 'srs-future',
      cardId: CARD_ID_B,
      cardType: 'flashcard',
      repetitions: 5,
      easinessFactor: 2.6,
      interval: 30,
      nextReview: FUTURE_DATE,
      lastReview: PAST_DATE,
      totalReviews: 5,
      correctCount: 5,
    };

    await db.put(DB_STORES.SRS_CARDS, dueCard);
    await db.put(DB_STORES.SRS_CARDS, futureCard);

    const dueCards = await service.getDueCards(new Date());
    assert.equal(dueCards.length, 1);
    assert.equal(dueCards[0].id, 'srs-due');

    const allDueWithFutureDate = await service.getDueCards(FUTURE_DATE);
    assert.equal(allDueWithFutureDate.length, 2);

    await dbService.close();
  });

  it('calculates comprehensive statistics including mastered cards', async () => {
    const dbService = new DatabaseService('synapse-srs-stats-test');
    const service = new SRSCardService(dbService);
    const db = await dbService.getDB();

    const dueCard: SRSCard = {
      id: 'card-1',
      cardId: CARD_ID_A,
      cardType: 'mcq',
      repetitions: 1,
      easinessFactor: 2.3,
      interval: 1,
      nextReview: PAST_DATE,
      lastReview: null,
      totalReviews: 1,
      correctCount: 1,
    };
    const masteredCard: SRSCard = {
      id: 'card-2',
      cardId: CARD_ID_B,
      cardType: 'flashcard',
      repetitions: 6,
      easinessFactor: 2.6,
      interval: 30,
      nextReview: FUTURE_DATE,
      lastReview: PAST_DATE,
      totalReviews: 6,
      correctCount: 6,
    };
    const normalCard: SRSCard = {
      id: 'card-3',
      cardId: CARD_ID_C,
      cardType: 'flashcard',
      repetitions: 3,
      easinessFactor: 2.1,
      interval: 10,
      nextReview: FUTURE_DATE,
      lastReview: PAST_DATE,
      totalReviews: 3,
      correctCount: 2,
    };

    await db.put(DB_STORES.SRS_CARDS, dueCard);
    await db.put(DB_STORES.SRS_CARDS, masteredCard);
    await db.put(DB_STORES.SRS_CARDS, normalCard);

    const stats = await service.getStats();
    assert.equal(stats.totalCards, 3);
    assert.equal(stats.cardsDueToday, 1);
    assert.equal(stats.masteredCards, 1);

    await dbService.close();
  });

  it('works with a mocked DatabaseService instance', async () => {
    const mockSRSCard: SRSCard = {
      id: 'mock-srs-1',
      cardId: 'mock-card-1',
      cardType: 'mcq',
      repetitions: 0,
      easinessFactor: 2.5,
      interval: 0,
      nextReview: '2026-01-01T00:00:00.000Z',
      lastReview: null,
      totalReviews: 0,
      correctCount: 0,
    };

    const mockDB = {
      getFromIndex: async () => mockSRSCard,
    } as unknown as IDBPDatabase<SynapseSyncDB>;

    const mockDbService = {
      getDB: async () => mockDB,
    } as unknown as DatabaseService;

    const service = new SRSCardService(mockDbService);
    const card = await service.getByCardId('mock-card-1');
    assert.equal(card?.id, 'mock-srs-1');
  });
});
