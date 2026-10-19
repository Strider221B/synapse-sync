# Epic 8 — PWA & Offline-First

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation), Epic 2 (Data Layer)  
> **Design Refs:** [Product Requirements §3.6](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [System Architecture §3.3](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/02_system_architecture.md), [Deployment Guide §5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/05_deployment_guide.md), [Design Overview §5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/06_design_overview.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Make SynapseSync installable on mobile home screens, cache the app shell for instant loading, and ensure all core study features (reading notes, taking quizzes, reviewing flashcards) work completely offline.

---

## Story 8.1 — PWA Manifest & Installability

**As a user, I want to install SynapseSync on my phone's home screen so it feels like a native app.**

### Tasks

**Task 8.1.1 — Create the PWA Web App Manifest**
- Create `public/manifest.json` with:
  - `name`: "SynapseSync - AI Study Companion"
  - `short_name`: "SynapseSync"
  - `description`: "Your AI-powered, offline-first study companion"
  - `start_url`: "/"
  - `display`: "standalone"
  - `background_color`: "#0a0a0f" (dark theme background)
  - `theme_color`: "#6366f1" (indigo primary)
  - `orientation`: "any"
  - `categories`: ["education", "productivity"]
  - `icons`: array of icon sizes (72, 96, 128, 144, 152, 192, 384, 512) — generate these in Task 8.1.2
- Refer to [Deployment Guide §5.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/05_deployment_guide.md)

**Task 8.1.2 — Generate PWA icons**
- Create `public/icons/` directory
- Generate the SynapseSync icon in all required sizes: 72×72, 96×96, 128×128, 144×144, 152×152, 192×192, 384×384, 512×512
- The 512×512 icon should have `"purpose": "any maskable"` for adaptive icon support on Android
- Icon design: use the app's indigo primary color, a brain/sync motif, clean and readable at small sizes

**Task 8.1.3 — Add manifest link and meta tags to the root layout**
- In `src/app/layout.tsx`, add:
  - `<link rel="manifest" href="/manifest.json" />`
  - `<meta name="theme-color" content="#6366f1" />`
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
  - `<link rel="apple-touch-icon" href="/icons/icon-192x192.png" />`

---

## Story 8.2 — Service Worker & App Shell Caching

**As a user, I want the app to load instantly even on slow connections because the shell is cached.**

### Tasks

**Task 8.2.1 — Install and configure Serwist (PWA tooling for Next.js)**
- Run `npm install @serwist/next@9.5.13` and `npm install --save-dev serwist@9.5.13`
- Serwist is the maintained successor to `next-pwa` for Next.js App Router
- Configure in `next.config.js`:
  - Enable Serwist plugin
  - Set `dest: "public"` for the generated service worker
  - Configure precaching of the app shell (HTML, CSS, JS, fonts)

**Task 8.2.2 — Configure caching strategies**
- Set up three caching strategies in the Service Worker configuration:
  1. **Cache-First** for app shell assets (HTML, CSS, JS, fonts, images):
     - Serve from cache immediately; update cache in background
     - This ensures the app loads instantly even offline
  2. **Network-First** for API calls (`/api/*`):
     - Try network first; fall back to cached response only if offline
     - When offline, API calls that require AI (generate-quiz, summarize, chat) should return a clear error: "This feature requires an internet connection"
  3. **Stale-While-Revalidate** for other resources:
     - Serve stale content while fetching fresh version in background
- Refer to [Deployment Guide §5.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/05_deployment_guide.md) for the strategy diagram

**Task 8.2.3 — Create the offline fallback page**
- Create `public/offline.html`
- A simple, styled page that displays when the user tries to navigate to a page that isn't cached and they're offline
- Message: "You're offline. Your cached notes and flashcards are still available from the home screen."
- Provide navigation to the cached pages (notes, review, quiz)

---

## Story 8.3 — Offline Study Flow

**As a commuter, I want to study my notes, take quizzes, and review flashcards with no internet connection.**

### Tasks

**Task 8.3.1 — Audit all pages for offline compatibility**
- Review every page in the app and categorize:
  - **Fully offline** (no network needed): Notes reader, quiz taking, flashcard review, SRS review queue, dashboard (with cached data)
  - **Requires network**: OneDrive import, YouTube import, quiz generation, note summarization, AI chat
- For pages that require network: show a clear "Requires internet connection" message with an explanation when offline

**Task 8.3.2 — Add online/offline status indicator**
- Create `src/components/common/ConnectionStatus.tsx`
- A small, unobtrusive indicator in the app header:
  - Online: green dot with "Online"
  - Offline: orange dot with "Offline — studying from cache"
- Use the browser's `navigator.onLine` API and listen for `online`/`offline` events
- When going from offline → online, trigger the sync queue replay (Story 8.4)

**Task 8.3.3 — Ensure IndexedDB data is available offline**
- Verify that all data reads use IndexedDB (not API calls)
- Notes, quizzes, flashcards, SRS state, chat history, and preferences should all read from IndexedDB
- API calls are only needed for **creating new content** (import, generate, summarize)

---

## Story 8.4 — Sync Queue & Background Sync

**As a user, I want my offline activity (quiz results, SRS updates) to sync automatically when I reconnect.**

### Tasks

**Task 8.4.1 — Build the sync queue manager**
- Create `src/lib/db/sync_manager.ts`
- This class:
  - Listens for the `online` event on `window`
  - When connectivity returns: reads all pending entries from `SyncQueueService.getPending()`
  - Processes entries in FIFO order:
    - For each entry: attempt to replay the operation (call the appropriate API or OneDrive endpoint)
    - On success: mark as completed via `SyncQueueService.markCompleted(id)`
    - On failure: mark as failed with error message, increment retry count
    - If retry count exceeds max (3), skip and log the failure
  - Shows a notification when sync is complete: "Synced N changes"

**Task 8.4.2 — Integrate sync queue into data write operations**
- Modify the relevant service classes (or add middleware) to:
  - When the app is online: perform the operation normally
  - When the app is offline: write to IndexedDB locally AND add an entry to the sync queue
  - Operations to queue: SRS card updates, note edits (if implemented), quiz results

**Task 8.4.3 — Implement Background Sync API (best-effort)**
- Register a `sync` event handler in the Service Worker
- When the browser fires a `sync` event (after regaining connectivity), trigger the sync queue replay
- Note: Background Sync API support varies across browsers (well-supported on Chrome/Android, limited on iOS Safari). The `online` event listener from Task 8.4.1 serves as the fallback.

---

## Definition of Done

- [ ] App is installable on mobile home screen (Chrome "Add to Home Screen" prompt appears)
- [ ] App shell loads instantly on subsequent visits (cache-first strategy working)
- [ ] Notes, quizzes, flashcards, and SRS review work completely offline
- [ ] Online/offline indicator is visible and accurate
- [ ] Pages requiring network show a clear message when offline
- [ ] Offline fallback page displays for uncached routes
- [ ] Sync queue replays pending changes when connectivity returns
- [ ] PWA Lighthouse score is ≥ 90
