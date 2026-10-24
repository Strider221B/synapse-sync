import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { ChatMessage } from '../models';
import type { GoogleDriveApiClient } from '../../api/google_drive_client';

/**
 * Service managing synchronization of note-scoped chat histories with Google Drive.
 */
export class ChatSyncService {
  private static readonly _APP_FOLDER_NAME = 'SynapseSync';
  private static readonly _CHATS_FOLDER_NAME = 'chats';
  private static readonly _JSON_MIME = 'application/json';
  private static readonly _JSON_EXT = '.json';
  private static readonly _PREFIX_CHAT = 'chat_';

  private readonly _databaseService: DatabaseService;
  private readonly _gdriveClient: GoogleDriveApiClient;
  private _appFolderId: string | null = null;
  private _chatsFolderId: string | null = null;

  public constructor(
    databaseService: DatabaseService,
    googleDriveClient: GoogleDriveApiClient
  ) {
    this._databaseService = databaseService;
    this._gdriveClient = googleDriveClient;
  }

  /**
   * Pushes all chat messages associated with a note to its dedicated file on Google Drive.
   */
  public async pushChat(noteId: string): Promise<void> {
    const folderId = await this._getChatsFolderId();
    const db = await this._databaseService.getDB();
    const messages = await db.getAllFromIndex(
      DB_STORES.CHAT_MESSAGES,
      DB_INDEXES.BY_NOTE,
      noteId
    );
    if (!messages || messages.length === 0) {
      await this.deleteRemoteChat(noteId);
      return;
    }
    const fileName = `${ChatSyncService._PREFIX_CHAT}${noteId}${ChatSyncService._JSON_EXT}`;
    const payload = JSON.stringify(messages, null, 2);
    await this._gdriveClient.saveFile(fileName, payload, ChatSyncService._JSON_MIME, folderId);
  }

  /**
   * Removes a chat history file from Google Drive when chat is cleared or note is deleted.
   */
  public async deleteRemoteChat(noteId: string): Promise<void> {
    const folderId = await this._getChatsFolderId();
    const fileName = `${ChatSyncService._PREFIX_CHAT}${noteId}${ChatSyncService._JSON_EXT}`;
    const file = await this._gdriveClient.findFileByName(fileName, folderId);
    if (file) {
      await this._gdriveClient.deleteFile(file.id);
    }
  }

  /**
   * Pulls all note chat histories from Google Drive into local IndexedDB.
   */
  public async pullChats(): Promise<number> {
    const folderId = await this._getChatsFolderId();
    const files = await this._gdriveClient.listAllFolderItems(folderId);
    const db = await this._databaseService.getDB();
    let count = 0;

    for (const file of files) {
      if (!this._isChatFileName(file.name)) continue;
      const text = await this._gdriveClient.getFileText(file.id);
      const messages = JSON.parse(text) as ChatMessage[];
      if (Array.isArray(messages)) {
        await this._storePulledMessages(messages, db);
        count += 1;
      }
    }
    return count;
  }

  /**
   * Pushes all local chat histories grouped by note to Google Drive.
   */
  public async pushAllChats(): Promise<number> {
    const db = await this._databaseService.getDB();
    const allMessages = await db.getAll(DB_STORES.CHAT_MESSAGES);
    const noteIds = new Set(allMessages.map((m) => m.noteId));
    for (const noteId of noteIds) {
      await this.pushChat(noteId);
    }
    return noteIds.size;
  }

  /**
   * Stores an array of pulled chat messages in IndexedDB inside a transaction.
   */
  protected async _storePulledMessages(
    messages: ChatMessage[],
    db: Awaited<ReturnType<DatabaseService['getDB']>>
  ): Promise<void> {
    const tx = db.transaction(DB_STORES.CHAT_MESSAGES, 'readwrite');
    for (const msg of messages) {
      await tx.store.put(msg);
    }
    await tx.done;
  }

  private async _getChatsFolderId(): Promise<string> {
    if (!this._chatsFolderId) {
      const appFolder = await this._getAppFolderId();
      const folder = await this._gdriveClient.getOrCreateFolder(
        ChatSyncService._CHATS_FOLDER_NAME,
        appFolder
      );
      this._chatsFolderId = folder.id;
    }
    return this._chatsFolderId;
  }

  private async _getAppFolderId(): Promise<string> {
    if (!this._appFolderId) {
      const folder = await this._gdriveClient.getOrCreateFolder(ChatSyncService._APP_FOLDER_NAME);
      this._appFolderId = folder.id;
    }
    return this._appFolderId;
  }

  private _isChatFileName(name: string): boolean {
    return (
      name.startsWith(ChatSyncService._PREFIX_CHAT) &&
      name.endsWith(ChatSyncService._JSON_EXT)
    );
  }
}
