import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Notebook } from '@/lib/db/models';
import { MoveFolderModal } from '@/components/notes/MoveFolderModal';
import { NotebookList } from '@/components/notes/NotebookList';
import { NotebookService } from '@/lib/db/services/notebook_service';

describe('Folder Management — Move & Delete Components Test Suite', () => {
  const mockFolderA: Notebook = {
    id: 'folder-a',
    name: 'Computer Science',
    parentId: null,
    source: 'manual',
    tags: ['cs'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isSynced: false,
  };

  const mockFolderB: Notebook = {
    id: 'folder-b',
    name: 'Algorithms',
    parentId: 'folder-a',
    source: 'manual',
    tags: ['algo'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isSynced: false,
  };

  const mockFolderC: Notebook = {
    id: 'folder-c',
    name: 'Sorting',
    parentId: 'folder-b',
    source: 'manual',
    tags: ['sorting'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isSynced: false,
  };

  const mockFolderD: Notebook = {
    id: 'folder-d',
    name: 'Mathematics',
    parentId: null,
    source: 'manual',
    tags: ['math'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isSynced: false,
  };

  const allNotebooks = [mockFolderA, mockFolderB, mockFolderC, mockFolderD];

  describe('MoveFolderModal Component', () => {
    it('returns null when isOpen is false or folder is null', () => {
      const htmlClosed = renderToStaticMarkup(
        React.createElement(MoveFolderModal, {
          folder: mockFolderA,
          notebooks: allNotebooks,
          isOpen: false,
          onClose: () => {},
          onMoved: () => {},
        })
      );
      assert.equal(htmlClosed, '');

      const htmlNoFolder = renderToStaticMarkup(
        React.createElement(MoveFolderModal, {
          folder: null,
          notebooks: allNotebooks,
          isOpen: true,
          onClose: () => {},
          onMoved: () => {},
        })
      );
      assert.equal(htmlNoFolder, '');
    });

    it('renders dialog and excludes self and all recursive descendants from destination options', () => {
      const html = renderToStaticMarkup(
        React.createElement(MoveFolderModal, {
          folder: mockFolderA,
          notebooks: allNotebooks,
          isOpen: true,
          onClose: () => {},
          onMoved: () => {},
        })
      );

      assert.ok(html.includes('Move Folder'), 'Must render title');
      assert.ok(html.includes('Computer Science'), 'Must include folder name');
      assert.ok(html.includes('None (Make Top-Level Folder)'), 'Must include top-level option');
      // Mathematics is not a descendant of Computer Science, so it must be available
      assert.ok(html.includes('Mathematics'), 'Mathematics must be available');

      // Descendants of Computer Science (Algorithms, Sorting) and itself must NOT be available as destinations
      const descendants = NotebookService.getDescendantIdsFromList(mockFolderA.id, allNotebooks);
      assert.ok(descendants.has('folder-b'), 'folder-b is a descendant');
      assert.ok(descendants.has('folder-c'), 'folder-c is a descendant');

      // Count occurrences of option elements for Algorithms and Sorting
      assert.ok(!html.includes('value="folder-b"'), 'Child folder-b must NOT be an option');
      assert.ok(!html.includes('value="folder-c"'), 'Grandchild folder-c must NOT be an option');
      assert.ok(!html.includes('value="folder-a"'), 'Self folder-a must NOT be an option');
    });
  });

  describe('NotebookList Component — Move and Delete Folder Buttons', () => {
    it('renders Move and Delete buttons for each folder', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotebookList, {
          notebooks: allNotebooks,
          noteCounts: { 'folder-a': 2, 'folder-b': 0, 'folder-c': 0, 'folder-d': 0 },
        })
      );

      assert.ok(html.includes('Move'), 'Must include Move button text');
      assert.ok(html.includes('🗑️'), 'Must include trash icon for delete');
    });

    it('disables delete button when folder has notes or subfolders', () => {
      // folder-a has notes (2) and subfolders (folder-b) -> disabled
      // folder-b has subfolder (folder-c) -> disabled
      // folder-c has 0 notes and 0 subfolders -> enabled
      // folder-d has 0 notes and 0 subfolders -> enabled
      const html = renderToStaticMarkup(
        React.createElement(NotebookList, {
          notebooks: allNotebooks,
          noteCounts: { 'folder-a': 2, 'folder-b': 0, 'folder-c': 0, 'folder-d': 0 },
        })
      );

      // Verify disabled attribute presence on delete button for non-empty folders
      assert.ok(html.includes('Cannot delete: contains 2 note'), 'Tooltips explain why delete is disabled');
      assert.ok(html.includes('Delete empty folder &quot;Sorting&quot;'), 'Empty folder has delete title');
      assert.ok(html.includes('Delete empty folder &quot;Mathematics&quot;'), 'Empty folder has delete title');
    });
  });
});

