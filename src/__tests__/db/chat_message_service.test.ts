import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDBPDatabase } from 'idb';
import { DatabaseService } from '../../lib/db/database_service';
import type { ChatMessage } from '../../lib/db/models';
import type { SynapseSyncDB } from '../../lib/db/schema';
import { ChatMessageService } from '../../lib/db/services/chat_message_service';

describe('ChatMessageService', () => {
  const TEST_DB_NAME = 'synapse-chat-service-test';
  const NOTE_ID_A = 'chat-note-1';
  const NOTE_ID_B = 'chat-note-2';
  const CONTENT_USER = 'Can you explain the citric acid cycle?';
  const CONTENT_ASSISTANT = 'The citric acid cycle produces energy through NADH and FADH2.';

  it('creates and retrieves messages for a note ordered chronologically', async () => {
    const dbService = new DatabaseService(TEST_DB_NAME);
    const service = new ChatMessageService(dbService);

    const msg1 = await service.create(NOTE_ID_A, 'user', CONTENT_USER);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const msg2 = await service.create(NOTE_ID_A, 'assistant', CONTENT_ASSISTANT);

    assert.ok(msg1.id);
    assert.equal(msg1.noteId, NOTE_ID_A);
    assert.equal(msg1.role, 'user');
    assert.ok(msg2.timestamp >= msg1.timestamp);

    const history = await service.getByNote(NOTE_ID_A);
    assert.equal(history.length, 2);
    assert.equal(history[0].id, msg1.id);
    assert.equal(history[1].id, msg2.id);

    await dbService.close();
  });

  it('deletes messages only for the specified note', async () => {
    const dbService = new DatabaseService('synapse-chat-delete-test');
    const service = new ChatMessageService(dbService);

    await service.create(NOTE_ID_A, 'user', 'Note A message');
    await service.create(NOTE_ID_B, 'user', 'Note B message');

    await service.deleteByNote(NOTE_ID_A);

    const noteAMessages = await service.getByNote(NOTE_ID_A);
    const noteBMessages = await service.getByNote(NOTE_ID_B);

    assert.equal(noteAMessages.length, 0);
    assert.equal(noteBMessages.length, 1);

    await dbService.close();
  });

  it('works with a mocked DatabaseService instance', async () => {
    const mockMessage: ChatMessage = {
      id: 'mock-msg-1',
      noteId: 'mock-note-1',
      role: 'user',
      content: 'Hello',
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    const mockDB = {
      getAllFromIndex: async () => [mockMessage],
    } as unknown as IDBPDatabase<SynapseSyncDB>;

    const mockDbService = {
      getDB: async () => mockDB,
    } as unknown as DatabaseService;

    const service = new ChatMessageService(mockDbService);
    const messages = await service.getByNote('mock-note-1');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content, 'Hello');
  });
});
