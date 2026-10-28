import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import { DatabaseService } from '../../lib/db/database_service';
import { NoteService } from '../../lib/db/services/note_service';
import { QuizService } from '../../lib/db/services/quiz_service';
import { NotebookService } from '../../lib/db/services/notebook_service';
import { SyncQueueService } from '../../lib/db/services/sync_queue_service';
import { PreferencesService } from '../../lib/db/services/preferences_service';
import { GoogleDriveSyncService, type QuizDrivePayload } from '../../lib/db/services/google_drive_sync_service';
import { DEFAULT_AI_MODEL } from '../../lib/api/ai_config';
import type { GoogleDriveApiClient, DriveItem } from '../../lib/api/google_drive_client';
import type { AuthService } from '../../lib/auth/auth_service';
import type { Note, Notebook } from '../../lib/db/models';

const TEST_DB_PREFIX = 'test-gdrive-sync';

describe('GoogleDriveSyncService', () => {
  const createMockAuth = (isAuthed = true): AuthService =>
    ({
      isAuthenticated: () => isAuthed,
      getAccessToken: async () => 'mock-token',
    } as unknown as AuthService);

  const createMockDriveClient = () => {
    const savedFiles: Record<string, { content: string; parentFolderId: string }> = {};
    const deletedFiles: string[] = [];
    const folders: Record<string, string> = {
      SynapseSync: 'folder-root-synapse',
      notes: 'folder-notes-id',
      quizzes: 'folder-quizzes-id',
      notebooks: 'folder-notebooks-id',
    };

    const client: Partial<GoogleDriveApiClient> = {
      getOrCreateFolder: async (name: string, _parentId?: string) => {
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
          if (`file-${name}-id` === fileId) {
            return data.content;
          }
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

  it('checks authentication state accurately', () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-auth`);
    const { client } = createMockDriveClient();
    const service1 = new GoogleDriveSyncService(dbService, client, createMockAuth(true));
    assert.equal(service1.isConnected(), true);

    const service2 = new GoogleDriveSyncService(dbService, client, createMockAuth(false));
    assert.equal(service2.isConnected(), false);
  });

  it('pushes notes to Google Drive and marks them as synced', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-push-note`);
    const noteService = new NoteService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    const note = await noteService.create({
      notebookId: 'nb-1',
      title: 'Neural Networks',
      content: 'Deep learning concepts',
      contentFormat: 'markdown',
      sourceType: 'manual',
    });

    assert.equal(note.isSynced, false);
    await syncService.pushNote(note);

    const fileName = `note_${note.id}.json`;
    assert.ok(savedFiles[fileName]);
    assert.equal(savedFiles[fileName].parentFolderId, 'folder-notes-id');

    const updatedNote = await noteService.getById(note.id);
    assert.equal(updatedNote?.isSynced, true);

    await dbService.close();
  });

  it('pushes quiz bundled with MCQs, flashcards, and SRS state', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-push-quiz`);
    const quizService = new QuizService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    const quizWithCards = await quizService.create(
      'note-123',
      [{ question: 'What is gradient descent?', options: ['Optimizer', 'Loss', 'Model', 'Layer'], correctIndex: 0, explanation: 'Opt' }],
      [{ front: 'Backpropagation', back: 'Chain rule algorithm', tags: ['DL'] }],
      DEFAULT_AI_MODEL
    );

    await syncService.pushQuiz(quizWithCards.quiz.id);

    const fileName = `quiz_${quizWithCards.quiz.id}.json`;
    assert.ok(savedFiles[fileName]);
    const payload = JSON.parse(savedFiles[fileName].content) as QuizDrivePayload;
    assert.equal(payload.quiz.id, quizWithCards.quiz.id);
    assert.equal(payload.mcqCards.length, 1);
    assert.equal(payload.flashcards.length, 1);
    assert.equal(payload.srsCards.length, 2);

    const db = await dbService.getDB();
    const localQuiz = await db.get('quizzes', quizWithCards.quiz.id);
    assert.equal(localQuiz?.isSynced, true);

    await dbService.close();
  });

  it('pushes notebooks to Google Drive and marks as synced', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-push-nb`);
    const nbService = new NotebookService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    const nb = await nbService.create({
      name: 'CS229',
      source: 'google_drive',
      tags: ['machine-learning'],
    });

    await syncService.pushNotebook(nb);
    const fileName = `notebook_${nb.id}.json`;
    assert.ok(savedFiles[fileName]);
    assert.equal(savedFiles[fileName].parentFolderId, 'folder-notebooks-id');

    await dbService.close();
  });

  it('deletes remote note file from Google Drive', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-del-note`);
    const { client, savedFiles, deletedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    savedFiles['note_target-id.json'] = { content: '{}', parentFolderId: 'folder-notes-id' };
    await syncService.deleteRemoteNote('target-id');

    assert.equal(deletedFiles.length, 1);
    assert.equal(deletedFiles[0], 'file-note_target-id.json-id');

    await dbService.close();
  });

  it('pulls remote notes and imports them into local IndexedDB', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-pull-notes`);
    const noteService = new NoteService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    const remoteNote: Note = {
      id: 'remote-note-1',
      notebookId: 'nb-remote',
      title: 'Remote Calculus Note',
      content: 'Derivatives and integrals',
      contentFormat: 'markdown',
      sourceType: 'gdrive_md',
      wordCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: true,
    };
    savedFiles['note_remote-note-1.json'] = { content: JSON.stringify(remoteNote), parentFolderId: 'folder-notes-id' };

    const pulledCount = await syncService.pullNotes();
    assert.equal(pulledCount, 1);

    const saved = await noteService.getById('remote-note-1');
    assert.equal(saved?.title, 'Remote Calculus Note');
    assert.equal(saved?.isSynced, true);

    await dbService.close();
  });

  it('pulls remote quizzes and imports them with cards and SRS states', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-pull-quiz`);
    const quizService = new QuizService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    const remotePayload: QuizDrivePayload = {
      quiz: {
        id: 'remote-quiz-1',
        noteId: 'remote-note-1',
        modelUsed: DEFAULT_AI_MODEL,
        version: 1,
        generatedAt: new Date().toISOString(),
      },
      mcqCards: [{ id: 'mcq-r1', quizId: 'remote-quiz-1', question: 'Remote Question?', options: ['A', 'B', 'C', 'D'], correctIndex: 1, explanation: 'Ans' }],
      flashcards: [{ id: 'fc-r1', quizId: 'remote-quiz-1', front: 'Remote Front', back: 'Remote Back', tags: ['test'] }],
      srsCards: [
        { id: 'srs-r1', cardId: 'mcq-r1', cardType: 'mcq', repetitions: 2, easinessFactor: 2.6, interval: 6, nextReview: new Date().toISOString(), lastReview: null, totalReviews: 2, correctCount: 2 },
      ],
    };
    savedFiles['quiz_remote-quiz-1.json'] = { content: JSON.stringify(remotePayload), parentFolderId: 'folder-quizzes-id' };

    const count = await syncService.pullQuizzes();
    assert.equal(count, 1);

    const loaded = await quizService.getQuizWithCards('remote-quiz-1');
    assert.ok(loaded);
    assert.equal(loaded.quiz.modelUsed, DEFAULT_AI_MODEL);
    assert.equal(loaded.mcqCards.length, 1);
    assert.equal(loaded.flashcards.length, 1);

    await dbService.close();
  });

  it('pulls remote notebooks and saves into IndexedDB', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-pull-nb`);
    const nbService = new NotebookService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    const remoteNb: Notebook = {
      id: 'remote-nb-1',
      name: 'Remote Stanford Course',
      source: 'google_drive',
      tags: ['stanford'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: true,
    };
    savedFiles['notebook_remote-nb-1.json'] = { content: JSON.stringify(remoteNb), parentFolderId: 'folder-notebooks-id' };

    const count = await syncService.pullNotebooks();
    assert.equal(count, 1);

    const loaded = await nbService.getById('remote-nb-1');
    assert.equal(loaded?.name, 'Remote Stanford Course');

    await dbService.close();
  });

  it('replays queue mutations correctly for notes, quizzes, and notebooks', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-replay-entry`);
    const noteService = new NoteService(dbService);
    const nbService = new NotebookService(dbService);
    const { client, savedFiles, deletedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth());

    const note = await noteService.create({
      notebookId: 'nb-1',
      title: 'Replay Note',
      content: 'Content',
      contentFormat: 'markdown',
      sourceType: 'manual',
    });

    const nb = await nbService.create({ name: 'Replay NB', source: 'manual', tags: [] });

    await syncService.replaySyncEntry({
      id: 'e1',
      entityType: 'note',
      entityId: note.id,
      operation: 'create',
      payload: {},
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    });
    assert.ok(savedFiles[`note_${note.id}.json`]);

    await syncService.replaySyncEntry({
      id: 'e2',
      entityType: 'notebook',
      entityId: nb.id,
      operation: 'create',
      payload: {},
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    });
    assert.ok(savedFiles[`notebook_${nb.id}.json`]);

    savedFiles['note_del-id.json'] = { content: '{}', parentFolderId: 'folder-notes-id' };
    await syncService.replaySyncEntry({
      id: 'e3',
      entityType: 'note',
      entityId: 'del-id',
      operation: 'delete',
      payload: {},
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    });
    assert.equal(deletedFiles.includes('file-note_del-id.json-id'), true);

    await dbService.close();
  });

  it('executes full syncAll cycle: pushes unsynced items, replays queue, pulls remote items, and records timestamp', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-sync-all`);
    const noteService = new NoteService(dbService);
    const queueService = new SyncQueueService(dbService);
    const prefsService = new PreferencesService(dbService);
    const { client, savedFiles } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth(), queueService, prefsService);

    // Seed local unsynced note
    await noteService.create({
      notebookId: 'nb-local',
      title: 'Local Unsynced Note',
      content: 'Local text',
      contentFormat: 'markdown',
      sourceType: 'manual',
      isSynced: false,
    });

    // Seed remote note in mock drive
    const remoteNote: Note = {
      id: 'cloud-note-1',
      notebookId: 'nb-cloud',
      title: 'Cloud Note From Laptop',
      content: 'Content from laptop',
      contentFormat: 'markdown',
      sourceType: 'gdrive_md',
      wordCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSynced: true,
    };
    savedFiles['note_cloud-note-1.json'] = { content: JSON.stringify(remoteNote), parentFolderId: 'folder-notes-id' };

    const result = await syncService.syncAll();
    assert.equal(result.success, true);
    assert.equal(result.pushedNotes, 1);
    assert.equal(result.pulledNotes, 1);

    const lastSync = await prefsService.get<string>('lastSyncTimestamp');
    assert.ok(lastSync);

    await dbService.close();
  });

  it('skips syncAll gracefully when unauthenticated', async () => {
    const dbService = new DatabaseService(`${TEST_DB_PREFIX}-sync-unauth`);
    const { client } = createMockDriveClient();
    const syncService = new GoogleDriveSyncService(dbService, client, createMockAuth(false));

    const result = await syncService.syncAll();
    assert.equal(result.success, false);
    assert.equal(result.reason, 'not_authenticated');

    await dbService.close();
  });
});
