import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import type { DriveItem, GoogleDriveApiClient } from '../../lib/api/google_drive_client';
import { DatabaseService } from '../../lib/db/database_service';
import type { Note } from '../../lib/db/models';
import { NoteManifestSyncService } from '../../lib/db/services/note_manifest_sync_service';
import { NoteService } from '../../lib/db/services/note_service';

describe('NoteManifestSyncService', () => {
  const TEST_DB_PREFIX = 'synapse-manifest-test';

  const createMockDriveClient = () => {
    const savedFiles: Record<string, { content: string; parentFolderId: string }> = {};
    const deletedFiles: string[] = [];
    const folders: Record<string, string> = {
      SynapseSync: 'folder-root-synapse',
      notes: 'folder-notes-id',
    };

    const client: Partial<GoogleDriveApiClient> = {
      getOrCreateFolder: async (name: string) => {
        const id = folders[name] ?? `folder-${name}-id`;
        return { id, name, folder: {} } as DriveItem;
      },
      findFileByName: async (name: string, parentFolderId = 'root') => {
        if (savedFiles[name] && savedFiles[name].parentFolderId === parentFolderId) {
          return { id: `file-${name}-id`, name, file: { mimeType: 'application/json' } } as DriveItem;
        }
        return null;
      },
      saveFile: async (name: string, content: string | Blob, _mime = 'application/json', parentFolderId = 'root') => {
        const text = typeof content === 'string' ? content : '';
        savedFiles[name] = { content: text, parentFolderId };
        return { id: `file-${name}-id`, name, file: { mimeType: 'application/json' } } as DriveItem;
      },
      getFileText: async (fileId: string) => {
        for (const [name, data] of Object.entries(savedFiles)) {
          if (`file-${name}-id` === fileId) return data.content;
        }
        return '{}';
      },
      deleteFile: async (fileId: string) => {
        deletedFiles.push(fileId);
      },
      listAllFolderItems: async (folderId: string) => {
        const results: DriveItem[] = [];
        for (const [name, data] of Object.entries(savedFiles)) {
          if (data.parentFolderId === folderId) {
            results.push({ id: `file-${name}-id`, name, file: { mimeType: 'application/json' } } as DriveItem);
          }
        }
        return results;
      },
    };

    return { client: client as GoogleDriveApiClient, savedFiles, deletedFiles };
  };

  it('pushes notes manifest containing titles and metadata without full bodies', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-push`);
    const noteService = new NoteService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const manifestService = new NoteManifestSyncService(dbService, client);

    await noteService.create({
      notebookId: 'nb-psychology',
      title: "The Prisoner's Dilemma",
      content: 'Evolution of Cooperation full article text goes here...',
      contentFormat: 'markdown',
      sourceType: 'youtube_transcript',
    });

    await manifestService.pushManifest();

    const manifestData = savedFiles['notes_manifest.json']?.content;
    assert.ok(manifestData);
    const parsed = JSON.parse(manifestData);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "The Prisoner's Dilemma");
    assert.equal(parsed[0].notebookId, 'nb-psychology');
    assert.equal(parsed[0].content, undefined);

    await dbService.close();
  });

  it('pulls note metadata from manifest as stubs with isBodyLoaded false', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-pull`);
    const noteService = new NoteService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const manifestService = new NoteManifestSyncService(dbService, client);

    const remoteEntries = [
      {
        id: 'note-stub-1',
        notebookId: 'nb-psychology',
        title: 'Cognitive Biases',
        contentFormat: 'markdown',
        sourceType: 'manual',
        wordCount: 1500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        previewSnippet: 'Confirmation bias and anchoring',
      },
    ];
    savedFiles['notes_manifest.json'] = {
      content: JSON.stringify(remoteEntries),
      parentFolderId: 'folder-root-synapse',
    };

    const count = await manifestService.pullNotes();
    assert.equal(count, 1);

    const loaded = await noteService.getById('note-stub-1');
    assert.ok(loaded);
    assert.equal(loaded.title, 'Cognitive Biases');
    assert.equal(loaded.notebookId, 'nb-psychology');
    assert.equal(loaded.content, '');
    assert.equal(loaded.isBodyLoaded, false);

    await dbService.close();
  });

  it('pulls full note body on-demand and marks isBodyLoaded true', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-on-demand`);
    const noteService = new NoteService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const manifestService = new NoteManifestSyncService(dbService, client);

    const fullRemoteNote: Note = {
      id: 'note-body-1',
      notebookId: 'nb-psychology',
      title: 'Game Theory Deep Dive',
      content: '# Full Chapter Content\nNash equilibrium and payoff matrices.',
      contentFormat: 'markdown',
      sourceType: 'manual',
      wordCount: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: true,
    };
    savedFiles['note_note-body-1.json'] = {
      content: JSON.stringify(fullRemoteNote),
      parentFolderId: 'folder-notes-id',
    };

    // Note stub exists locally
    await dbService.getDB().then((db) =>
      db.put('notes', {
        ...fullRemoteNote,
        content: '',
        isBodyLoaded: false,
      })
    );

    const result = await manifestService.pullNoteBody('note-body-1');
    assert.ok(result);
    assert.equal(result.isBodyLoaded, true);
    assert.match(result.content, /Nash equilibrium/);

    const inDb = await noteService.getById('note-body-1');
    assert.equal(inDb?.isBodyLoaded, true);
    assert.match(inDb?.content ?? '', /Nash equilibrium/);

    await dbService.close();
  });

  it('pushes local note if present locally but missing from remote manifest', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-push-missing`);
    const noteService = new NoteService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const manifestService = new NoteManifestSyncService(dbService, client);

    const localNote = await noteService.create({
      notebookId: 'nb-psychology',
      title: 'Local Only Note',
      content: 'This note was made locally',
      contentFormat: 'markdown',
      sourceType: 'manual',
      isSynced: true,
    });

    savedFiles['notes_manifest.json'] = {
      content: JSON.stringify([]),
      parentFolderId: 'folder-root-synapse',
    };

    const pushedNotes: Note[] = [];
    await manifestService.pullNotes(async (note) => {
      pushedNotes.push(note);
    });

    assert.equal(pushedNotes.length, 1);
    assert.equal(pushedNotes[0].id, localNote.id);

    await dbService.close();
  });

  it('reconciles unmanifested notes from notes folder when manifest already exists', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-reconcile`);
    const noteService = new NoteService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const manifestService = new NoteManifestSyncService(dbService, client);

    const existingManifestEntry = {
      id: 'note-existing',
      notebookId: 'nb-1',
      title: 'Existing Note',
      contentFormat: 'markdown',
      sourceType: 'manual',
      wordCount: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      previewSnippet: 'Existing note snippet',
    };
    savedFiles['notes_manifest.json'] = {
      content: JSON.stringify([existingManifestEntry]),
      parentFolderId: 'folder-root-synapse',
    };

    const unmanifestedNote: Note = {
      id: 'note_Lecture_1_-_Transformer',
      notebookId: 'nb-cme295',
      title: 'Lecture 1 - Transformer',
      content: '# Transformers\nFull transformer notes content.',
      contentFormat: 'markdown',
      sourceType: 'manual',
      wordCount: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: true,
    };
    savedFiles['note_note_Lecture_1_-_Transformer.json'] = {
      content: JSON.stringify(unmanifestedNote),
      parentFolderId: 'folder-notes-id',
    };

    const count = await manifestService.pullNotes();
    assert.equal(count, 2);

    const pulledUnmanifested = await noteService.getById('note_Lecture_1_-_Transformer');
    assert.ok(pulledUnmanifested);
    assert.equal(pulledUnmanifested.title, 'Lecture 1 - Transformer');
    assert.equal(pulledUnmanifested.notebookId, 'nb-cme295');

    const updatedManifestText = savedFiles['notes_manifest.json']?.content;
    assert.ok(updatedManifestText);
    const parsedManifest = JSON.parse(updatedManifestText);
    assert.equal(parsedManifest.length, 2);
    assert.ok(parsedManifest.some((e: { id: string }) => e.id === 'note_Lecture_1_-_Transformer'));

    await dbService.close();
  });
});
