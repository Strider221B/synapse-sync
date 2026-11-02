import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Note } from '../../lib/db/models';
import { NoteSortService } from '../../lib/db/services/note_sort_service';

describe('NoteSortService', () => {
  const createNoteStub = (partial: Partial<Note>): Note => ({
    id: partial.id || 'note-id',
    notebookId: partial.notebookId || 'nb-id',
    title: partial.title || 'Untitled',
    content: partial.content || '',
    contentFormat: 'markdown',
    sourceType: 'manual',
    wordCount: 0,
    createdAt: partial.createdAt || '2026-11-01T00:00:00.000Z',
    updatedAt: partial.updatedAt || '2026-11-01T00:00:00.000Z',
    isSynced: true,
    order: partial.order,
  });

  it('sorts notes by explicit order property when present', () => {
    const noteA = createNoteStub({ id: 'a', title: 'Lecture 10', order: 10 });
    const noteB = createNoteStub({ id: 'b', title: 'Lecture 2', order: 2 });
    const noteC = createNoteStub({ id: 'c', title: 'Lecture 1', order: 1 });

    const sorted = NoteSortService.sortNotes([noteA, noteB, noteC]);
    assert.deepEqual(sorted.map((n) => n.id), ['c', 'b', 'a']);
  });

  it('places notes with explicit order before notes without order', () => {
    const noteWithOrder = createNoteStub({ id: 'with-order', title: 'Lecture 5', order: 1 });
    const noteWithoutOrder = createNoteStub({ id: 'no-order', title: 'Lecture 1', order: undefined });

    const sorted = NoteSortService.sortNotes([noteWithoutOrder, noteWithOrder]);
    assert.deepEqual(sorted.map((n) => n.id), ['with-order', 'no-order']);
  });

  it('sorts lecture sequence numbers correctly (Lecture 1 before Lecture 2 before Lecture 14)', () => {
    const note1 = createNoteStub({
      id: 'lec1',
      title: 'Stanford CS221 | Autumn 2025 | Lecture 1: Course Overview and AI Foundations',
    });
    const note2 = createNoteStub({ id: 'lec2', title: 'Lecture 2: Learning I' });
    const note3 = createNoteStub({ id: 'lec3', title: 'Lecture 3: Learning II' });
    const note14 = createNoteStub({ id: 'lec14', title: 'Lecture 14: Bayesian Networks and Learning' });
    const note19 = createNoteStub({ id: 'lec19', title: 'Lecture 19: AI Supply Chains' });

    // Intentionally pass in lexicographical / unordered list
    const input = [note14, note19, note2, note1, note3];
    const sorted = NoteSortService.sortNotes(input);

    assert.deepEqual(sorted.map((n) => n.id), ['lec1', 'lec2', 'lec3', 'lec14', 'lec19']);
  });

  it('sorts titles with numeric prefixes or parts and episodes', () => {
    const note1 = createNoteStub({ id: 'p1', title: '001_Introduction' });
    const note2 = createNoteStub({ id: 'p2', title: '002_Basics' });
    const note10 = createNoteStub({ id: 'p10', title: '010_Advanced' });

    const sorted = NoteSortService.sortNotes([note10, note2, note1]);
    assert.deepEqual(sorted.map((n) => n.id), ['p1', 'p2', 'p10']);
  });

  it('falls back to natural alphanumeric sort when no lecture numbers exist', () => {
    const noteA = createNoteStub({ id: 'item2', title: 'Chapter 2: Summary' });
    const noteB = createNoteStub({ id: 'item10', title: 'Chapter 10: Conclusion' });

    const sorted = NoteSortService.sortNotes([noteB, noteA]);
    assert.deepEqual(sorted.map((n) => n.id), ['item2', 'item10']);
  });

  it('falls back to createdAt when titles are identical', () => {
    const noteOlder = createNoteStub({
      id: 'older',
      title: 'Study Notes',
      createdAt: '2026-11-01T01:00:00.000Z',
    });
    const noteNewer = createNoteStub({
      id: 'newer',
      title: 'Study Notes',
      createdAt: '2026-11-01T02:00:00.000Z',
    });

    const sorted = NoteSortService.sortNotes([noteNewer, noteOlder]);
    assert.deepEqual(sorted.map((n) => n.id), ['older', 'newer']);
  });

  it('handles empty arrays and single items gracefully', () => {
    assert.deepEqual(NoteSortService.sortNotes([]), []);
    const single = createNoteStub({ id: 'single', title: 'Only Note' });
    assert.deepEqual(NoteSortService.sortNotes([single]), [single]);
  });
});

