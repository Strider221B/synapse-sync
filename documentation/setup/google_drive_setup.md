# Google Drive Integration Setup Guide

> **Target Audience:** Developers and self-hosters configuring Google Drive for SynapseSync.  
> **Last Updated:** October 2026  
> **Applicable Scopes:** Read, Write, Create, and Update (`https://www.googleapis.com/auth/drive`)

This guide provides an end-to-end walkthrough for setting up Google OAuth 2.0 and the Google Drive API in the Google Cloud Console. Following these steps enables SynapseSync to browse folders, ingest documents (`.docx`, `.md`, and Google Docs), and write/synchronize study notes back to your Google Drive.

---

## Architecture Overview

SynapseSync runs as a Progressive Web App (PWA) where authentication and Google Drive API calls are executed directly in the user's browser:
* **Public Client Flow:** Authentication uses token-based OAuth 2.0. No server secret is needed or stored in client-side code.
* **Direct Browser Calls:** The client application communicates directly with Google Drive API v3 (`https://www.googleapis.com/drive/v3`) and Google Drive Upload v3 (`https://www.googleapis.com/upload/drive/v3`).
* **Zero Backend Storage:** User files, tokens, and notes are never routed through or stored on external third-party backend servers.

---

## Step 1: Create or Select a Google Cloud Project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. In the top navigation bar, click the project dropdown menu (next to the "Google Cloud" logo).
3. Click **New Project** (or select an existing project if you already have one, e.g. `study-project`):
   * **Project name:** Enter `SynapseSync` (or any name you prefer).
   * **Organization:** Select *No organization* (for personal Gmail accounts).
4. Click **Create** and wait a few seconds for the project to provision.
5. Ensure the new project is actively selected in the top dropdown menu.

> [!NOTE]
> The Google Drive API free tier requires **no billing account**. Do not enable billing on this project to avoid unexpected charges.

---

## Step 2: Enable the Google Drive API

By default, new Google Cloud projects have all APIs disabled. You must explicitly enable the Google Drive API:

1. In the left navigation menu, go to **APIs & Services** → **Library** *(or open [Google Drive API in Library](https://console.cloud.google.com/apis/library/drive.googleapis.com))*.
2. In the search box, search for `Google Drive API`.
3. Select **Google Drive API** from the search results.
4. Click the blue **Enable** button.

> [!WARNING]
> If you skip this step, OAuth login will succeed, but loading or writing files will fail with:  
> `Google Drive request failed (403): Google Drive API has not been used in project before or it is disabled.`

---

## Step 3: Configure the OAuth Consent Screen

1. In the left navigation menu, navigate to **APIs & Services** → **OAuth consent screen** *(or **Audience** in the Google Auth Platform interface)*.
2. Under **User Type**, select **External**:
   * *External* allows any standard Google account (like your personal `@gmail.com` address) to authenticate while in testing mode.
3. Click **Create**.
4. Fill in the **App information**:
   * **App name:** `SynapseSync`
   * **User support email:** Select your Google email address from the dropdown.
   * **App logo:** Optional (can be left blank).
5. Fill in the **Developer contact information**:
   * **Email addresses:** Enter your email address.
6. Click **Save and Continue**.

---

## Step 4: Add Required Scopes (Read & Write)

1. On the **Scopes** page, click **Add or Remove Scopes**.
2. Filter or search and check the following scopes:
   * `https://www.googleapis.com/auth/drive` — Full access to view, edit, create, and delete Google Drive files.
   * `https://www.googleapis.com/auth/userinfo.profile` — View basic profile info (name and avatar).
   * `https://www.googleapis.com/auth/userinfo.email` — View your Google account email address.
3. Click **Update**.
4. Click **Save and Continue**.

> [!IMPORTANT]
> Ensure you select `.../auth/drive` (not `.../auth/drive.readonly`), otherwise file creation and note updates will fail due to insufficient permissions.

---

## Step 5: Add Test Users (Required for Personal Apps)

When a Google Cloud project is in **Testing** mode (the default before formal Google enterprise verification), Google blocks any Google account that is not listed as an approved tester.

1. On the **Test users** page, click **+ ADD USERS**.
2. Enter your Google email address (e.g. `your-email@gmail.com`).
3. If you plan to test with multiple Google accounts, add each one here.
4. Click **Save and Continue**.
5. Review the summary page and click **Back to Dashboard**.

> [!WARNING]
> If you attempt to log in with an email that is not in the Test Users list, Google will display:  
> `Access blocked: SynapseSync has not completed the Google verification process. Error 403: access_denied`.

---

## Step 6: Create OAuth 2.0 Client ID Credentials

1. In the left navigation menu, go to **APIs & Services** → **Credentials**.
2. At the top of the page, click **+ CREATE CREDENTIALS** → **OAuth client ID**.
3. Configure the credential settings:
   * **Application type:** Select **Web application**.
   * **Name:** Enter `SynapseSync Web Client` (this is an internal label for your console).
4. Under **Authorized JavaScript origins**, click **+ ADD URI** and add:
   * `http://localhost:3000` (for local development)
   * `https://synapse-sync.vercel.app` (or your production domain, if deployed)
5. Under **Authorized redirect URIs**, click **+ ADD URI** and add:
   * `http://localhost:3000` (for local development)
   * `https://synapse-sync.vercel.app` (or your production domain, if deployed)
6. Click **Create**.

> [!NOTE]
> Do NOT include a trailing slash in the origin or redirect URI (use `http://localhost:3000`, NOT `http://localhost:3000/`).

---

## Step 7: Configure Environment Variables

When the modal pops up displaying your **Client ID** and **Client secret**:

1. Copy the **Client ID** (it looks like `1234567890-abcdefg123456.apps.googleusercontent.com`).
2. **You do NOT need the Client Secret.** SynapseSync is a client-side Single Page Application (SPA); client secrets are only for server-to-server confidential applications. Never expose client secrets in browser environment variables.
3. Open `.env.local` in your project root and update the variables:

```bash
# Google OAuth 2.0
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:3000
```

4. If deploying to Vercel, add the variables via the Vercel CLI or project dashboard:
```bash
vercel env add NEXT_PUBLIC_GOOGLE_CLIENT_ID production
vercel env add NEXT_PUBLIC_GOOGLE_REDIRECT_URI production
```

5. Restart the local development server to pick up `.env.local` changes:
```bash
npm run dev
```

---

## Step 8: First-Time Sign-In & Verification Warning

1. Open SynapseSync in your browser (`http://localhost:3000`).
2. Navigate to **Settings** or **Notes** → **Import** and click **Connect Google Drive**.
3. A Google sign-in popup will open:
   * Sign in using your approved test email account.
4. Because personal development apps are unverified by Google, you will see a warning screen:
   * **"Google hasn't verified this app"**
   * Click **Advanced** (small link at the bottom left).
   * Click **Go to SynapseSync (unsafe)**.
5. On the permissions screen, ensure the checkbox to access Google Drive files is checked.
6. Click **Continue**.
7. The popup closes, and the UI will reflect **CONNECTED TO GOOGLE DRIVE: [Your Name]**.

---

## Step 9: Verifying Capabilities

### 1. Reading & Browsing Files
* Navigate to **Notes** → **Import** (`/notes/import`).
* Under the **Google Drive** tab, you should see your root `My Drive` folder.
* Click any folder to drill down into subdirectories.
* Select `.docx`, `.md`, or native Google Docs files, and click **Import Selected**.
* Notes will be converted and stored locally in IndexedDB.

### 2. Writing & Updating Files
* The API client supports both creating new files and updating existing files on Google Drive:
  * **Create:** `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`
  * **Update:** `PATCH https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media`
* Uploaded files will appear immediately in your Google Drive storage.

---

## Troubleshooting & Common Issues

| Issue / Error | Root Cause | Solution |
|:---|:---|:---|
| **`Error 403: access_denied`** ("App has not completed the Google verification process") | Your Google account is not added to the Test Users list. | Go to **APIs & Services** → **OAuth consent screen** → **Test users**, click **Add Users**, and add your email. |
| **`Google Drive request failed (403)`** when browsing files | The Google Drive API is not enabled in the project. | Go to **APIs & Services** → **Library**, search for **Google Drive API**, and click **Enable**. |
| **`redirect_uri_mismatch` or `origin_mismatch`** | The URL where SynapseSync is running does not match your credentials config. | In **Credentials** → **OAuth client ID**, verify `http://localhost:3000` is listed under both **Authorized JavaScript origins** and **Authorized redirect URIs** (ensure no trailing slash). |
| **`Failed to execute 'fetch' on 'Window': Illegal invocation`** | Native `fetch` called without `window` binding context. | Ensure you are on the latest codebase version; `AuthService` and `GoogleDriveApiClient` bind `fetch` to `window`. |
| **Empty file list or no eligible documents found** | Google Drive folder contains no `.docx`, `.md`, or Google Docs files. | In-app browser filters automatically for eligible study document formats. Verify your Drive folder contains supported file types. |
