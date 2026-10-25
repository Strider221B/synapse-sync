import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IDBPDatabase } from 'idb';
import { DatabaseService } from '../../lib/db/database_service';
import type { Notebook } from '../../lib/db/models';
import type { SynapseSyncDB } from '../../lib/db/schema';
import { NotebookService } from '../../lib/db/services/notebook_service';

describe('NotebookService', () => {
  const TEST_DB_NAME = 'synapse-notebook-service-test';
  const SOURCE_MANUAL = 'manual';
  const SOURCE_GOOGLE_DRIVE = 'google_drive';
  const NOTEBOOK_NAME_A = 'Biology 101';
  const NOTEBOOK_NAME_B = 'Physics 201';
  const NON_EXISTENT_ID = 'non-existent-notebook-id';

  it('creates and retrieves a notebook with generated timestamps and UUID', async () => {
    const dbService = new DatabaseService(TEST_DB_NAME);
    const service = new NotebookService(dbService);

    const created = await service.create({
      name: NOTEBOOK_NAME_A,
      source: SOURCE_MANUAL,
      tags: ['bio', 'intro'],
      description: 'Intro to biology',
    });

    assert.ok(created.id);
    assert.equal(created.name, NOTEBOOK_NAME_A);
    assert.equal(created.source, SOURCE_MANUAL);
    assert.equal(created.isSynced, false);
    assert.ok(created.createdAt);
    assert.ok(created.updatedAt);

    const fetched = await service.getById(created.id);
    assert.deepEqual(fetched, created);

    await dbService.close();
  });

  it('retrieves all notebooks sorted by updatedAt descending', async () => {
    const dbService = new DatabaseService('synapse-notebook-sort-test');
    const service = new NotebookService(dbService);

    const first = await service.create({
      name: NOTEBOOK_NAME_A,
      source: SOURCE_MANUAL,
      tags: [],
    });
    // slight delay for timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await service.create({
      name: NOTEBOOK_NAME_B,
      source: SOURCE_GOOGLE_DRIVE,
      tags: [],
    });

    const all = await service.getAll();
    assert.equal(all.length, 2);
    assert.equal(all[0].id, second.id);
    assert.equal(all[1].id, first.id);

    await dbService.close();
  });

  it('filters notebooks by source using the index', async () => {
    const dbService = new DatabaseService('synapse-notebook-source-test');
    const service = new NotebookService(dbService);

    await service.create({ name: NOTEBOOK_NAME_A, source: SOURCE_MANUAL, tags: [] });
    await service.create({ name: NOTEBOOK_NAME_B, source: SOURCE_GOOGLE_DRIVE, tags: [] });

    const manualList = await service.getBySource(SOURCE_MANUAL);
    assert.equal(manualList.length, 1);
    assert.equal(manualList[0].name, NOTEBOOK_NAME_A);

    await dbService.close();
  });

  it('updates an existing notebook and advances updatedAt', async () => {
    const dbService = new DatabaseService('synapse-notebook-update-test');
    const service = new NotebookService(dbService);

    const created = await service.create({ name: NOTEBOOK_NAME_A, source: SOURCE_MANUAL, tags: [] });
    const updated = await service.update(created.id, {
      name: 'Biology Advanced',
      isSynced: true,
    });

    assert.equal(updated.name, 'Biology Advanced');
    assert.equal(updated.isSynced, true);
    assert.ok(updated.updatedAt >= created.updatedAt);

    await dbService.close();
  });

  it('throws when updating a non-existent notebook', async () => {
    const dbService = new DatabaseService('synapse-notebook-missing-test');
    const service = new NotebookService(dbService);

    await assert.rejects(
      async () => service.update(NON_EXISTENT_ID, { name: 'Fails' }),
      /Notebook not found/
    );

    await dbService.close();
  });

  it('deletes a notebook successfully', async () => {
    const dbService = new DatabaseService('synapse-notebook-delete-test');
    const service = new NotebookService(dbService);

    const created = await service.create({ name: NOTEBOOK_NAME_A, source: SOURCE_MANUAL, tags: [] });
    await service.delete(created.id);
    const fetched = await service.getById(created.id);
    assert.equal(fetched, undefined);

    await dbService.close();
  });

  it('works with a mocked DatabaseService instance', async () => {
    const mockNotebook: Notebook = {
      id: 'mock-id-1',
      name: 'Mock Notebook',
      source: 'manual',
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isSynced: false,
    };

    const mockDB = {
      get: async () => mockNotebook,
      delete: async () => undefined,
    } as unknown as IDBPDatabase<SynapseSyncDB>;

    const mockDbService = {
      getDB: async () => mockDB,
    } as unknown as DatabaseService;

    const service = new NotebookService(mockDbService);
    const result = await service.getById('mock-id-1');
    assert.equal(result?.name, 'Mock Notebook');
  });

  it('creates sub-folders and retrieves them using getByParent', async () => {
    const dbService = new DatabaseService('synapse-notebook-parent-test');
    const service = new NotebookService(dbService);

    const rootFolder = await service.create({
      name: 'Computer Science',
      source: 'manual',
      tags: [],
    });

    const subFolder = await service.create({
      name: 'Algorithms',
      parentId: rootFolder.id,
      source: 'manual',
      tags: [],
    });

    assert.equal(subFolder.parentId, rootFolder.id);

    const rootChildren = await service.getByParent(rootFolder.id);
    assert.equal(rootChildren.length, 1);
    assert.equal(rootChildren[0].id, subFolder.id);

    const topLevel = await service.getByParent(null);
    assert.ok(topLevel.some((f) => f.id === rootFolder.id));
    assert.ok(!topLevel.some((f) => f.id === subFolder.id));

    await dbService.close();
  });

  it('computes hierarchical folder path using getFolderPath', async () => {
    const dbService = new DatabaseService('synapse-notebook-path-test');
    const service = new NotebookService(dbService);

    const grandParent = await service.create({
      name: 'Level 1',
      source: 'manual',
      tags: [],
    });

    const parent = await service.create({
      name: 'Level 2',
      parentId: grandParent.id,
      source: 'manual',
      tags: [],
    });

    const child = await service.create({
      name: 'Level 3',
      parentId: parent.id,
      source: 'manual',
      tags: [],
    });

    const path = await service.getFolderPath(child.id);
    assert.equal(path.length, 3);
    assert.equal(path[0].name, 'Level 1');
    assert.equal(path[1].name, 'Level 2');
    assert.equal(path[2].name, 'Level 3');

    await dbService.close();
  });
});
