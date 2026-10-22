export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
] as const;

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_DEFAULT_REDIRECT_URI = 'http://localhost:3000';

export const STORAGE_KEY_TOKEN = 'synapse_gdrive_token';
export const STORAGE_KEY_USER = 'synapse_gdrive_user';
export const STORAGE_KEY_EXPIRY = 'synapse_gdrive_expiry';

export interface GoogleAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
}

export const googleAuthConfig: GoogleAuthConfig = {
  clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  redirectUri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ?? GOOGLE_DEFAULT_REDIRECT_URI,
  scopes: GOOGLE_SCOPES,
};
