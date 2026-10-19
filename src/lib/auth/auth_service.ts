import {
  type AccountInfo,
  type AuthenticationResult,
  type Configuration,
  type IPublicClientApplication,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser';
import { MSAL_SCOPES, msalConfig } from './msal_config';

export interface UserInfo {
  displayName: string;
  email: string;
}

/**
 * Service managing Microsoft authentication lifecycle with MSAL.js and PKCE.
 */
export class AuthService {
  private static readonly _ERROR_NOT_INITIALIZED = 'AuthService has not been initialized';
  private static readonly _ERROR_NO_ACCOUNT = 'No active account found. User must log in';
  private static readonly _EMPTY_STRING = '';

  private _client: IPublicClientApplication | null = null;
  private _isInitialized = false;
  private readonly _config: Configuration;

  public constructor(customClient?: IPublicClientApplication, customConfig?: Configuration) {
    this._config = customConfig ?? msalConfig;
    if (customClient) {
      this._client = customClient;
    }
  }

  /**
   * Initializes the MSAL PublicClientApplication if not already initialized.
   */
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }
    if (!this._client) {
      this._client = new PublicClientApplication(this._config);
    }
    await this._client.initialize();
    this._isInitialized = true;
    this._syncActiveAccount();
  }

  /**
   * Triggers the MSAL login popup flow using PKCE and sets the active account.
   */
  public async login(): Promise<AuthenticationResult> {
    const client = this._ensureInitialized();
    const result = await client.loginPopup({
      scopes: [...MSAL_SCOPES],
    });
    if (result.account) {
      client.setActiveAccount(result.account);
    }
    return result;
  }

  /**
   * Logs out the user by terminating the active session.
   */
  public async logout(): Promise<void> {
    const client = this._ensureInitialized();
    const account = client.getActiveAccount() ?? undefined;
    await client.logoutPopup({ account });
  }

  /**
   * Acquires an access token silently, falling back to popup if interaction is required.
   */
  public async getAccessToken(): Promise<string> {
    const client = this._ensureInitialized();
    const account = client.getActiveAccount();
    if (!account) {
      throw new Error(AuthService._ERROR_NO_ACCOUNT);
    }
    return this._acquireTokenWithFallback(client, account);
  }

  /**
   * Checks whether a user account is currently authenticated.
   */
  public isAuthenticated(): boolean {
    if (!this._client) {
      return false;
    }
    return this._client.getActiveAccount() !== null;
  }

  /**
   * Returns basic profile information for the active user.
   */
  public getUserInfo(): UserInfo | null {
    if (!this._client) {
      return null;
    }
    const account = this._client.getActiveAccount();
    if (!account) {
      return null;
    }
    return {
      displayName: account.name ?? AuthService._EMPTY_STRING,
      email: account.username ?? AuthService._EMPTY_STRING,
    };
  }

  /**
   * Returns the underlying MSAL client application.
   */
  public getClient(): IPublicClientApplication {
    return this._ensureInitialized();
  }

  /**
   * Validates and returns the initialized client instance.
   */
  protected _ensureInitialized(): IPublicClientApplication {
    if (!this._client || !this._isInitialized) {
      throw new Error(AuthService._ERROR_NOT_INITIALIZED);
    }
    return this._client;
  }

  /**
   * Synchronizes the active account from all accounts if active account is not set.
   */
  protected _syncActiveAccount(): void {
    if (!this._client) {
      return;
    }
    const active = this._client.getActiveAccount();
    if (!active) {
      const all = this._client.getAllAccounts();
      if (all.length > 0) {
        this._client.setActiveAccount(all[0]);
      }
    }
  }

  /**
   * Attempts silent token acquisition with fallback to popup flow.
   */
  protected async _acquireTokenWithFallback(
    client: IPublicClientApplication,
    account: AccountInfo
  ): Promise<string> {
    try {
      const silentResponse = await client.acquireTokenSilent({
        scopes: [...MSAL_SCOPES],
        account,
      });
      return silentResponse.accessToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        const popupResponse = await client.acquireTokenPopup({
          scopes: [...MSAL_SCOPES],
        });
        return popupResponse.accessToken;
      }
      throw err;
    }
  }
}
