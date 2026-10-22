import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_REVOKE_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  type GoogleAuthConfig,
  googleAuthConfig,
  STORAGE_KEY_EXPIRY,
  STORAGE_KEY_TOKEN,
  STORAGE_KEY_USER,
} from './google_auth_config';

export interface UserInfo {
  displayName: string;
  email: string;
}

export type PopupOpener = (authUrl: string) => Promise<string>;

/**
 * Service managing Google OAuth 2.0 authentication lifecycle and tokens.
 */
export class AuthService {
  private static readonly _ERROR_NO_ACCOUNT = 'No active account found. User must log in';
  private static readonly _ERROR_SESSION_EXPIRED =
    'Google authentication session expired. Please sign in again.';
  private static readonly _ERROR_POPUP_BLOCKED = 'Authentication popup was blocked or closed';
  private static readonly _HEADER_AUTHORIZATION = 'Authorization';
  private static readonly _BEARER_PREFIX = 'Bearer ';
  private static readonly _POPUP_WIDTH = 500;
  private static readonly _POPUP_HEIGHT = 600;
  private static readonly _DEFAULT_EXPIRY_SECONDS = 3600;
  private static readonly _MS_PER_SECOND = 1000;
  private static readonly _EXPIRY_BUFFER_MS = 60000;

  private readonly _storage: Storage | null;
  private readonly _fetchFn: typeof fetch;
  private readonly _config: GoogleAuthConfig;
  private readonly _popupOpener?: PopupOpener;
  private _cachedUser: UserInfo | null = null;
  private _isInitialized = false;

  public constructor(
    customStorage?: Storage | null,
    customFetch?: typeof fetch,
    customConfig?: GoogleAuthConfig,
    popupOpener?: PopupOpener
  ) {
    this._storage =
      customStorage !== undefined
        ? customStorage
        : typeof window !== 'undefined'
        ? window.localStorage
        : null;
    this._fetchFn = customFetch ?? (typeof fetch !== 'undefined' ? fetch : (null as unknown as typeof fetch));
    this._config = customConfig ?? googleAuthConfig;
    this._popupOpener = popupOpener;
  }

  /**
   * Initializes the authentication service and hydrates cached user info.
   */
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      return;
    }
    this._cachedUser = this._loadStoredUser();
    this._isInitialized = true;
  }

  /**
   * Triggers the Google OAuth popup flow, acquires token, and loads user profile.
   */
  public async login(): Promise<UserInfo> {
    const authUrl = this._buildAuthUrl();
    const token = this._popupOpener
      ? await this._popupOpener(authUrl)
      : await this._openDefaultPopup(authUrl);

    return this._finalizeLogin(token, AuthService._DEFAULT_EXPIRY_SECONDS);
  }

  /**
   * Logs in using a pre-acquired access token and expiration window.
   */
  public async loginWithToken(
    accessToken: string,
    expiresInSeconds: number = AuthService._DEFAULT_EXPIRY_SECONDS
  ): Promise<UserInfo> {
    return this._finalizeLogin(accessToken, expiresInSeconds);
  }

  /**
   * Logs out the user by terminating the session and clearing stored credentials.
   */
  public async logout(): Promise<void> {
    const token = this._getRawStoredToken();
    if (token) {
      this._revokeTokenQuietly(token);
    }
    this._clearStorage();
    this._cachedUser = null;
  }

  /**
   * Returns a valid access token, throwing if expired or unauthenticated.
   */
  public async getAccessToken(): Promise<string> {
    const token = this._getRawStoredToken();
    if (!token) {
      throw new Error(AuthService._ERROR_NO_ACCOUNT);
    }
    if (this._isTokenExpired()) {
      await this.logout();
      throw new Error(AuthService._ERROR_SESSION_EXPIRED);
    }
    return token;
  }

  /**
   * Checks whether a user account is currently authenticated with a valid token.
   */
  public isAuthenticated(): boolean {
    const token = this._getRawStoredToken();
    if (!token) {
      return false;
    }
    return !this._isTokenExpired();
  }

  /**
   * Returns profile information for the authenticated user.
   */
  public getUserInfo(): UserInfo | null {
    if (!this.isAuthenticated()) {
      return null;
    }
    if (!this._cachedUser) {
      this._cachedUser = this._loadStoredUser();
    }
    return this._cachedUser;
  }

  /**
   * Builds the Google OAuth2 authorization endpoint URL with query parameters.
   */
  protected _buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this._config.clientId,
      redirect_uri: this._config.redirectUri,
      response_type: 'token',
      scope: this._config.scopes.join(' '),
      include_granted_scopes: 'true',
      prompt: 'select_account',
    });
    return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Opens the default browser popup window and polls for the redirected token.
   */
  protected async _openDefaultPopup(authUrl: string): Promise<string> {
    if (typeof window === 'undefined') {
      throw new Error(AuthService._ERROR_POPUP_BLOCKED);
    }
    const left = window.screenX + (window.outerWidth - AuthService._POPUP_WIDTH) / 2;
    const top = window.screenY + (window.outerHeight - AuthService._POPUP_HEIGHT) / 2;
    const popup = window.open(
      authUrl,
      'google_auth_popup',
      `width=${AuthService._POPUP_WIDTH},height=${AuthService._POPUP_HEIGHT},top=${top},left=${left}`
    );
    if (!popup) {
      throw new Error(AuthService._ERROR_POPUP_BLOCKED);
    }
    return this._pollPopupForToken(popup);
  }

  /**
   * Polls popup window URL hash until token parameter is present.
   */
  protected _pollPopupForToken(popup: Window): Promise<string> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(interval);
            reject(new Error(AuthService._ERROR_POPUP_BLOCKED));
            return;
          }
          if (popup.location.href.includes('access_token=')) {
            const hash = popup.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get('access_token');
            clearInterval(interval);
            popup.close();
            if (token) resolve(token);
            else reject(new Error(AuthService._ERROR_POPUP_BLOCKED));
          }
        } catch {
          // Cross-origin access error while navigating; expected until redirect
        }
      }, 200);
    });
  }

  /**
   * Finalizes login by fetching profile, saving tokens, and updating cache.
   */
  protected async _finalizeLogin(token: string, expiresInSeconds: number): Promise<UserInfo> {
    const userInfo = await this._fetchUserProfile(token);
    const expiryTimestamp = Date.now() + expiresInSeconds * AuthService._MS_PER_SECOND;

    this._saveToStorage(token, userInfo, expiryTimestamp);
    this._cachedUser = userInfo;
    return userInfo;
  }

  /**
   * Fetches the user profile from Google OAuth2 userinfo endpoint.
   */
  protected async _fetchUserProfile(token: string): Promise<UserInfo> {
    const response = await this._fetchFn(GOOGLE_USERINFO_ENDPOINT, {
      headers: {
        [AuthService._HEADER_AUTHORIZATION]: `${AuthService._BEARER_PREFIX}${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Google user profile (${response.status})`);
    }
    const data = (await response.json()) as { name?: string; email?: string };
    return {
      displayName: data.name ?? data.email ?? 'Google User',
      email: data.email ?? '',
    };
  }

  /**
   * Saves authentication state into storage.
   */
  protected _saveToStorage(token: string, user: UserInfo, expiry: number): void {
    if (!this._storage) return;
    this._storage.setItem(STORAGE_KEY_TOKEN, token);
    this._storage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    this._storage.setItem(STORAGE_KEY_EXPIRY, expiry.toString());
  }

  /**
   * Clears authentication state from storage.
   */
  protected _clearStorage(): void {
    if (!this._storage) return;
    this._storage.removeItem(STORAGE_KEY_TOKEN);
    this._storage.removeItem(STORAGE_KEY_USER);
    this._storage.removeItem(STORAGE_KEY_EXPIRY);
  }

  /**
   * Loads cached user info from storage.
   */
  protected _loadStoredUser(): UserInfo | null {
    if (!this._storage) return null;
    const raw = this._storage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserInfo;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the raw token string from storage.
   */
  protected _getRawStoredToken(): string | null {
    if (!this._storage) return null;
    return this._storage.getItem(STORAGE_KEY_TOKEN);
  }

  /**
   * Checks whether the stored token is past its expiration time.
   */
  protected _isTokenExpired(): boolean {
    if (!this._storage) return true;
    const rawExpiry = this._storage.getItem(STORAGE_KEY_EXPIRY);
    if (!rawExpiry) return true;
    const expiryNumber = Number(rawExpiry);
    return Date.now() >= expiryNumber - AuthService._EXPIRY_BUFFER_MS;
  }

  /**
   * Sends best-effort revocation request for the token.
   */
  protected _revokeTokenQuietly(token: string): void {
    try {
      void this._fetchFn(`${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      }).catch(() => {});
    } catch {
      // Ignore background revocation failure
    }
  }
}
