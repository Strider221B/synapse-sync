import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import type { GoogleDriveApiClient } from '@/lib/api/google_drive_client';
import { DB_STORES } from '@/lib/db/constants';
import { DatabaseService } from '@/lib/db/database_service';
import type { ChatMessage } from '@/lib/db/models';
import { ChatSyncService } from '@/lib/db/services/chat_sync_service';

describe('ChatSyncService Test Suite', () => {
  const createMockDriveClient = () => {
    const savedFiles: Record<string, string> = {};
    const deletedFiles: string[] = [];

    const client = {
      getOrCreateFolder: async (name: string) => ({ id: `folder-${name}`, name }),
      findFileByName: async (name: string) => {
        if (savedFiles[name]) {
          return { id: `file-${name}`, name };
        }
        return null;
      },
      saveFile: async (name: string, content: string) => {
        savedFiles[name] = content;
        return { id: `file-${name}`, name };
      },
      deleteFile: async (id: string) => {
        deletedFiles.push(id);
      },
      listAllFolderItems: async () => {
        return Object.keys(savedFiles).map((name) => ({
          id: `file-${name}`,
          name,
        }));
      },
      getFileText: async (id: string) => {
        const name = id.replace('file-', '');
        return savedFiles[name] ?? '[]';
      },
    } as unknown as GoogleDriveApiClient;

    return { client, savedFiles, deletedFiles };
  };

  it('pushes note chat messages to dedicated file SynapseSync/chats/chat_<noteId>.json', async () => {
    const dbService = new DatabaseService('test-chat-sync-push');
    const { client, savedFiles } = createMockDriveClient();
    const service = new ChatSyncService(dbService, client);

    const db = await dbService.getDB();
    const message: ChatMessage = {
      id: 'msg-1',
      noteId: 'note-100',
      role: 'user',
      content: 'What is backpropagation?',
      timestamp: new Date().toISOString(),
    };
    await db.put(DB_STORES.CHAT_MESSAGES, message);

    await service.pushChat('note-100');

    assert.ok(savedFiles['chat_note-100.json'], 'Chat file should be created in Google Drive');
    const parsed = JSON.parse(savedFiles['chat_note-100.json']) as ChatMessage[];
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].content, 'What is backpropagation?');

    await dbService.close();
  });

  it('deletes remote chat file when no messages exist locally for note', async () => {
    const dbService = new DatabaseService('test-chat-sync-empty-delete');
    const { client, savedFiles, deletedFiles } = createMockDriveClient();
    savedFiles['chat_note-200.json'] = JSON.stringify([]);
    const service = new ChatSyncService(dbService, client);

    await service.pushChat('note-200');

    assert.ok(deletedFiles.includes('file-chat_note-200.json'));
    await dbService.close();
  });

  it('pulls remote chat files into local IndexedDB object store', async () => {
    const dbService = new DatabaseService('test-chat-sync-pull');
    const { client, savedFiles } = createMockDriveClient();
    const remoteMessages: ChatMessage[] = [
      {
        id: 'msg-remote-1',
        noteId: 'note-300',
        role: 'assistant',
        content: 'Backpropagation computes the gradient of the loss function.',
        timestamp: '2026-10-24T05:00:00.000Z',
      },
    ];
    savedFiles['chat_note-300.json'] = JSON.stringify(remoteMessages);
    savedFiles['other_document.pdf'] = 'binary';

    const service = new ChatSyncService(dbService, client);
    const count = await service.pullChats();

    assert.equal(count, 1, 'Should pull 1 chat file');
    const db = await dbService.getDB();
    const stored = await db.get(DB_STORES.CHAT_MESSAGES, 'msg-remote-1');
    assert.ok(stored, 'Pulled message should be in IndexedDB');
    assert.equal(stored?.content, 'Backpropagation computes the gradient of the loss function.');

    await dbService.close();
  });

  it('pushes all local chats grouped by note in pushAllChats', async () => {
    const dbService = new DatabaseService('test-chat-sync-push-all');
    const { client, savedFiles } = createMockDriveClient();
    const service = new ChatSyncService(dbService, client);

    const db = await dbService.getDB();
    await db.put(DB_STORES.CHAT_MESSAGES, {
      id: 'msg-a',
      noteId: 'note-A',
      role: 'user',
      content: 'Question A',
      timestamp: new Date().toISOString(),
    });
    await db.put(DB_STORES.CHAT_MESSAGES, {
      id: 'msg-b',
      noteId: 'note-B',
      role: 'user',
      content: 'Question B',
      timestamp: new Date().toISOString(),
    });

    const count = await service.pushAllChats();
    assert.equal(count, 2, 'Should push chats for both distinct notes');
    assert.ok(savedFiles['chat_note-A.json']);
    assert.ok(savedFiles['chat_note-B.json']);

    await dbService.close();
  });
});
