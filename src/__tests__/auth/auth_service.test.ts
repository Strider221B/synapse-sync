import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  AccountInfo,
  AuthenticationResult,
  IPublicClientApplication,
} from '@azure/msal-browser';
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { AuthService } from '../../lib/auth/auth_service';

describe('AuthService', () => {
  const createMockAccount = (name = 'Test User', username = 'test@example.com'): AccountInfo => ({
    homeAccountId: 'home-123',
    environment: 'login.windows.net',
    tenantId: 'tenant-123',
    username,
    name,
    localAccountId: 'local-123',
  });

  const createMockClient = (overrides: Partial<IPublicClientApplication> = {}): IPublicClientApplication => {
    let currentAccount: AccountInfo | null = null;
    const client: Partial<IPublicClientApplication> = {
      initialize: async () => {},
      loginPopup: async () =>
        ({
          accessToken: 'mock-token-123',
          account: createMockAccount(),
        }) as AuthenticationResult,
      logoutPopup: async () => {},
      acquireTokenSilent: async () =>
        ({
          accessToken: 'silent-token-123',
        }) as AuthenticationResult,
      acquireTokenPopup: async () =>
        ({
          accessToken: 'popup-token-123',
        }) as AuthenticationResult,
      getActiveAccount: () => currentAccount,
      setActiveAccount: (account: AccountInfo | null) => {
        currentAccount = account;
      },
      getAllAccounts: () => (currentAccount ? [currentAccount] : []),
      ...overrides,
    };
    return client as IPublicClientApplication;
  };

  it('initializes client and syncs active account when available', async () => {
    const existing = createMockAccount();
    let syncedAccount: AccountInfo | null = null;
    const mock = createMockClient({
      getAllAccounts: () => [existing],
      setActiveAccount: (acc) => {
        syncedAccount = acc;
      },
    });

    const service = new AuthService(mock);
    await service.initialize();

    assert.equal(service.getClient(), mock);
    assert.deepEqual(syncedAccount, existing);
  });

  it('throws error when calling methods before initialization', async () => {
    const mock = createMockClient();
    const service = new AuthService(mock);

    await assert.rejects(async () => service.login(), /AuthService has not been initialized/);
    await assert.rejects(async () => service.logout(), /AuthService has not been initialized/);
    await assert.rejects(async () => service.getAccessToken(), /AuthService has not been initialized/);
  });

  it('performs login and updates active account', async () => {
    const mock = createMockClient();
    const service = new AuthService(mock);
    await service.initialize();

    const result = await service.login();
    assert.equal(result.accessToken, 'mock-token-123');
    assert.equal(service.isAuthenticated(), true);

    const userInfo = service.getUserInfo();
    assert.ok(userInfo);
    assert.equal(userInfo.displayName, 'Test User');
    assert.equal(userInfo.email, 'test@example.com');
  });

  it('performs logout and clears active account state', async () => {
    const mock = createMockClient();
    const service = new AuthService(mock);
    await service.initialize();
    await service.login();

    await service.logout();
    mock.setActiveAccount(null);
    assert.equal(service.isAuthenticated(), false);
    assert.equal(service.getUserInfo(), null);
  });

  it('acquires token silently when account exists', async () => {
    const mock = createMockClient();
    const service = new AuthService(mock);
    await service.initialize();
    await service.login();

    const token = await service.getAccessToken();
    assert.equal(token, 'silent-token-123');
  });

  it('falls back to popup token acquisition when silent fails with interaction required', async () => {
    const mock = createMockClient({
      acquireTokenSilent: async () => {
        throw new InteractionRequiredAuthError('interaction_required', 'corr-123');
      },
    });
    const service = new AuthService(mock);
    await service.initialize();
    await service.login();

    const token = await service.getAccessToken();
    assert.equal(token, 'popup-token-123');
  });

  it('throws when getAccessToken is called with no active account', async () => {
    const mock = createMockClient();
    const service = new AuthService(mock);
    await service.initialize();

    await assert.rejects(async () => service.getAccessToken(), /No active account found/);
  });
});
