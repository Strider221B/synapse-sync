import { v4 as uuidv4 } from 'uuid';
import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { ChatMessage } from '../models';

/**
 * Service managing chat conversation messages associated with study notes.
 */
export class ChatMessageService {
  private readonly _databaseService: DatabaseService;

  public constructor(databaseService: DatabaseService) {
    this._databaseService = databaseService;
  }

  /**
   * Appends a new chat message for a note.
   */
  public async create(
    noteId: string,
    role: ChatMessage['role'],
    content: string
  ): Promise<ChatMessage> {
    const db = await this._databaseService.getDB();
    const message: ChatMessage = {
      id: uuidv4(),
      noteId,
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    await db.put(DB_STORES.CHAT_MESSAGES, message);
    return message;
  }

  /**
   * Deletes all chat messages for a specific note.
   */
  public async deleteByNote(noteId: string): Promise<void> {
    const db = await this._databaseService.getDB();
    const messages = await db.getAllFromIndex(
      DB_STORES.CHAT_MESSAGES,
      DB_INDEXES.BY_NOTE,
      noteId
    );

    const tx = db.transaction(DB_STORES.CHAT_MESSAGES, 'readwrite');
    for (const msg of messages) {
      await tx.store.delete(msg.id);
    }
    await tx.done;
  }

  /**
   * Retrieves all chat messages for a note, ordered chronologically by timestamp.
   */
  public async getByNote(noteId: string): Promise<ChatMessage[]> {
    const db = await this._databaseService.getDB();
    const messages = await db.getAllFromIndex(
      DB_STORES.CHAT_MESSAGES,
      DB_INDEXES.BY_NOTE,
      noteId
    );
    return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
