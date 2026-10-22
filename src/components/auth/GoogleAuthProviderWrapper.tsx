'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService, type UserInfo } from '@/lib/auth/auth_service';

export interface GoogleAuthContextType {
  isAuthenticated: boolean;
  user: UserInfo | null;
  authService: AuthService;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string>;
}

const defaultAuthService = new AuthService();

const GoogleAuthContext = createContext<GoogleAuthContextType>({
  isAuthenticated: false,
  user: null,
  authService: defaultAuthService,
  login: async () => {},
  logout: async () => {},
  getAccessToken: async () => '',
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
  const [authService] = useState<AuthService>(() => new AuthService());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    let active = true;
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
  }, [authService]);

  const handleLogin = async () => {
    const userInfo = await authService.login();
    setIsAuthenticated(true);
    setUser(userInfo);

    const { SyncManager } = await import('@/lib/db/sync_manager');
    void SyncManager.getInstance().forceSync().catch((err) => {
      console.warn('Post-login sync failed:', err);
    });
  };

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setUser(null);

    const { SyncManager } = await import('@/lib/db/sync_manager');
    SyncManager.getInstance().setSyncService(null);
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
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}
