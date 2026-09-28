# Epic 4 — YouTube Transcript Ingestion

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation), Epic 2 (Data Layer)  
> **Design Refs:** [Product Requirements §3.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [System Architecture §3.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/02_system_architecture.md), [API Specs §2.2-2.5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md), [Design Overview §ADR-05, ADR-06](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/06_design_overview.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Enable users to paste a YouTube video or playlist URL, fetch transcripts via the backend, summarize them into structured notes using Gemini, and store them as notebooks in IndexedDB.

---

## Story 4.1 — YouTube Transcript Fetching (Node.js API Route)

**As a user, I want to paste a YouTube video URL and have its transcript fetched automatically.**

### Tasks

**Task 4.1.1 — Install the `youtube-transcript` npm package**
- Run `npm install youtube-transcript`
- This lightweight package fetches YouTube transcripts from Node.js (bypassing the CORS restriction that blocks browser-side fetching)

**Task 4.1.2 — Build the `/api/transcript` Next.js API route**
- Create `src/app/api/transcript/route.ts`
- Implement a `POST` handler that:
  - Reads `videoUrl` and optional `language` (default `"en"`) from the JSON body
  - Extracts the 11-character video ID from the URL using regex (handle `youtube.com/watch?v=`, `youtu.be/`, and plain video IDs)
  - Calls `YoutubeTranscript.fetchTranscript(videoId, { lang: language })`
  - Joins all transcript segments into a single text string
  - Returns: `{ transcript, videoId, language, metadata: { wordCount, segmentCount } }`
- Handle errors with appropriate codes:
  - Invalid URL → `400` with code `INVALID_URL`
  - No captions available → `404` with code `TRANSCRIPTS_DISABLED`
  - IP blocked by YouTube → `429` with code `REQUEST_BLOCKED`
  - General failure → `500` with code `FETCH_FAILED`
- Refer to [API Specs §2.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md) for the exact implementation

**Task 4.1.3 — Build the `/api/playlist-info` Next.js API route**
- Create `src/app/api/playlist-info/route.ts`
- Implement a `POST` handler that:
  - Reads `playlistUrl` from the JSON body
  - Fetches the YouTube playlist page HTML
  - Parses the response to extract individual video IDs, titles, and URLs
  - Returns: `{ playlistTitle, videoCount, videos: [{ videoId, title, url, index }] }`
- Handle errors: invalid playlist URL (400), playlist not found or private (404)
- Note: This does NOT use the YouTube Data API — it parses the public page

---

## Story 4.2 — Note Summarization Backend (Gemini)

**As a user, I want my YouTube transcripts summarized into structured study notes, not raw transcript dumps.**

### Tasks

**Task 4.2.1 — Build the `/api/summarize` Python endpoint**
- Create `api/summarize.py`
- Implement a handler class that:
  - Accepts POST with JSON body: `{ text, title?, format? }`
  - Validates that `text` is at least 50 characters
  - Truncates text to ~8000 words if longer (to stay within Gemini token limits)
  - Sends the text to Gemini with a system prompt instructing it to create structured study notes
  - Uses Gemini structured output mode with the summarization JSON schema (see [Data Models §5.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md))
  - Returns: `{ title, summary, keyPoints[], markdownNotes, metadata: { model, inputTokens, outputTokens } }`
- Include retry logic: if Gemini returns `429`, retry with exponential backoff (2s, 4s, 8s, max 3 retries)
- **Python virtual env:** `source ~/python_envs/p313_llm/bin/activate`

**Task 4.2.2 — Create the Gemini service utility**
- Create `api/gemini_service.py` (or similar)
- A shared utility class used by `summarize.py`, `generate_quiz.py`, and `chat.py`:
  - `configure()` — reads `GEMINI_API_KEY` from env, configures the `genai` library
  - `call_with_retry(model_name, prompt, config, max_retries=3)` — calls Gemini with exponential backoff on rate limits
- This avoids duplicating retry logic across all three endpoints (DRY principle)

---

## Story 4.3 — YouTube Import UI

**As a user, I want a page where I can paste a video or playlist URL and see progress as transcripts are fetched and summarized.**

### Tasks

**Task 4.3.1 — Create the YouTube import page**
- Create `src/app/youtube/page.tsx`
- UI sections:
  - URL input field with a "Process" button
  - Auto-detect whether the URL is a single video or a playlist
  - For a single video: show a simple loading spinner → then the result
  - For a playlist: show a progress indicator (see Task 4.3.3)

**Task 4.3.2 — Build the `PlaylistImporter` component**
- Create `src/components/youtube/PlaylistImporter.tsx`
- This component orchestrates the micro-request pattern:
  1. Call `/api/playlist-info` with the playlist URL to get the video list
  2. Create a new notebook via `NotebookService.create()` with `source: 'youtube_playlist'`
  3. Loop through each video **sequentially** (one at a time):
     a. Check if transcript is already cached in IndexedDB (by video URL) — skip if cached
     b. Call `/api/transcript` with the video URL
     c. On success: cache the raw transcript in IndexedDB
     d. On failure (IP blocked): show the manual paste fallback for this video
     e. Call `/api/summarize` with the transcript text
     f. Save the resulting note via `NoteService.create()` with `sourceType: 'youtube_transcript'`
     g. Update the progress indicator
  4. When all videos are done, navigate to the new notebook
- Handle cancellation (user can abort mid-playlist)

**Task 4.3.3 — Build the progress indicator component**
- Create `src/components/common/ProgressBar.tsx`
- Shows: current video number / total (e.g., "Processing 3 of 20"), a visual progress bar, the current video's title
- Displays status per video: ✅ completed, ⏳ in progress, ⏸ pending, ❌ failed

**Task 4.3.4 — Build the manual transcript paste fallback**
- Create `src/components/youtube/TranscriptPaster.tsx`
- Shows when auto-fetch fails for a specific video
- UI: a text area where the user can paste a transcript manually
- Provides instructions: "Open the YouTube video, click '...' → 'Open transcript', copy the text, and paste it here"
- "Submit" button sends the pasted text to `/api/summarize`

---

## Story 4.4 — YouTube URL Utilities

**As a developer, I need helper functions to parse and validate YouTube URLs.**

### Tasks

**Task 4.4.1 — Create the YouTube URL utility class**
- Create `src/lib/utils/youtube.ts`
- Methods:
  - `isVideoUrl(url)` — returns `true` if the URL points to a single YouTube video
  - `isPlaylistUrl(url)` — returns `true` if the URL points to a playlist
  - `extractVideoId(url)` — extracts the 11-char video ID from various URL formats
  - `extractPlaylistId(url)` — extracts the playlist ID
  - `buildVideoUrl(videoId)` — constructs a canonical YouTube video URL
- Handle all common URL patterns: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/playlist?list=`, and bare video IDs

---

## Definition of Done

- [ ] User can paste a single YouTube video URL and get structured study notes generated
- [ ] User can paste a playlist URL and have one note created per video in a new notebook
- [ ] Progress indicator updates in real-time during playlist processing
- [ ] If transcript auto-fetch fails, user sees the manual paste fallback with clear instructions
- [ ] Transcripts are cached in IndexedDB — re-processing the same video doesn't re-fetch
- [ ] Notes are saved with `sourceType: 'youtube_transcript'` and include the video URL
- [ ] The summarize endpoint returns structured notes with title, summary, key points, and markdown
- [ ] All error states have user-friendly messages
