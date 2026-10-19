import { v4 as uuidv4 } from 'uuid';
import { DB_INDEXES, DB_STORES } from '../constants';
import type { DatabaseService } from '../database_service';
import type { Notebook } from '../models';

export type CreateNotebookInput = Omit<Notebook, 'id' | 'createdAt' | 'updatedAt' | 'isSynced'> & {
  isSynced?: boolean;
};

export type UpdateNotebookInput = Partial<Omit<Notebook, 'id' | 'createdAt'>>;

/**
 * Service providing CRUD operations for Notebook entities.
 */
export class NotebookService {
  private static readonly _ERROR_NOTEBOOK_NOT_FOUND = 'Notebook not found';

  private readonly _databaseService: DatabaseService;

  public constructor(databaseService: DatabaseService) {
    this._databaseService = databaseService;
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
   * Deletes a notebook by its unique identifier.
   */
  public async delete(id: string): Promise<void> {
    const db = await this._databaseService.getDB();
    await db.delete(DB_STORES.NOTEBOOKS, id);
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
   * Retrieves notebooks matching a specific source.
   */
  public async getBySource(source: Notebook['source']): Promise<Notebook[]> {
    const db = await this._databaseService.getDB();
    return db.getAllFromIndex(DB_STORES.NOTEBOOKS, DB_INDEXES.BY_SOURCE, source);
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
}
