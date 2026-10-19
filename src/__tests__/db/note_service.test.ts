import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDBPDatabase } from 'idb';
import { DatabaseService } from '../../lib/db/database_service';
import type { Note } from '../../lib/db/models';
import type { SynapseSyncDB } from '../../lib/db/schema';
import { NoteService } from '../../lib/db/services/note_service';

describe('NoteService', () => {
  const TEST_DB_NAME = 'synapse-note-service-test';
  const NOTEBOOK_ID_A = 'nb-1';
  const NOTEBOOK_ID_B = 'nb-2';
  const TITLE_A = 'Cell Structure';
  const TITLE_B = 'Quantum Mechanics';
  const CONTENT_A = 'Cells are the basic structural and functional unit of life.';
  const NON_EXISTENT_ID = 'non-existent-note-id';

  it('creates and retrieves a note with accurate word count and timestamps', async () => {
    const dbService = new DatabaseService(TEST_DB_NAME);
    const service = new NoteService(dbService);

    const created = await service.create({
      notebookId: NOTEBOOK_ID_A,
      title: TITLE_A,
      content: CONTENT_A,
      contentFormat: 'markdown',
      sourceType: 'manual',
    });

    assert.ok(created.id);
    assert.equal(created.wordCount, 10);
    assert.equal(created.isSynced, false);

    const fetched = await service.getById(created.id);
    assert.deepEqual(fetched, created);

    await dbService.close();
  });

  it('computes 0 word count for empty or whitespace content', async () => {
    const dbService = new DatabaseService('synapse-note-empty-content-test');
    const service = new NoteService(dbService);

    const created = await service.create({
      notebookId: NOTEBOOK_ID_A,
      title: 'Empty Note',
      content: '   \n\t  ',
      contentFormat: 'plaintext',
      sourceType: 'manual',
    });

    assert.equal(created.wordCount, 0);
    await dbService.close();
  });

  it('filters notes by notebook and source type indexes', async () => {
    const dbService = new DatabaseService('synapse-note-indexes-test');
    const service = new NoteService(dbService);

    await service.create({
      notebookId: NOTEBOOK_ID_A,
      title: TITLE_A,
      content: CONTENT_A,
      contentFormat: 'markdown',
      sourceType: 'manual',
    });
    await service.create({
      notebookId: NOTEBOOK_ID_B,
      title: TITLE_B,
      content: 'Physics content',
      contentFormat: 'markdown',
      sourceType: 'youtube_transcript',
    });

    const nbANotes = await service.getByNotebook(NOTEBOOK_ID_A);
    assert.equal(nbANotes.length, 1);
    assert.equal(nbANotes[0].title, TITLE_A);

    const youtubeNotes = await service.getBySourceType('youtube_transcript');
    assert.equal(youtubeNotes.length, 1);
    assert.equal(youtubeNotes[0].title, TITLE_B);

    const all = await service.getAll();
    assert.equal(all.length, 2);

    await dbService.close();
  });

  it('updates note content and recomputes word count', async () => {
    const dbService = new DatabaseService('synapse-note-update-test');
    const service = new NoteService(dbService);

    const created = await service.create({
      notebookId: NOTEBOOK_ID_A,
      title: TITLE_A,
      content: 'One two three',
      contentFormat: 'plaintext',
      sourceType: 'manual',
    });
    assert.equal(created.wordCount, 3);

    const updated = await service.update(created.id, {
      content: 'One two three four five',
    });
    assert.equal(updated.wordCount, 5);

    const titleUpdated = await service.update(created.id, {
      title: 'New Title',
    });
    assert.equal(titleUpdated.wordCount, 5);
    assert.equal(titleUpdated.title, 'New Title');

    await dbService.close();
  });

  it('throws when updating a missing note', async () => {
    const dbService = new DatabaseService('synapse-note-missing-test');
    const service = new NoteService(dbService);

    await assert.rejects(
      async () => service.update(NON_EXISTENT_ID, { title: 'Fails' }),
      /Note not found/
    );

    await dbService.close();
  });

  it('searches notes case-insensitively across title and content', async () => {
    const dbService = new DatabaseService('synapse-note-search-test');
    const service = new NoteService(dbService);

    await service.create({
      notebookId: NOTEBOOK_ID_A,
      title: 'Mitochondria Energetics',
      content: 'Powerhouse of the cellular biology.',
      contentFormat: 'markdown',
      sourceType: 'manual',
    });
    await service.create({
      notebookId: NOTEBOOK_ID_B,
      title: 'Photosynthesis',
      content: 'Light dependent chlorophyll reactions.',
      contentFormat: 'markdown',
      sourceType: 'manual',
    });

    const searchTitle = await service.search('mitochondria');
    assert.equal(searchTitle.length, 1);
    assert.equal(searchTitle[0].title, 'Mitochondria Energetics');

    const searchContent = await service.search('CHLOROPHYLL');
    assert.equal(searchContent.length, 1);
    assert.equal(searchContent[0].title, 'Photosynthesis');

    const emptyResult = await service.search('  ');
    assert.equal(emptyResult.length, 0);

    await dbService.close();
  });

  it('deletes a note', async () => {
    const dbService = new DatabaseService('synapse-note-delete-test');
    const service = new NoteService(dbService);

    const created = await service.create({
      notebookId: NOTEBOOK_ID_A,
      title: TITLE_A,
      content: CONTENT_A,
      contentFormat: 'markdown',
      sourceType: 'manual',
    });

    await service.delete(created.id);
    const fetched = await service.getById(created.id);
    assert.equal(fetched, undefined);

    await dbService.close();
  });

  it('works with a mocked DatabaseService instance', async () => {
    const mockNote: Note = {
      id: 'mock-note-1',
      notebookId: 'mock-nb-1',
      title: 'Mock Note',
      content: 'Mock text',
      contentFormat: 'plaintext',
      sourceType: 'manual',
      wordCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isSynced: true,
    };

    const mockDB = {
      get: async () => mockNote,
    } as unknown as IDBPDatabase<SynapseSyncDB>;

    const mockDbService = {
      getDB: async () => mockDB,
    } as unknown as DatabaseService;

    const service = new NoteService(mockDbService);
    const result = await service.getById('mock-note-1');
    assert.equal(result?.title, 'Mock Note');
  });
});
