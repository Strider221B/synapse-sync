import type { Configuration } from '@azure/msal-browser';

export const MSAL_SCOPES = ['Files.Read', 'Files.ReadWrite', 'User.Read'] as const;

export const MSAL_AUTHORITY = 'https://login.microsoftonline.com/common';
export const MSAL_DEFAULT_REDIRECT_URI = 'http://localhost:3000';
export const MSAL_CACHE_LOCATION = 'localStorage';

export const msalConfig: Configuration = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MSAL_CLIENT_ID ?? '',
    authority: MSAL_AUTHORITY,
    redirectUri: process.env.NEXT_PUBLIC_MSAL_REDIRECT_URI ?? MSAL_DEFAULT_REDIRECT_URI,
  },
  cache: {
    cacheLocation: MSAL_CACHE_LOCATION,
  },
};
