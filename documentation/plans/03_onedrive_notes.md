# Epic 3 — Google Drive Integration & Note Management

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation), Epic 2 (Data Layer)  
> **Design Refs:** [Product Requirements §3.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [System Architecture §3-5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/02_system_architecture.md), [API Specs §2.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Enable users to authenticate with Google, browse their Google Drive files, import `.docx`, `.md`, and Google Docs documents as notes, and view/organize them in the app.

---

## Story 3.1 — Google OAuth 2.0 Authentication

**As a user, I want to sign in with my Google account so the app can access my Google Drive files.**

### Tasks

**Task 3.1.1 — Configure Google OAuth 2.0**
- Create `src/lib/auth/google_auth_config.ts` with:
  - Configuration reading `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_REDIRECT_URI`
  - Scopes: `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/userinfo.profile`, `https://www.googleapis.com/auth/userinfo.email`
  - Storage keys for token, user profile, and token expiry

**Task 3.1.2 — Create the `AuthService` class**
- Create `src/lib/auth/auth_service.ts`
- This class manages Google OAuth 2.0 operations:
  - `initialize()` — restores stored session and user profile
  - `login()` — triggers OAuth 2.0 popup flow, exchanges token, and fetches user profile
  - `logout()` — revokes token and clears local session
  - `getAccessToken()` — returns valid access token, verifying expiration
  - `isAuthenticated()` — checks if active valid token exists
  - `getUserInfo()` — returns user display name and email

**Task 3.1.3 — Create the Google Auth provider wrapper**
- Create `src/components/auth/GoogleAuthProviderWrapper.tsx`
- Wrap the app in `GoogleAuthProviderWrapper` in root layout so auth state is available globally
- Export `useGoogleAuth` hook

**Task 3.1.4 — Build the "Connect Google Drive" UI**
- Create `src/components/auth/GoogleDriveConnectButton.tsx`
- When not connected: show a "Connect Google Drive" button with the Google Drive icon
- When connected: show the user's display name and a "Disconnect" option
- Store connection state in user preferences (`googleDriveConnected`)

---

## Story 3.2 — Google Drive File Browser

**As a user, I want to browse my Google Drive folders and select `.docx`, `.md`, or Google Docs files to import.**

### Tasks

**Task 3.2.1 — Create the `GoogleDriveApiClient` class**
- Create `src/lib/api/google_drive_client.ts`
- Makes authenticated calls to the Google Drive v3 REST API:
  - `listRootItems()` — lists folders and eligible files in root
  - `listFolderItems(folderId)` — lists items in a specific folder
  - `downloadFileContent(itemId, mimeType)` — downloads binary `.docx`/`.md` or exports Google Docs as plain text
- Uses `AuthService.getAccessToken()` for Bearer token
- Filters items to folders, `.docx`, `.md`, and Google Docs
- Handles errors: 401 (session expired), 429 (rate limit), network failures

**Task 3.2.2 — Build the Google Drive file picker component**
- Create `src/components/notes/GoogleDrivePicker.tsx`
- UI:
  - Navigable list of folders and files with breadcrumb trail
  - Distinct icons for folders, docx, markdown, and Google Docs
  - Multi-file checkbox selection with "Import Selected" action
  - Loading states, empty states, and error alerts

**Task 3.2.3 — Build the import page**
- Update `src/app/notes/import/page.tsx`:
  - `GoogleDriveConnectButton` (if not connected)
  - `GoogleDrivePicker` (if connected)
  - Option to select/create a notebook to import into
  - "Create Manual Note" alternative

---

## Story 3.3 — Document Parsing Backend (`.docx`, `.md`, and Google Docs)

**As a user, I want my documents to be parsed into readable text so I can study them in the app.**

### Tasks

**Task 3.3.1 — Build the `/api/parse-docx` Python endpoint**
- `api/parse_docx.py`
- Accepts POST request with `.docx` file and extracts XML paragraph text
- Returns JSON with extracted text and reading metrics

**Task 3.3.2 — Build document import flow (frontend)**
- In `src/app/notes/import/page.tsx`:
  - `.docx` → sent to `/api/parse-docx` for text extraction, saved as `sourceType: 'gdrive_docx'`
  - `.md` → read as text, saved as `sourceType: 'gdrive_md'`
  - Google Docs → exported as text via Drive API, saved as `sourceType: 'gdrive_doc'`
- Save note via `NoteService.create()` with `googleDriveFileId`

**Task 3.3.3 — Maintain `ApiClient` class for backend calls**
- `src/lib/api/client.ts`

---

## Story 3.4 — Note Reader View

**As a user, I want to read my imported notes in a clean, mobile-friendly reader view.**

### Tasks

**Task 3.4.1 — Notes listing page**
- `src/app/notes/page.tsx`
- Lists notes grouped by notebook, with search and Google Drive badge indicators

**Task 3.4.2 — Markdown renderer**
- `react-markdown` and `remark-gfm` in `MarkdownRenderer`

**Task 3.4.3 — Note reader page**
- `src/app/notes/[id]/page.tsx`
- Reader view with Google Drive source badge, word count, actions for Quiz and AI chat

**Task 3.4.4 — NoteCard component**
- `src/components/notes/NoteCard.tsx`
- Source badge indicators for `gdrive_docx`, `gdrive_md`, and `gdrive_doc`

---

## Story 3.5 — Notebook Organization

**As a user, I want to organize my notes into notebooks so I can study one subject at a time.**

### Tasks

**Task 3.5.1 — Notebook management UI**
- `src/components/notes/NotebookList.tsx`

**Task 3.5.2 — Notebook filtering**
- On `src/app/notes/page.tsx`

**Task 3.5.3 — Notebook detail page**
- `src/app/notes/notebook/[id]/page.tsx`

---

## Definition of Done

- [x] User can sign in with Google account via OAuth 2.0 popup
- [x] User can browse Google Drive folder structure and see `.docx`, `.md`, and Google Docs
- [x] Selecting a `.docx` file imports it: file is downloaded, sent to `/api/parse-docx`, parsed text saved to IndexedDB
- [x] Selecting a `.md` or Google Doc imports it directly as plain text / markdown
- [x] Notes appear on the notes listing page with Google Drive source metadata
- [x] Clicking a note opens the reader view with rendered Markdown or plain text
- [x] Notes can be organized into notebooks
- [x] Full-text search works across note titles and content
- [x] All API calls handle errors gracefully with user-visible messages
- [x] Mobile-responsive layout on all pages
