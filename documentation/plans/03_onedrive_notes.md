# Epic 3 — OneDrive Integration & Note Management

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation), Epic 2 (Data Layer)  
> **Design Refs:** [Product Requirements §3.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [System Architecture §3-5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/02_system_architecture.md), [API Specs §2.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Enable users to authenticate with Microsoft, browse their OneDrive files, import `.docx` and `.md` documents as notes, and view/organize them in the app.

---

## Story 3.1 — Microsoft OAuth Authentication (MSAL.js + PKCE)

**As a user, I want to sign in with my Microsoft account so the app can access my OneDrive files.**

### Tasks

**Task 3.1.1 — Install and configure MSAL.js**
- Run `npm install @azure/msal-browser @azure/msal-react`
- Create `src/lib/auth/msal_config.ts` with:
  - MSAL `Configuration` object reading `NEXT_PUBLIC_MSAL_CLIENT_ID` and `NEXT_PUBLIC_MSAL_REDIRECT_URI` from environment variables
  - Auth authority: `https://login.microsoftonline.com/common`
  - Cache location: `localStorage`
- Define the required scopes as constants: `Files.Read`, `Files.ReadWrite`, `User.Read`

**Task 3.1.2 — Create the `AuthService` class**
- Create `src/lib/auth/auth_service.ts`
- This class wraps MSAL.js operations:
  - `initialize()` — creates and initializes the MSAL `PublicClientApplication` instance
  - `login()` — triggers the MSAL login popup flow with PKCE
  - `logout()` — clears the MSAL session
  - `getAccessToken()` — acquires a token silently (or via redirect if expired), returns the access token string
  - `isAuthenticated()` — returns boolean indicating if a user is currently signed in
  - `getUserInfo()` — returns the logged-in user's display name and email

**Task 3.1.3 — Create the MSAL provider wrapper**
- Create `src/components/auth/MsalProviderWrapper.tsx`
- Wrap the app in the MSAL React `MsalProvider` in the root layout so auth state is available globally
- Handle the MSAL redirect callback on page load

**Task 3.1.4 — Build the "Connect OneDrive" UI**
- Create `src/components/auth/OneDriveConnectButton.tsx`
- When not connected: show a "Connect OneDrive" button with the Microsoft logo
- When connected: show the user's display name and a "Disconnect" option
- Store connection state in the user preferences (via `PreferencesService`)
- Style with CSS: use a distinct, clickable button that fits the dark theme

---

## Story 3.2 — OneDrive File Browser

**As a user, I want to browse my OneDrive folders and select `.docx` or `.md` files to import.**

### Tasks

**Task 3.2.1 — Create the `OneDriveApiClient` class**
- Create `src/lib/api/onedrive_client.ts`
- This class makes authenticated calls to the Microsoft Graph API:
  - `listRootItems()` — `GET /me/drive/root/children` — returns files/folders at the root
  - `listFolderItems(folderId)` — `GET /me/drive/items/{folderId}/children` — returns items in a specific folder
  - `downloadFileContent(itemId)` — `GET /me/drive/items/{itemId}/content` — downloads the raw binary content of a file
- Each method uses `AuthService.getAccessToken()` to get the Bearer token
- Filter responses to only show folders, `.docx`, and `.md` files
- Handle errors: 401 (prompt re-login), 429 (show rate limit message), network errors

**Task 3.2.2 — Build the OneDrive file picker component**
- Create `src/components/notes/OneDrivePicker.tsx`
- UI:
  - Shows a navigable list of folders and files
  - Breadcrumb trail at the top showing the current folder path (e.g., "My Drive / Study / CS229")
  - Folder rows are clickable to navigate deeper
  - `.docx` and `.md` files show a checkbox or select button
  - "Import Selected" button at the bottom
- When a file is selected and "Import" is clicked, trigger the import flow (Story 3.3)
- Include loading states and error messages

**Task 3.2.3 — Build the import modal/page**
- Create `src/app/notes/import/page.tsx` (or a modal component)
- This page combines:
  - The `OneDriveConnectButton` (if not connected)
  - The `OneDrivePicker` (if connected)
  - Option to select/create a notebook to import into
- Provide a "Create Manual Note" alternative for users who don't use OneDrive

---

## Story 3.3 — Document Parsing Backend (`.docx` and `.md`)

**As a user, I want my Word documents to be parsed into readable text so I can study them in the app.**

### Tasks

**Task 3.3.1 — Build the `/api/parse-docx` Python endpoint**
- Create `api/parse_docx.py`
- Implement a handler class that:
  - Accepts a POST request with `multipart/form-data` containing the `.docx` file
  - Uses Python stdlib `zipfile` to open the `.docx` (which is a zip archive)
  - Reads `word/document.xml` from the zip
  - Uses `xml.etree.ElementTree` to parse the XML and extract paragraph text
  - Returns JSON: `{ "text": "extracted content...", "metadata": { "paragraphCount": N, "wordCount": N, "estimatedReadTimeMinutes": N } }`
- Handle errors: missing file (400), invalid file format (400), parsing failure (500)
- Refer to [API Specs §2.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md) for the exact implementation pattern
- **Python virtual env:** `source ~/python_envs/p313_llm/bin/activate`

**Task 3.3.2 — Build the Markdown import flow (frontend)**
- For `.md` files, no server parsing is needed — the raw text downloaded from OneDrive **is** the content
- In the import flow, detect the file extension:
  - `.docx` → send to `/api/parse-docx` for text extraction
  - `.md` → use the raw downloaded text directly, set `contentFormat: 'markdown'`
- Save the note via `NoteService.create()` with the appropriate `sourceType`

**Task 3.3.3 — Create the `ApiClient` class for backend calls**
- Create `src/lib/api/client.ts`
- A general-purpose HTTP client class for calling `/api/*` endpoints:
  - `post(endpoint, data)` — sends a JSON POST request
  - `postFormData(endpoint, formData)` — sends a multipart/form-data POST (for file uploads)
  - Includes retry logic with exponential backoff for `429` and `5xx` errors (max 3 retries)
  - Parses and normalizes error responses
- This class will be reused by all feature modules (quiz generation, summarize, chat)

---

## Story 3.4 — Note Reader View

**As a user, I want to read my imported notes in a clean, mobile-friendly reader view.**

### Tasks

**Task 3.4.1 — Build the notes listing page**
- Create `src/app/notes/page.tsx`
- Shows all notes grouped by notebook
- Each note card displays: title, word count, source type icon, last updated timestamp
- Include a search bar that calls `NoteService.search(query)` and filters results
- Clicking a note card navigates to the reader view

**Task 3.4.2 — Install and configure `react-markdown`**
- Run `npm install react-markdown`
- Optionally install `remark-gfm` for GitHub Flavored Markdown support (tables, strikethrough, etc.)
- Create a `MarkdownRenderer` component that wraps `react-markdown` with consistent styling

**Task 3.4.3 — Build the note reader page**
- Create `src/app/notes/[id]/page.tsx`
- Displays:
  - Note title at the top
  - Source badge (OneDrive, YouTube, Manual)
  - The note content rendered via `MarkdownRenderer` (if Markdown) or as styled plain text
  - Word count and estimated read time in a subtle header
- Actions bar at the bottom or top:
  - "Generate Quiz" button (links to Epic 5)
  - "Ask AI" button (links to Epic 7)
  - "Back to Notes" navigation
- Must be fully responsive — comfortable reading on both laptop and phone screens

**Task 3.4.4 — Build the `NoteCard` component**
- Create `src/components/notes/NoteCard.tsx`
- A reusable card component showing note title, word count, source icon, and updated date
- Supports click handler (for navigation)
- Uses CSS with design tokens for consistent styling

---

## Story 3.5 — Notebook Organization

**As a user, I want to organize my notes into notebooks so I can study one subject at a time.**

### Tasks

**Task 3.5.1 — Build the notebook management UI**
- Create `src/components/notes/NotebookList.tsx`
- Shows all notebooks as cards or list items
- Each notebook card shows: name, note count, source badge, tags
- "Create Notebook" button opens a form (modal or inline) to create a new notebook (name, description, optional tags)

**Task 3.5.2 — Add notebook filtering to the notes page**
- On `src/app/notes/page.tsx`, add a sidebar or dropdown to filter notes by notebook
- "All Notes" view shows everything; selecting a notebook filters to just that notebook's notes

**Task 3.5.3 — Build the notebook detail page**
- Create `src/app/notes/notebook/[id]/page.tsx`
- Shows the notebook header (name, description, tags)
- Lists all notes in that notebook
- Provides actions: rename notebook, delete notebook (with confirmation)

---

## Definition of Done

- [ ] User can sign in with Microsoft account via OAuth PKCE popup
- [ ] User can browse OneDrive folder structure and see `.docx` / `.md` files
- [ ] Selecting a `.docx` file imports it: file is downloaded, sent to `/api/parse-docx`, parsed text saved to IndexedDB
- [ ] Selecting a `.md` file imports it directly (no server call needed)
- [ ] Notes appear on the notes listing page with correct metadata
- [ ] Clicking a note opens the reader view with rendered Markdown or plain text
- [ ] Notes can be organized into notebooks
- [ ] Full-text search works across note titles and content
- [ ] All API calls handle errors gracefully with user-visible messages
- [ ] Mobile-responsive layout on all pages
