import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from '../../lib/auth/auth_service';
import {
  STORAGE_KEY_EXPIRY,
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USER,
} from '../../lib/auth/google_auth_config';

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

describe('AuthService (Google Drive)', () => {
  const MOCK_TOKEN = 'mock-google-token-456';
  const MOCK_PROFILE = { name: 'Ada Lovelace', email: 'ada@example.com' };

  const createMockFetch = (profile = MOCK_PROFILE) => {
    return async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('userinfo')) {
        return new Response(JSON.stringify(profile), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('revoke')) {
        return new Response('', { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    };
  };

  it('initializes without error and loads stored user', async () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY_TOKEN, MOCK_TOKEN);
    storage.setItem(STORAGE_KEY_USER, JSON.stringify({ displayName: 'Grace Hopper', email: 'grace@navy.mil' }));
    storage.setItem(STORAGE_KEY_EXPIRY, String(Date.now() + 3600000));

    const service = new AuthService(storage, createMockFetch() as typeof fetch);
    await service.initialize();

    assert.equal(service.isAuthenticated(), true);
    assert.deepEqual(service.getUserInfo(), { displayName: 'Grace Hopper', email: 'grace@navy.mil' });
  });

  it('performs login via popupOpener and stores profile and token', async () => {
    const storage = new MockStorage();
    const mockPopupOpener = async (authUrl: string) => {
      assert.ok(authUrl.includes('accounts.google.com/o/oauth2/v2/auth'));
      return MOCK_TOKEN;
    };

    const service = new AuthService(storage, createMockFetch() as typeof fetch, undefined, mockPopupOpener);
    await service.initialize();

    const user = await service.login();
    assert.equal(user.displayName, 'Ada Lovelace');
    assert.equal(user.email, 'ada@example.com');
    assert.equal(service.isAuthenticated(), true);

    const token = await service.getAccessToken();
    assert.equal(token, MOCK_TOKEN);
    assert.equal(storage.getItem(STORAGE_KEY_TOKEN), MOCK_TOKEN);
  });

  it('allows logging in with a direct token', async () => {
    const storage = new MockStorage();
    const service = new AuthService(storage, createMockFetch() as typeof fetch);

    const user = await service.loginWithToken('direct-token-789', 1800);
    assert.equal(user.displayName, 'Ada Lovelace');
    assert.equal(await service.getAccessToken(), 'direct-token-789');
  });

  it('performs logout and clears stored credentials', async () => {
    const storage = new MockStorage();
    let revokeCalled = false;
    const mockFetch = async (url: string | URL | Request) => {
      if (url.toString().includes('revoke')) {
        revokeCalled = true;
        return new Response('', { status: 200 });
      }
      return createMockFetch()(url);
    };

    const service = new AuthService(storage, mockFetch as typeof fetch);
    await service.loginWithToken(MOCK_TOKEN);
    assert.equal(service.isAuthenticated(), true);

    await service.logout();
    assert.equal(service.isAuthenticated(), false);
    assert.equal(service.getUserInfo(), null);
    assert.equal(storage.getItem(STORAGE_KEY_TOKEN), null);
    assert.equal(revokeCalled, true);
  });

  it('throws error when getAccessToken is called without an account', async () => {
    const storage = new MockStorage();
    const service = new AuthService(storage, createMockFetch() as typeof fetch);

    await assert.rejects(async () => service.getAccessToken(), /No active account found/);
  });

  it('throws session expired error and logs out when token has expired', async () => {
    const storage = new MockStorage();
    storage.setItem(STORAGE_KEY_TOKEN, 'expired-token');
    storage.setItem(STORAGE_KEY_EXPIRY, String(Date.now() - 5000));

    const service = new AuthService(storage, createMockFetch() as typeof fetch);
    assert.equal(service.isAuthenticated(), false);

    await assert.rejects(
      async () => service.getAccessToken(),
      /Google authentication session expired/
    );
    assert.equal(storage.getItem(STORAGE_KEY_TOKEN), null);
  });

  it('handles user profile fetch error on login', async () => {
    const storage = new MockStorage();
    const errorFetch = async () => new Response('Unauthorized', { status: 401 });
    const service = new AuthService(storage, errorFetch as typeof fetch);

    await assert.rejects(
      async () => service.loginWithToken('invalid-token'),
      /Failed to fetch Google user profile/
    );
  });

  it('normalizes schemeless and trailing-slash redirect URIs', async () => {
    const storage = new MockStorage();
    const service = new AuthService(storage, createMockFetch() as typeof fetch, {
      clientId: 'test-client',
      redirectUri: 'synapse-sync-sc.vercel.app/',
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    assert.equal(service.getRedirectUri(), 'https://synapse-sync-sc.vercel.app');
  });

  it('normalizes localhost schemeless redirect URIs with http prefix', async () => {
    const storage = new MockStorage();
    const service = new AuthService(storage, createMockFetch() as typeof fetch, {
      clientId: 'test-client',
      redirectUri: 'localhost:3000/',
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    assert.equal(service.getRedirectUri(), 'http://localhost:3000');
  });

  it('updates and normalizes redirectUri via updateConfig', async () => {
    const storage = new MockStorage();
    const service = new AuthService(storage, createMockFetch() as typeof fetch);
    service.updateConfig({ redirectUri: 'my-custom-domain.vercel.app' });

    assert.equal(service.getRedirectUri(), 'https://my-custom-domain.vercel.app');
  });
});

