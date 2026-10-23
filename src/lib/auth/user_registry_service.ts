import {
  type PreRegisteredUser,
  STORAGE_KEY_SELECTED_USER,
} from './google_auth_config';

/**
 * Service managing pre-registered user accounts and their associated Google Client IDs.
 */
export class UserRegistryService {
  private static readonly _DEFAULT_USER_SC = 'SC';
  private static readonly _DEFAULT_USER_DB = 'DB';
  private static readonly _FALLBACK_EMPTY = '';
  private static readonly _ENV_PREFIX = 'NEXT_PUBLIC_GOOGLE_CLIENT_ID_';

  private readonly _storage: Storage | null;

  public constructor(customStorage?: Storage | null) {
    this._storage =
      customStorage !== undefined
        ? customStorage
        : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  }

  /**
   * Returns the list of all pre-registered users configured in the environment.
   */
  public getUsers(): PreRegisteredUser[] {
    const defaultClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? UserRegistryService._FALLBACK_EMPTY;
    const scClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_SC || defaultClientId;
    const dbClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID_DB || defaultClientId;

    const defaultUsers: PreRegisteredUser[] = [
      { id: UserRegistryService._DEFAULT_USER_SC, name: UserRegistryService._DEFAULT_USER_SC, clientId: scClientId },
      { id: UserRegistryService._DEFAULT_USER_DB, name: UserRegistryService._DEFAULT_USER_DB, clientId: dbClientId },
    ];

    return this._appendConfiguredUsers(defaultUsers);
  }

  /**
   * Retrieves the currently selected user ID from local storage or returns the default.
   */
  public getSelectedUserId(): string {
    if (!this._storage) {
      return UserRegistryService._DEFAULT_USER_SC;
    }
    const stored = this._storage.getItem(STORAGE_KEY_SELECTED_USER);
    if (stored && this._isValidUser(stored)) {
      return stored;
    }
    return UserRegistryService._DEFAULT_USER_SC;
  }

  /**
   * Sets the active pre-registered user ID into local storage.
   */
  public setSelectedUserId(userId: string): void {
    if (!this._storage) return;
    this._storage.setItem(STORAGE_KEY_SELECTED_USER, userId);
  }

  /**
   * Resolves the Google Client ID associated with the specified user ID.
   */
  public getClientIdForUser(userId: string): string {
    const users = this.getUsers();
    const matched = users.find((u) => u.id.toLowerCase() === userId.toLowerCase());
    if (matched && matched.clientId) {
      return matched.clientId;
    }
    return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? UserRegistryService._FALLBACK_EMPTY;
  }

  /**
   * Retrieves the full PreRegisteredUser object for the currently selected user.
   */
  public getActiveUser(): PreRegisteredUser {
    const selectedId = this.getSelectedUserId();
    const users = this.getUsers();
    const found = users.find((u) => u.id === selectedId);
    return found ?? users[0];
  }

  /**
   * Parses additional users from optional NEXT_PUBLIC_GOOGLE_USERS environment variable.
   */
  protected _appendConfiguredUsers(defaults: PreRegisteredUser[]): PreRegisteredUser[] {
    const raw = process.env.NEXT_PUBLIC_GOOGLE_USERS;
    if (!raw) return defaults;
    try {
      const parsed = JSON.parse(raw) as PreRegisteredUser[];
      const combined = [...defaults];
      for (const user of parsed) {
        if (!combined.some((item) => item.id === user.id)) {
          combined.push(user);
        }
      }
      return combined;
    } catch {
      return defaults;
    }
  }

  /**
   * Validates whether a user ID matches one of the recognized pre-registered users.
   */
  private _isValidUser(userId: string): boolean {
    const users = this.getUsers();
    return users.some((u) => u.id.toLowerCase() === userId.toLowerCase());
  }
}
