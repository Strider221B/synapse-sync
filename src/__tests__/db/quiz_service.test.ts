import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDBPDatabase } from 'idb';
import { DB_STORES } from '../../lib/db/constants';
import { DatabaseService } from '../../lib/db/database_service';
import type { Quiz } from '../../lib/db/models';
import type { SynapseSyncDB } from '../../lib/db/schema';
import { QuizService } from '../../lib/db/services/quiz_service';

describe('QuizService', () => {
  const TEST_DB_NAME = 'synapse-quiz-service-test';
  const NOTE_ID_A = 'note-quiz-1';
  const MODEL_NAME = 'gemini-2.5-flash';

  it('creates quiz with MCQ, flashcards, and initial SRS cards in transaction', async () => {
    const dbService = new DatabaseService(TEST_DB_NAME);
    const service = new QuizService(dbService);

    const created = await service.create(
      NOTE_ID_A,
      [
        {
          question: 'What is ATP?',
          options: ['Adenosine Triphosphate', 'Amino Acid', 'Protein', 'Lipid'],
          correctIndex: 0,
          explanation: 'ATP is the cellular energy currency.',
        },
      ],
      [
        {
          front: 'What produces ATP?',
          back: 'Mitochondria',
          tags: ['cell', 'biology'],
        },
      ],
      MODEL_NAME
    );

    assert.ok(created.quiz.id);
    assert.equal(created.quiz.version, 1);
    assert.equal(created.mcqCards.length, 1);
    assert.equal(created.flashcards.length, 1);

    const db = await dbService.getDB();
    const srsCards = await db.getAll(DB_STORES.SRS_CARDS);
    assert.equal(srsCards.length, 2);
    assert.equal(srsCards[0].easinessFactor, 2.5);
    assert.equal(srsCards[0].repetitions, 0);
    assert.equal(srsCards[0].interval, 0);

    await dbService.close();
  });

  it('increments version on subsequent quiz creation for the same note', async () => {
    const dbService = new DatabaseService('synapse-quiz-version-test');
    const service = new QuizService(dbService);

    const first = await service.create(NOTE_ID_A, [], [], MODEL_NAME);
    const second = await service.create(NOTE_ID_A, [], [], MODEL_NAME);

    assert.equal(first.quiz.version, 1);
    assert.equal(second.quiz.version, 2);

    await dbService.close();
  });

  it('retrieves quiz with its child MCQ cards and flashcards', async () => {
    const dbService = new DatabaseService('synapse-quiz-cards-test');
    const service = new QuizService(dbService);

    const created = await service.create(
      NOTE_ID_A,
      [
        {
          question: 'Question 1',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 1,
          explanation: 'B is right',
        },
      ],
      [
        {
          front: 'Front 1',
          back: 'Back 1',
          tags: ['tag1'],
        },
      ],
      MODEL_NAME
    );

    const loaded = await service.getQuizWithCards(created.quiz.id);
    assert.ok(loaded);
    assert.equal(loaded?.quiz.id, created.quiz.id);
    assert.equal(loaded?.mcqCards.length, 1);
    assert.equal(loaded?.flashcards.length, 1);

    const nonExistent = await service.getQuizWithCards('missing-quiz-id');
    assert.equal(nonExistent, undefined);

    await dbService.close();
  });

  it('retrieves all quizzes for a note', async () => {
    const dbService = new DatabaseService('synapse-quiz-note-test');
    const service = new QuizService(dbService);

    await service.create(NOTE_ID_A, [], [], MODEL_NAME);
    await service.create('note-other', [], [], MODEL_NAME);

    const noteQuizzes = await service.getByNote(NOTE_ID_A);
    assert.equal(noteQuizzes.length, 1);
    assert.equal(noteQuizzes[0].noteId, NOTE_ID_A);

    await dbService.close();
  });

  it('cascading deletes quiz, child cards, and their SRS records', async () => {
    const dbService = new DatabaseService('synapse-quiz-cascade-test');
    const service = new QuizService(dbService);

    const created = await service.create(
      NOTE_ID_A,
      [
        {
          question: 'Q1',
          options: ['A', 'B', 'C', 'D'],
          correctIndex: 0,
          explanation: 'A is right',
        },
      ],
      [
        {
          front: 'F1',
          back: 'B1',
          tags: [],
        },
      ],
      MODEL_NAME
    );

    const db = await dbService.getDB();
    assert.equal((await db.getAll(DB_STORES.QUIZZES)).length, 1);
    assert.equal((await db.getAll(DB_STORES.MCQ_CARDS)).length, 1);
    assert.equal((await db.getAll(DB_STORES.FLASHCARDS)).length, 1);
    assert.equal((await db.getAll(DB_STORES.SRS_CARDS)).length, 2);

    await service.delete(created.quiz.id);

    assert.equal((await db.getAll(DB_STORES.QUIZZES)).length, 0);
    assert.equal((await db.getAll(DB_STORES.MCQ_CARDS)).length, 0);
    assert.equal((await db.getAll(DB_STORES.FLASHCARDS)).length, 0);
    assert.equal((await db.getAll(DB_STORES.SRS_CARDS)).length, 0);

    await dbService.close();
  });

  it('works with a mocked DatabaseService instance', async () => {
    const mockQuiz: Quiz = {
      id: 'mock-quiz-1',
      noteId: 'mock-note-1',
      modelUsed: 'mock-model',
      version: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
    };

    const mockDB = {
      getAllFromIndex: async () => [mockQuiz],
    } as unknown as IDBPDatabase<SynapseSyncDB>;

    const mockDbService = {
      getDB: async () => mockDB,
    } as unknown as DatabaseService;

    const service = new QuizService(mockDbService);
    const quizzes = await service.getByNote('mock-note-1');
    assert.equal(quizzes.length, 1);
    assert.equal(quizzes[0].id, 'mock-quiz-1');
  });
});
