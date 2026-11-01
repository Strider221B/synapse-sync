import { v4 as uuidv4 } from 'uuid';
import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { Notebook } from '../models';
import type { SyncQueueService } from './sync_queue_service';

export type CreateNotebookInput = Omit<Notebook, 'id' | 'createdAt' | 'updatedAt' | 'isSynced'> & {
  isSynced?: boolean;
};

export type UpdateNotebookInput = Partial<Omit<Notebook, 'id' | 'createdAt'>>;

export interface FolderDeleteStatus {
  canDelete: boolean;
  reason?: string;
  noteCount: number;
  subfolderCount: number;
}

/**
 * Service providing CRUD, movement, and hierarchy operations for Notebook entities.
 */
export class NotebookService {
  private static readonly _ERROR_NOTEBOOK_NOT_FOUND = 'Notebook not found';
  private static readonly _ERROR_CANNOT_MOVE_TO_SELF = 'Cannot move a folder into itself';
  private static readonly _ERROR_CANNOT_MOVE_TO_DESCENDANT = 'Cannot move a folder into one of its sub-folders';
  private static readonly _ERROR_CANNOT_DELETE_NON_EMPTY = 'Cannot delete a folder that contains notes or sub-folders';
  private static readonly _ENTITY_TYPE = 'notebook';
  private static readonly _OP_DELETE = 'delete';

  private readonly _databaseService: DatabaseService;
  private readonly _syncQueueService?: SyncQueueService;

  public constructor(databaseService: DatabaseService, syncQueueService?: SyncQueueService) {
    this._databaseService = databaseService;
    this._syncQueueService = syncQueueService;
  }

  /**
   * Checks whether a folder is empty and eligible to be deleted.
   */
  public async canDelete(id: string): Promise<FolderDeleteStatus> {
    const db = await this._databaseService.getDB();
    const existing = await db.get(DB_STORES.NOTEBOOKS, id);
    if (!existing) {
      return { canDelete: true, noteCount: 0, subfolderCount: 0 };
    }
    const notes = await db.getAllFromIndex(DB_STORES.NOTES, DB_INDEXES.BY_NOTEBOOK, id);
    const subfolders = await this.getByParent(id);
    const noteCount = notes.length;
    const subfolderCount = subfolders.length;

    if (noteCount > 0 || subfolderCount > 0) {
      const reason = `${NotebookService._ERROR_CANNOT_DELETE_NON_EMPTY} (${noteCount} note${noteCount === 1 ? '' : 's'}, ${subfolderCount} sub-folder${subfolderCount === 1 ? '' : 's'})`;
      return { canDelete: false, reason, noteCount, subfolderCount };
    }

    return { canDelete: true, noteCount: 0, subfolderCount: 0 };
  }

  /**
   * Creates a new notebook entity with generated UUID and timestamps.
   */
  public async create(input: CreateNotebookInput): Promise<Notebook> {
    const db = await this._databaseService.getDB();
    const timestamp = new Date().toISOString();
    const notebook: Notebook = {
      id: uuidv4(),
      name: input.name,
      parentId: input.parentId ?? null,
      source: input.source,
      sourceUrl: input.sourceUrl,
      description: input.description,
      tags: [...input.tags],
      createdAt: timestamp,
      updatedAt: timestamp,
      isSynced: input.isSynced ?? false,
    };

    await db.put(DB_STORES.NOTEBOOKS, notebook);
    return notebook;
  }

  /**
   * Deletes a notebook if empty, and enqueues a sync deletion when configured.
   */
  public async delete(id: string): Promise<void> {
    const status = await this.canDelete(id);
    if (!status.canDelete) {
      throw new Error(status.reason ?? NotebookService._ERROR_CANNOT_DELETE_NON_EMPTY);
    }
    const db = await this._databaseService.getDB();
    await db.delete(DB_STORES.NOTEBOOKS, id);
    if (this._syncQueueService) {
      await this._syncQueueService.enqueue(
        NotebookService._ENTITY_TYPE,
        id,
        NotebookService._OP_DELETE,
        { id }
      );
    }
  }

  /**
   * Retrieves all notebooks, sorted by updatedAt descending.
   */
  public async getAll(): Promise<Notebook[]> {
    const db = await this._databaseService.getDB();
    const notebooks = await db.getAll(DB_STORES.NOTEBOOKS);
    return notebooks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Retrieves a single notebook by its identifier.
   */
  public async getById(id: string): Promise<Notebook | undefined> {
    const db = await this._databaseService.getDB();
    return db.get(DB_STORES.NOTEBOOKS, id);
  }

  /**
   * Retrieves notebooks/folders with a specific parent folder ID.
   */
  public async getByParent(parentId: string | null): Promise<Notebook[]> {
    const all = await this.getAll();
    return all.filter((item) => (item.parentId ?? null) === (parentId ?? null));
  }

  /**
   * Retrieves notebooks matching a specific source.
   */
  public async getBySource(source: Notebook['source']): Promise<Notebook[]> {
    const db = await this._databaseService.getDB();
    return db.getAllFromIndex(DB_STORES.NOTEBOOKS, DB_INDEXES.BY_SOURCE, source);
  }

  /**
   * Retrieves all recursive descendant IDs for a given notebook ID.
   */
  public async getDescendantIds(id: string): Promise<string[]> {
    const all = await this.getAll();
    const descendants = NotebookService.getDescendantIdsFromList(id, all);
    return Array.from(descendants);
  }

  /**
   * Computes the breadcrumb path of folders from root down to the target notebook.
   */
  public async getFolderPath(notebookId: string): Promise<Notebook[]> {
    const all = await this.getAll();
    const map = new Map<string, Notebook>(all.map((item) => [item.id, item]));
    const path: Notebook[] = [];
    let current = map.get(notebookId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? map.get(current.parentId) : undefined;
    }
    return path;
  }

  /**
   * Moves a folder under a new parent folder or to root, preventing circular hierarchies.
   */
  public async move(id: string, targetParentId: string | null): Promise<Notebook> {
    if (targetParentId === id) {
      throw new Error(NotebookService._ERROR_CANNOT_MOVE_TO_SELF);
    }
    if (targetParentId) {
      const descendants = await this.getDescendantIds(id);
      if (descendants.includes(targetParentId)) {
        throw new Error(NotebookService._ERROR_CANNOT_MOVE_TO_DESCENDANT);
      }
    }
    return this.update(id, { parentId: targetParentId });
  }

  /**
   * Updates existing notebook fields and advances updatedAt timestamp.
   */
  public async update(id: string, input: UpdateNotebookInput): Promise<Notebook> {
    const db = await this._databaseService.getDB();
    const existing = await db.get(DB_STORES.NOTEBOOKS, id);
    if (!existing) {
      throw new Error(`${NotebookService._ERROR_NOTEBOOK_NOT_FOUND}: ${id}`);
    }

    const updated: Notebook = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    await db.put(DB_STORES.NOTEBOOKS, updated);
    return updated;
  }

  /**
   * Synchronously calculates all recursive descendant IDs for a notebook from an in-memory list.
   */
  public static getDescendantIdsFromList(id: string, allNotebooks: Notebook[]): Set<string> {
    const childrenMap = new Map<string, string[]>();
    for (const nb of allNotebooks) {
      if (nb.parentId) {
        const list = childrenMap.get(nb.parentId) ?? [];
        list.push(nb.id);
        childrenMap.set(nb.parentId, list);
      }
    }

    const descendants = new Set<string>();
    const queue: string[] = [...(childrenMap.get(id) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      descendants.add(current);
      const nextChildren = childrenMap.get(current);
      if (nextChildren) {
        queue.push(...nextChildren);
      }
    }
    return descendants;
  }
}
