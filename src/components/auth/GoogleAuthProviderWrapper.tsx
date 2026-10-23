'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AuthService, type UserInfo } from '@/lib/auth/auth_service';
import type { PreRegisteredUser } from '@/lib/auth/google_auth_config';
import { UserRegistryService } from '@/lib/auth/user_registry_service';

export interface GoogleAuthContextType {
  isAuthenticated: boolean;
  user: UserInfo | null;
  authService: AuthService;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string>;
  selectedUser: string;
  setSelectedUser: (userId: string) => void;
  registeredUsers: PreRegisteredUser[];
}

const defaultAuthService = new AuthService();

const GoogleAuthContext = createContext<GoogleAuthContextType>({
  isAuthenticated: false,
  user: null,
  authService: defaultAuthService,
  login: async () => { },
  logout: async () => { },
  getAccessToken: async () => '',
  selectedUser: 'SC',
  setSelectedUser: () => { },
  registeredUsers: [],
});

export function useGoogleAuth(): GoogleAuthContextType {
  return useContext(GoogleAuthContext);
}

interface GoogleAuthProviderWrapperProps {
  children: React.ReactNode;
}

/**
 * Root Google authentication provider wrapper managing client-side Google auth session.
 */
export function GoogleAuthProviderWrapper({ children }: GoogleAuthProviderWrapperProps) {
  const registry = useMemo(() => new UserRegistryService(), []);
  const [selectedUser, setSelectedUserState] = useState<string>(() => registry.getSelectedUserId());
  const [registeredUsers] = useState<PreRegisteredUser[]>(() => registry.getUsers());
  const [authService] = useState<AuthService>(() => {
    const service = new AuthService();
    service.setClientId(registry.getClientIdForUser(selectedUser));
    return service;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    let active = true;
    authService.setClientId(registry.getClientIdForUser(selectedUser));
    authService.initialize().then(() => {
      if (!active) return;
      const isAuthed = authService.isAuthenticated();
      setIsAuthenticated(isAuthed);
      setUser(authService.getUserInfo());

      import('@/lib/db/database_service').then(({ DatabaseService }) => {
        import('@/lib/api/google_drive_client').then(({ GoogleDriveApiClient }) => {
          import('@/lib/db/services/google_drive_sync_service').then(({ GoogleDriveSyncService }) => {
            import('@/lib/db/sync_manager').then(({ SyncManager }) => {
              const dbService = new DatabaseService();
              const gdriveClient = new GoogleDriveApiClient(authService);
              const syncService = new GoogleDriveSyncService(dbService, gdriveClient, authService);
              const syncManager = SyncManager.getInstance();
              syncManager.setSyncService(syncService);

              if (isAuthed) {
                void syncManager.forceSync().catch((err) => {
                  console.warn('Initial Google Drive sync skipped or failed:', err);
                });
              }
            });
          });
        });
      });
    });
    return () => {
      active = false;
    };
  }, [authService, registry, selectedUser]);

  const handleSelectUser = (userId: string) => {
    registry.setSelectedUserId(userId);
    setSelectedUserState(userId);
    authService.setClientId(registry.getClientIdForUser(userId));
  };

  const handleLogin = async () => {
    authService.setClientId(registry.getClientIdForUser(selectedUser));
    const userInfo = await authService.login();
    setIsAuthenticated(true);
    setUser(userInfo);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('synapse-auth-changed', {
        detail: { isAuthenticated: true, user: userInfo, selectedUser },
      }));
    }

    const { SyncManager } = await import('@/lib/db/sync_manager');
    void SyncManager.getInstance().forceSync().catch((err) => {
      console.warn('Post-login sync failed:', err);
    });
  };

  const handleLogout = async () => {
    try {
      const { SyncManager } = await import('@/lib/db/sync_manager');
      const syncManager = SyncManager.getInstance();
      if (authService.isAuthenticated()) {
        await syncManager.forceSync().catch(() => { });
      }
    } catch {
      // Continue logout if pre-sync encounters network issues
    }

    await authService.logout();
    setIsAuthenticated(false);
    setUser(null);

    const { DatabaseService } = await import('@/lib/db/database_service');
    const dbService = new DatabaseService();
    await dbService.clearAllData();

    const { SyncManager } = await import('@/lib/db/sync_manager');
    SyncManager.getInstance().setSyncService(null);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('synapse-auth-changed', {
        detail: { isAuthenticated: false, user: null, selectedUser },
      }));
      window.dispatchEvent(new CustomEvent('synapse-sync-completed', {
        detail: { success: true, timestamp: new Date().toISOString() },
      }));
    }
  };

  const handleGetAccessToken = async (): Promise<string> => {
    return authService.getAccessToken();
  };

  return (
    <GoogleAuthContext.Provider
      value={{
        isAuthenticated,
        user,
        authService,
        login: handleLogin,
        logout: handleLogout,
        getAccessToken: handleGetAccessToken,
        selectedUser,
        setSelectedUser: handleSelectUser,
        registeredUsers,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}
