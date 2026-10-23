import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import { DatabaseService } from '../../lib/db/database_service';
import { NoteService } from '../../lib/db/services/note_service';
import { NotebookService } from '../../lib/db/services/notebook_service';
import { DB_STORES } from '../../lib/db/constants';

describe('DatabaseService.clearAllData', () => {
  it('clears all object stores across the database', async () => {
    const dbService = new DatabaseService('test-clear-all-data');
    const notebookService = new NotebookService(dbService);
    const noteService = new NoteService(dbService);

    const nb = await notebookService.create({ name: 'Physics', source: 'manual', tags: ['physics'] });
    await noteService.create({
      notebookId: nb.id,
      title: 'Quantum Physics',
      sourceType: 'manual',
      content: 'Wave mechanics',
      contentFormat: 'markdown',
    });

    const db = await dbService.getDB();
    const notesBefore = await db.count(DB_STORES.NOTES);
    const notebooksBefore = await db.count(DB_STORES.NOTEBOOKS);
    assert.equal(notesBefore, 1);
    assert.equal(notebooksBefore, 1);

    await dbService.clearAllData();

    const notesAfter = await db.count(DB_STORES.NOTES);
    const notebooksAfter = await db.count(DB_STORES.NOTEBOOKS);
    assert.equal(notesAfter, 0);
    assert.equal(notebooksAfter, 0);

    await dbService.close();
  });
});
