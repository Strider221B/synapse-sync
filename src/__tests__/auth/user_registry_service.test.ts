import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserRegistryService } from '../../lib/auth/user_registry_service';
import { STORAGE_KEY_SELECTED_USER } from '../../lib/auth/google_auth_config';

class MockStorage implements Storage {
  private _store: Record<string, string> = {};

  public get length(): number {
    return Object.keys(this._store).length;
  }

  public clear(): void {
    this._store = {};
  }

  public getItem(key: string): string | null {
    return this._store[key] ?? null;
  }

  public key(index: number): string | null {
    return Object.keys(this._store)[index] ?? null;
  }

  public removeItem(key: string): void {
    delete this._store[key];
  }

  public setItem(key: string, value: string): void {
    this._store[key] = value;
  }
}

describe('UserRegistryService', () => {
  it('returns default pre-registered users SC and DB', () => {
    const storage = new MockStorage();
    const service = new UserRegistryService(storage);
    const users = service.getUsers();

    assert.ok(users.length >= 2);
    assert.equal(users[0].id, 'SC');
    assert.equal(users[1].id, 'DB');
  });

  it('retrieves and updates selected user ID in storage', () => {
    const storage = new MockStorage();
    const service = new UserRegistryService(storage);

    assert.equal(service.getSelectedUserId(), 'SC');

    service.setSelectedUserId('DB');
    assert.equal(service.getSelectedUserId(), 'DB');
    assert.equal(storage.getItem(STORAGE_KEY_SELECTED_USER), 'DB');
  });

  it('falls back to SC when stored user ID is invalid', () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY_SELECTED_USER, 'INVALID_USER_XYZ');
    const service = new UserRegistryService(storage);

    assert.equal(service.getSelectedUserId(), 'SC');
  });

  it('resolves client ID for users correctly', () => {
    const storage = new MockStorage();
    const service = new UserRegistryService(storage);

    const scClientId = service.getClientIdForUser('SC');
    const dbClientId = service.getClientIdForUser('DB');

    assert.equal(typeof scClientId, 'string');
    assert.equal(typeof dbClientId, 'string');
  });

  it('returns active user object matching selected user', () => {
    const storage = new MockStorage();
    const service = new UserRegistryService(storage);

    service.setSelectedUserId('DB');
    const active = service.getActiveUser();

    assert.equal(active.id, 'DB');
    assert.equal(active.name, 'DB');
  });
});
