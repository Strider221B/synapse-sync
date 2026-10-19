# Epic 4 — YouTube Transcript Ingestion (Local-First Pipeline)

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation), Epic 2 (Data Layer)  
> **Design Refs:** [Product Requirements §3.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [System Architecture §3.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/02_system_architecture.md), [API Specs §2.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md), [Design Overview §ADR-04, ADR-05, ADR-06](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/06_design_overview.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Enable users to generate **detailed, comprehensive study notes** from YouTube videos and playlists. Transcript fetching and note generation run **locally on the developer's machine** via a Python CLI tool (eliminating cloud IP blocking and timeout constraints). The final processed notes are pushed to the Vercel server for access via the PWA.

---

## Story 4.1 — Local YouTube Transcript Fetching (Python CLI)

**As a developer, I want a local CLI tool that fetches YouTube transcripts from my machine so that cloud IP blocking is eliminated.**

### Tasks

**Task 4.1.1 — Install the `youtube-transcript-api` Python package**
- Add `youtube-transcript-api>=0.6.0` to `tools/youtube_cli/requirements.txt`
- Install into the local Python virtual environment: `source ~/python_envs/p313_llm/bin/activate && pip install -r tools/youtube_cli/requirements.txt`
- This runs locally on the developer's machine — residential IP avoids YouTube blocking

**Task 4.1.2 — Build the `TranscriptFetcher` class**
- Create `tools/youtube_cli/transcript_fetcher.py`
- Implement a class that:
  - Accepts a single YouTube video URL or video ID
  - Extracts the 11-character video ID from the URL using regex (handle `youtube.com/watch?v=`, `youtu.be/`, and plain video IDs)
  - Calls `YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])`
  - Joins all transcript segments into a single text string
  - Returns: `{ transcript: str, video_id: str, word_count: int, segment_count: int }`
- Handle errors with appropriate exceptions:
  - Invalid URL → raise `ValueError` with descriptive message
  - No captions available → raise custom `TranscriptsDisabledError`
  - Video unavailable → raise custom `VideoUnavailableError`
  - Network failure → raise `ConnectionError` with retry hint

**Task 4.1.3 — Build the `PlaylistResolver` class**
- Create `tools/youtube_cli/playlist_resolver.py`
- Implement a class that:
  - Accepts a YouTube playlist URL
  - Resolves the playlist to a list of individual video IDs, titles, and URLs
  - Returns: `{ playlist_title: str, video_count: int, videos: list[{ video_id, title, url, index }] }`
- Use the `youtube-transcript-api` library's built-in playlist support, or HTTP fetch + HTML parsing as a fallback
- Handle errors: invalid playlist URL, playlist not found, private playlist

**Task 4.1.4 — Build the `TranscriptCache` class**
- Create `tools/youtube_cli/transcript_cache.py`
- Implement a local file-based cache for transcripts:
  - Cache directory: `~/.synapse-sync/transcript_cache/`
  - Each transcript cached as `{video_id}.json` containing the raw transcript text + metadata
  - `has(video_id)` — check if transcript is already cached
  - `get(video_id)` — retrieve cached transcript
  - `put(video_id, transcript, metadata)` — store transcript
- This prevents re-fetching transcripts for videos that have already been processed

---

## Story 4.2 — Local Detailed Note Generation (Gemini)

**As a user, I want exhaustively detailed study notes from each YouTube transcript — not summaries, but comprehensive notes that capture every concept, definition, example, and explanation.**

### Tasks

**Task 4.2.1 — Build the `NoteGenerator` class**
- Create `tools/youtube_cli/note_generator.py`
- Implement a class that:
  - Accepts raw transcript text and video title
  - Sends the text to Gemini with a system prompt instructing it to create **detailed, comprehensive notes** (not summaries)
  - Uses Gemini structured output mode with the detailed note generation JSON schema (see [Data Models §5.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md))
  - Returns: `{ title: str, summary: str, key_points: list[str], markdown_notes: str, metadata: { model, input_tokens, output_tokens } }`
- **System prompt must emphasize:**
  - "You are a meticulous note-taker, not a summarizer"
  - "Capture EVERY concept, definition, example, analogy, formula, and explanation"
  - "The notes should be detailed enough that someone reading only these notes would have a thorough understanding of the topic without needing to watch the original video"
  - "Use headings, subheadings, bullet points, numbered lists, bold/italic emphasis, and code blocks where appropriate"
  - "Include specific examples, numbers, and data points mentioned in the lecture"
- Include retry logic: if Gemini returns `429`, retry with exponential backoff (2s, 4s, 8s, max 3 retries)
- For very long transcripts (>8000 words), process in chunks and combine the detailed notes

**Task 4.2.2 — Create the Gemini service utility for the CLI**
- Create `tools/youtube_cli/gemini_service.py` (or add to `note_generator.py`)
- A shared utility class:
  - `configure()` — reads `GEMINI_API_KEY` from environment variable
  - `call_with_retry(model_name, prompt, config, max_retries=3)` — calls Gemini with exponential backoff on rate limits
  - Includes a configurable delay between requests (default 4 seconds) to respect Gemini free tier rate limits
- **Python virtual env:** `source ~/python_envs/p313_llm/bin/activate`

---

## Story 4.3 — Server Push (Local CLI → Vercel)

**As a developer, I want the locally-generated notes to be pushed to the Vercel server so the PWA can access them.**

### Tasks

**Task 4.3.1 — Build the `ServerPusher` class**
- Create `tools/youtube_cli/server_pusher.py`
- Implement a class that:
  - Accepts a notebook definition and list of processed notes
  - Posts the data to `POST /api/youtube-notes` on the Vercel server
  - Authenticates using the `YOUTUBE_NOTES_API_KEY` shared secret (sent as `Authorization: Bearer <key>`)
  - Handles response: parses `{ notebookId, noteIds[], notesStored }` on success
  - Handles errors: network failure, auth failure (401), validation error (400), server error (500)
- Include retry logic for transient network errors (max 3 retries with backoff)

**Task 4.3.2 — Build the `/api/youtube-notes` Vercel endpoint**
- Create `api/youtube_notes.py`
- Implement a handler class that:
  - Accepts POST with JSON body: `{ notebook: { name, source, sourceUrl, description, tags }, notes: [{ title, content, contentFormat, sourceType, sourceUrl, videoId, wordCount }] }`
  - Validates the API key from the `Authorization` header
  - Validates all required fields are present in notebook and each note
  - Generates UUIDs for notebook and each note
  - Returns: `{ notebookId, noteIds[], notesStored }`
- Include proper error responses:
  - Missing auth → `401` with code `UNAUTHORIZED`
  - Missing notebook → `400` with code `MISSING_NOTEBOOK`
  - Missing notes → `400` with code `MISSING_NOTES`
  - Invalid note data → `400` with code `INVALID_NOTE`

---

## Story 4.4 — CLI Entry Point & Orchestration

**As a developer, I want a single CLI command to process a YouTube video or playlist end-to-end (fetch → generate notes → push to server).**

### Tasks

**Task 4.4.1 — Build the CLI entry point**
- Create `tools/youtube_cli/main.py`
- Implement a CLI class with the following commands:
  - `process --url <youtube_url>` — Full pipeline: detect video/playlist → fetch transcripts → generate detailed notes → push to server
  - `process --url <youtube_url> --local-only` — Same as above but skip the server push (save locally only)
  - `push --notebook-dir <path> --server-url <url>` — Push a previously-processed notebook to the server
- Auto-detect whether the URL is a single video or a playlist
- For playlists: process videos one-at-a-time sequentially, showing progress via `rich` library
- Use `argparse` or `click` for CLI argument parsing

**Task 4.4.2 — Build the CLI configuration**
- Create `tools/youtube_cli/config.py`
- Define named constants:
  - `GEMINI_MODEL_NAME = "gemini-2.0-flash"`
  - `GEMINI_REQUEST_DELAY_SECONDS = 4`
  - `MAX_RETRIES = 3`
  - `TRANSCRIPT_CACHE_DIR = "~/.synapse-sync/transcript_cache"`
  - `LOCAL_NOTES_DIR = "~/.synapse-sync/processed_notes"`
  - `DEFAULT_LANGUAGE = "en"`
- Read environment variables: `GEMINI_API_KEY`, `YOUTUBE_NOTES_API_KEY`, `SYNAPSE_SERVER_URL`

**Task 4.4.3 — Add progress display**
- Use the `rich` library for CLI output:
  - Show a progress bar during playlist processing: `[3/20] Processing: Lecture 3 - Linear Regression`
  - Show status per video: ✅ completed, ⏳ in progress, ⏸ pending, ❌ failed
  - Display a summary table at the end: total videos, successful, failed, total word count
  - Show estimated time remaining based on average processing time per video

---

## Story 4.5 — PWA YouTube Notes Viewer

**As a user, I want to view the detailed notes generated by the local CLI tool in the PWA.**

### Tasks

**Task 4.5.1 — Update the YouTube page to display server-pushed notes**
- Update `src/app/youtube/page.tsx`
- UI sections:
  - List all YouTube notebooks (fetched from the server via `/api/youtube-notes`)
  - Show notebook details: name, source playlist URL, video count, created date
  - Navigate to individual note reader view for each video's detailed notes
  - Manual paste fallback section (for individual videos not processed locally)

**Task 4.5.2 — Build the `YouTubeNotesViewer` component**
- Create `src/components/youtube/YouTubeNotesViewer.tsx`
- Displays a list of YouTube notebooks with:
  - Notebook title and source playlist link
  - Number of notes / videos
  - List of individual video notes (title + word count)
  - Click to open in the standard NoteReader view

**Task 4.5.3 — Preserve the manual transcript paste fallback**
- Keep `src/components/youtube/TranscriptPaster.tsx`
- Shows a text area where the user can manually paste a transcript for individual videos
- "Submit" button sends the pasted text to `/api/summarize` (server-side Gemini processing)
- This serves as a fallback for one-off videos not processed via the local CLI

---

## Story 4.6 — YouTube URL Utilities

**As a developer, I need helper functions to parse and validate YouTube URLs (used by both the local CLI and the frontend).**

### Tasks

**Task 4.6.1 — Create the YouTube URL utility class (Python — for CLI)**
- Create `tools/youtube_cli/url_utils.py`
- Methods:
  - `is_video_url(url)` — returns `True` if the URL points to a single YouTube video
  - `is_playlist_url(url)` — returns `True` if the URL points to a playlist
  - `extract_video_id(url)` — extracts the 11-char video ID from various URL formats
  - `extract_playlist_id(url)` — extracts the playlist ID
  - `build_video_url(video_id)` — constructs a canonical YouTube video URL
- Handle all common URL patterns: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/playlist?list=`, and bare video IDs

**Task 4.6.2 — Create the YouTube URL utility class (TypeScript — for frontend)**
- Create `src/lib/utils/youtube.ts`
- Same methods as the Python version, adapted for TypeScript
- Used by the PWA for display purposes (showing video links, etc.)

---

## Definition of Done

- [ ] Local CLI tool can process a single YouTube video URL → fetch transcript → generate detailed notes → push to server
- [ ] Local CLI tool can process a playlist URL → create one notebook → one detailed note per video → push to server
- [ ] CLI shows progress output during playlist processing (video X of Y, status per video)
- [ ] Transcripts are cached locally — re-processing the same video doesn't re-fetch from YouTube
- [ ] Gemini generates **detailed, comprehensive notes** (not summaries) — capturing every concept, definition, example, and explanation
- [ ] `/api/youtube-notes` endpoint receives and stores notes from the local CLI
- [ ] PWA displays YouTube notebooks and their detailed notes in the reader view
- [ ] If manual paste fallback is used in the PWA, `/api/summarize` generates detailed notes (not summaries)
- [ ] All error states have user-friendly messages (CLI and PWA)
- [ ] Notes are saved with `sourceType: 'youtube_transcript'` and include the video URL
- [ ] All Python code follows coding standards: OOP, ≤20-line methods, ≤500-line files, type hints, docstrings
- [ ] 90%+ test coverage with pytest
- [ ] Local CI passes (ruff + mypy + pytest)
