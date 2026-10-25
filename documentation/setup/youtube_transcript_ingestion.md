# YouTube Transcript Ingestion & Google Drive Setup Guide

> **Target Audience:** Developers, students, and self-hosters ingesting YouTube lectures into SynapseSync.  
> **Last Updated:** October 2026  
> **Python Environment:** `~/python_envs/p313_llm` (Python 3.13)  
> **Destination:** Google Drive (`SynapseSync/`), Local Markdown Files, & Offline IndexedDB  

---

## 1. Overview & Architecture

SynapseSync uses an **incremental, local-first ingestion pipeline** for YouTube lectures and playlists. This design solves the major limitations of cloud-based ingestion:
1. **Zero IP Blocking:** YouTube aggressively throttles or blocks cloud datacenter IPs (such as Vercel or AWS). Running transcript fetching locally uses your residential machine IP, which is not blocked.
2. **Fast Transcript Download by Default (Zero Quota):** By default, running `process` downloads and caches raw YouTube transcripts locally at high speed without making Gemini API calls or consuming rate limits.
3. **Optional Gemini Note Generation (`--generate-notes`):** Pass `--generate-notes` (or `--with-gemini`) to transform transcripts into comprehensive Markdown notes.
4. **Immediate Incremental Persistence:** Notes are **not** accumulated in-memory to be dumped at the end. After **each individual video** finishes note generation, it is immediately written to disk (in `notes.json`, `notebook.json`, and human-readable `.md` files), recorded in `state.json`, and pushed to Google Drive. Even if you press `Ctrl+C` or lose power midway through a 30-lecture series, zero completed work is lost.
5. **Resilient Auto-Retries (5xx vs 4xx):** Transient Gemini server errors (`503 UNAVAILABLE`, `High demand`, `500`) are automatically retried with exponential backoff. Non-transient errors (such as daily `429` quota limits) fail gracefully, save state, and allow you to resume later.
6. **Intelligent Resuming:** Re-running the tool on the same playlist automatically detects previously completed lectures and skips them (`⏩ Skipped`), preserving your daily Gemini API quota.
7. **Google Drive as Cloud Source of Truth:** The application server does **not** store any notes or notebooks. The CLI uploads generated notes directly to your dedicated Google Drive folder (`SynapseSync/`). The PWA then synchronizes them directly into your browser's IndexedDB for **100% offline** studying.

```
      YouTube Playlist / Video
                 │
                 ▼ (youtube-transcript-api from residential IP)
      Local Transcript Fetcher (~/.synapse-sync/transcript_cache/<video_id>.json)
                 │
                 ├─────────────────────────────────────────────────┐
                 ▼ [DEFAULT MODE]                                  ▼ [WITH --generate-notes]
      Fast Local Transcript Cache                       Gemini AI Note Generation
      (No API key or quota needed)                      (5xx auto-retry & backoff)
                                                                   │
       ┌───────────────────────────────────────────────────────────┴────────────────────────┐
       │  IMMEDIATELY AFTER EACH VIDEO COMPLETION:                                          │
       │                                                                                    │
       ├──► Local Disk (~/.synapse-sync/processed_notes/<Playlist>/)                        │
       │    ├── state.json                 (Video status: completed/fail)                   │
       │    ├── notebook.json              (Playlist metadata)                              │
       │    ├── notes.json                 (All notes JSON collection)                      │
       │    └── notes/<Lecture_Title>.md   (Readable Markdown files)                        │
       │                                                                                    │
       └──► Google Drive (~/SynapseSync/)                                                   │
            ├── notebooks/notebook_<id>.json                                                │
            └── notes/note_<id>.json                                                        │
                                                                                            │
                 ▼ (GoogleDriveSyncService via PWA)                                        │
      PWA IndexedDB (Local Offline DB)                                                     │
      └── Full offline reading, quizzes, and Spaced Repetition (SRS)                       │
```

---

## 2. Authentication & The "No Client Secret" Principle

### Do I Need a `client_secret`?
**No. You do NOT need a `client_secret`.**

Google OAuth 2.0 strictly enforces security boundaries based on client types:
1. **Public Clients (PWAs, SPAs, and Local CLIs):** These applications run entirely in the browser or developer environment and cannot securely conceal a private secret key. Google forbids storing or exposing `client_secret` in frontend builds or public repositories.
2. **Authorization Flow:** The SynapseSync PWA uses Google Identity Services (GIS) token flow with your `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. When you sign in, Google directly issues an OAuth 2.0 Bearer access token (`ya29.a0...`) with the `https://www.googleapis.com/auth/drive` scope.
3. **Direct Drive REST API v3:** The Python CLI (`tools/youtube_cli`) uses this Bearer token directly in the `Authorization: Bearer <token>` HTTP header against Google Drive REST API endpoints (`https://www.googleapis.com/drive/v3/files` and `https://www.googleapis.com/upload/drive/v3/files`).
4. **Why No Refresh Token in CLI?** Google does not issue offline refresh tokens without a server-side client secret. Access tokens are valid for **60 minutes**, which is more than enough time to ingest long multi-hour playlists. When a token expires, simply copy the latest token from your active PWA session.

---

## 3. Prerequisites

### 3.1 Google Cloud Project & Client ID
If you have not yet configured Google Cloud for SynapseSync:
1. Follow the comprehensive [Google Drive Setup Guide](./google_drive_setup.md) to create your project and enable the Google Drive API.
2. Add your Google account as a **Test User** in the OAuth Consent Screen.
3. Configure your `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `.env.local`.

### 3.2 Python Virtual Environment
Activate the project's Python 3.13 virtual environment:
```bash
source ~/python_envs/p313_llm/bin/activate
```

Install or verify dependencies:
```bash
pip install -r tools/youtube_cli/requirements.txt
# Or with uv:
uv pip install -r tools/youtube_cli/requirements.txt
```

Key dependencies included in `requirements.txt`:
* `youtube-transcript-api>=0.6.0` — Extracts subtitles directly from YouTube without browser automation.
* `google-genai>=0.1.0` — Modern Google GenAI SDK for Gemini note generation.
* `pydantic>=2.0.0` — Validates study note schemas and structured outputs.
* `requests>=2.31.0` — Handles Drive REST API v3 file search, folder creation, and multipart uploads.
* `rich>=13.0.0` — Formatted terminal progress, status icons, and clickable `file://` URIs.

### 3.3 Gemini API Key
Obtain an API key from [Google AI Studio](https://aistudio.google.com/):
```bash
export GEMINI_API_KEY="AIzaSy..."
```
You can also configure this in `.env.local`:
```bash
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-3.8-flash"  # Or gemini-2.5-flash
```

---

## 4. How to Obtain the Google Drive Access Token

To allow the CLI to upload notes directly to your `SynapseSync` Google Drive folder without routing through an intermediate server, provide an active OAuth access token.

### Option A: Copy Token from SynapseSync PWA (Recommended)
1. Open SynapseSync in your browser (e.g. `http://localhost:3000` or your production domain).
2. Connect your Google Drive account via the header button or in **Settings** (`/settings`).
3. Open your browser Developer Tools (**F12** or right-click → **Inspect**), switch to the **Console** tab, and run:
   ```javascript
   localStorage.getItem('synapse_gdrive_token')
   ```
4. Copy the returned token string (it begins with `ya29.`) and export it in your terminal:
   ```bash
   export GOOGLE_DRIVE_ACCESS_TOKEN="ya29.a0AfH..."
   ```

> [!TIP]
> You can also pass the token directly as a CLI argument with `--drive-token "<token>"`.

### Option B: Local-Only Mode (No Google Drive Token Required)
If you want to generate notes immediately on your machine without connecting to Google Drive right away, you can use the `--local-only` flag. Notes will be generated and saved to your local disk, and can be pushed to Google Drive at any time later using the `push` subcommand.

---

## 5. Running the YouTube Ingestion CLI

### 5.1 Default Mode: Fast Transcript Download (Zero Quota)
By default, the `process` command fetches and caches raw video/playlist transcripts locally without calling Gemini. This is extremely fast, does not require a `GEMINI_API_KEY`, and never consumes LLM quota:

```bash
# Ingest transcripts for a single video:
python tools/youtube_cli/main.py process --url "https://www.youtube.com/watch?v=jGwO_UgTS7I"

# Ingest transcripts for an entire playlist:
python tools/youtube_cli/main.py process --url "https://www.youtube.com/playlist?list=PLoROMvodv4rMeDqwS1yFl3j3sR_-MQNEN"
```

Console Output:
```
Resolving playlist: https://www.youtube.com/playlist?list=PLoROMvodv4rMeDqwS1yFl3j3sR_-MQNEN
Playlist directory: file:///home/somesh/.synapse-sync/processed_notes/Stanford_CS221___Autumn_2025
[1/20] 📥 Transcript cached: file:///home/somesh/.synapse-sync/transcript_cache/4Iu4KPVbnAY.json
[2/20] 📥 Transcript cached: file:///home/somesh/.synapse-sync/transcript_cache/ec2rCf4iIqU.json
...
✨ Transcripts downloaded and cached locally!
```

### 5.2 Note Generation with Gemini (`--generate-notes` / `--with-gemini`)
To generate full study notes using Gemini and incrementally push them to Google Drive (or local disk), add `--generate-notes` (or `--with-gemini`):

```bash
python tools/youtube_cli/main.py process \
  --url "https://www.youtube.com/playlist?list=PLoROMvodv4rMeDqwS1yFl3j3sR_-MQNEN" \
  --generate-notes
```

Output:
```
Resolving playlist: https://www.youtube.com/playlist?list=PLoROMvodv4rMeDqwS1yFl3j3sR_-MQNEN
Playlist directory: file:///home/somesh/.synapse-sync/processed_notes/Stanford_CS221___Autumn_2025
[1/20] ⏳ In progress: Stanford CS221 | Autumn 2025 | Lecture 1: Course Overview and AI Foundations
  Transcript cached: file:///home/somesh/.synapse-sync/transcript_cache/4Iu4KPVbnAY.json
  Saved note locally: file:///home/somesh/.synapse-sync/processed_notes/Stanford_CS221___Autumn_2025/notes/Stanford_CS221___Autumn_2025___Lecture_1.md
  Notes collection: file:///home/somesh/.synapse-sync/processed_notes/Stanford_CS221___Autumn_2025/notes.json
  Saved to Google Drive: 1 note(s) stored.
[1/20] ✅ Completed: Stanford CS221 | Autumn 2025 | Lecture 1: Course Overview and AI Foundations
[2/20] ⏳ In progress: Stanford CS221 | Autumn 2025 | Lecture 2: Learning I
  ⚠️ Transient server error: 503 UNAVAILABLE. Retrying in 2.0s (attempt 1/3)...
  Transcript cached: file:///home/somesh/.synapse-sync/transcript_cache/ec2rCf4iIqU.json
  Saved note locally: file:///home/somesh/.synapse-sync/processed_notes/Stanford_CS221___Autumn_2025/notes/Stanford_CS221___Autumn_2025___Lecture_2.md
  Saved to Google Drive: 1 note(s) stored.
[2/20] ✅ Completed: Stanford CS221 | Autumn 2025 | Lecture 2: Learning I
```

### 5.3 Resuming & Retrying Failed Videos

#### Automatic Resume
If an earlier note generation run was stopped (e.g. Ctrl+C or daily quota reached), running `process --generate-notes` again automatically skips already completed videos:
```bash
python tools/youtube_cli/main.py process --url "<playlist_url>" --generate-notes
```
Output:
```
[1/20] ⏩ Skipped: Stanford CS221 | Autumn 2025 | Lecture 1
[2/20] ⏩ Skipped: Stanford CS221 | Autumn 2025 | Lecture 2
[3/20] ⏳ In progress: Stanford CS221 | Autumn 2025 | Lecture 3
```

#### Dedicated `retry` Subcommand
To retry only videos that previously failed:
```bash
# Using the playlist URL:
python tools/youtube_cli/main.py retry --url "https://www.youtube.com/playlist?list=..."

# Or referencing the local notebook directory directly:
python tools/youtube_cli/main.py retry --notebook-dir ~/.synapse-sync/processed_notes/Stanford_CS221___Autumn_2025
```

#### Force Re-generation (`--force`)
If you want to re-generate all lecture notes even if they already exist locally:
```bash
python tools/youtube_cli/main.py process --url "<playlist_url>" --generate-notes --force
```

### 5.4 Local-Only Execution
Skip remote Google Drive upload and store notes solely on your local filesystem:
```bash
python tools/youtube_cli/main.py process --url "https://www.youtube.com/watch?v=..." --generate-notes --local-only
```

### 5.5 Push a Local Notebook (or Manually Edited Notes)
To upload an entire local notebook directory (including any Markdown files you manually added or edited) to Google Drive:
```bash
python tools/youtube_cli/main.py push --notebook-dir ~/.synapse-sync/processed_notes/Stanford_CS221___Autumn_2025
```

### 5.6 CLI Reference & Options Table

#### `process` Command Options
| Option / Flag | Environment Variable | Default | Description |
|:---|:---|:---|:---|
| `--url <url>` | — | *(Required)* | YouTube video URL or playlist URL to ingest. |
| `--generate-notes` / `--with-gemini` | — | `False` | Run Gemini note generation (default is transcript download only). |
| `--force` | — | `False` | Force regenerate notes even if already completed locally. |
| `--retry-failed` | — | `False` | Only process videos that previously failed. |
| `--local-only` | — | `False` | Skip Drive upload; save solely to local disk. |
| `--drive-token <token>` | `GOOGLE_DRIVE_ACCESS_TOKEN` | `""` | Google OAuth Bearer access token. |
| `--drive-folder <name>` | `GOOGLE_DRIVE_FOLDER_NAME` | `SynapseSync` | Target folder name in Google Drive root. |
| `--server-url <url>` | `SYNAPSE_SERVER_URL` | `None` | Optional target backend server URL (legacy). |

#### `retry` Command Options
| Option / Flag | Environment Variable | Default | Description |
|:---|:---|:---|:---|
| `--url <url>` | — | `None` | YouTube playlist URL to retry. |
| `--notebook-dir <path>` | — | `None` | Path to local notebook directory (reads playlist URL from `state.json`). |
| `--local-only` | — | `False` | Skip Drive upload; save solely to local disk. |
| `--drive-token <token>` | `GOOGLE_DRIVE_ACCESS_TOKEN` | `""` | Google OAuth Bearer access token. |
| `--drive-folder <name>` | `GOOGLE_DRIVE_FOLDER_NAME` | `SynapseSync` | Target folder name in Google Drive root. |

#### `push` Command Options
| Option / Flag | Environment Variable | Default | Description |
|:---|:---|:---|:---|
| `--notebook-dir <path>` | — | *(Required)* | Path to directory containing `notebook.json` and `notes.json`. |
| `--drive-token <token>` | `GOOGLE_DRIVE_ACCESS_TOKEN` | `""` | Google OAuth Bearer access token. |
| `--drive-folder <name>` | `GOOGLE_DRIVE_FOLDER_NAME` | `SynapseSync` | Target folder name in Google Drive root. |
| `--server-url <url>` | `SYNAPSE_SERVER_URL` | `None` | Optional target backend server URL (legacy). |

---

## 6. Local Storage & Google Drive Layout

### 6.1 Local Storage Layout (`~/.synapse-sync/`)
```
~/.synapse-sync/
├── transcript_cache/
│   ├── 4Iu4KPVbnAY.json              # Raw cached YouTube captions
│   └── ec2rCf4iIqU.json
└── processed_notes/
    └── Stanford_CS221___Autumn_2025/
        ├── state.json                 # Progress tracking (completed/failed videos)
        ├── notebook.json              # Notebook metadata schema
        ├── notes.json                 # JSON array of all notes for PWA/Drive sync
        └── notes/                     # Human-readable Markdown notes
            ├── 01_Course_Overview.md
            └── 02_Learning_I.md
```

### 6.2 Google Drive Storage Layout
The `GoogleDrivePusher` organizes files in Google Drive so they are automatically detected by the PWA's `GoogleDriveSyncService`:

```
My Google Drive/
└── SynapseSync/                  # Target folder (default)
    ├── notebooks/
    │   └── notebook_nb_101.json  # Playlist / course metadata
    └── notes/
        ├── note_4Iu4KPVbnAY.json # Individual lecture detailed notes
        └── note_ec2rCf4iIqU.json
```

---

## 7. Viewing and Syncing in the PWA

### 7.1 Syncing Ingested Notes
1. Open SynapseSync in your browser (`/youtube`).
2. Navigate to the **📚 Study Notebooks** tab.
3. If not already synced automatically, click **🔄 Sync from Google Drive**.
4. The PWA fetches all `notebook_*.json` and `note_*.json` files directly from your Google Drive `SynapseSync/` folder into **IndexedDB**.
5. The notebook list and lecture selector update immediately with the full list of ingested videos.

### 7.2 Testing 100% Offline Studying
Once notes are synced into IndexedDB, you can verify offline functionality:
1. Open Chrome DevTools (**F12**), switch to the **Network** tab, and select **Offline** from the throttling dropdown (or toggle your computer's Wi-Fi off).
2. Reload the page at `http://localhost:3000/youtube`.
3. Notice the offline status indicator in the app header (**📴 Offline Mode**).
4. Select your ingested notebook and read any lecture note: content renders instantly with zero network requests.
5. Take an active recall quiz or complete daily Spaced Repetition (SRS) cards.
6. The app records your review history, card ease factors, and quiz scores directly into the local IndexedDB sync queue.
7. Reconnect to Wi-Fi (set throttling back to **No throttling** in DevTools).
8. The sync queue automatically drains and synchronizes your updated SRS states and quiz results back to Google Drive!

---

## 8. Note Generation Prompts & Manual / External LLM Workflow

If Gemini encounters a daily quota limit, or if you prefer to use your own LLM (such as Claude 3.5 Sonnet, ChatGPT GPT-4o, DeepSeek, or a local Ollama model like Llama 3), you can generate notes manually from the cached transcripts using the exact prompt and JSON schema used by SynapseSync.

### 8.1 The Note Generation Prompt

#### System Prompt
```text
You are a meticulous note-taker, not a summarizer. Capture EVERY concept, definition, example, analogy, formula, and explanation. The notes should be detailed enough that someone reading only these notes would have a thorough understanding of the topic without needing to watch the original video. Use headings, subheadings, bullet points, numbered lists, bold/italic, and code blocks. Include specific examples, numbers, and data points mentioned in the lecture. Output MUST adhere strictly to the JSON schema.
```

#### User Prompt Template
```text
Video Title: {video_title}

Transcript:
{transcript_text}

Produce exhaustively detailed notes in JSON format.
```

### 8.2 JSON Output Schema
When running external models or API calls, enforce or prompt for this structured JSON schema:

```json
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "description": "Clean video lecture title"
    },
    "summary": {
      "type": "string",
      "description": "Comprehensive high-level summary of the entire lecture"
    },
    "keyPoints": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Key takeaways, core definitions, and pivotal concepts"
    },
    "markdownNotes": {
      "type": "string",
      "description": "Exhaustively detailed Markdown notes formatted with headings, LaTeX formulas ($...$), bold terms, bullet points, and code examples"
    }
  },
  "required": ["title", "summary", "keyPoints", "markdownNotes"]
}
```

### 8.3 Step-by-Step Manual Generation Workflow

1. **Download Transcripts with CLI:**
   ```bash
   python tools/youtube_cli/main.py process --url "https://www.youtube.com/playlist?list=..."
   ```
   This downloads and caches transcripts in `~/.synapse-sync/transcript_cache/<video_id>.json`.

2. **Extract Transcript Text:**
   You can read the `text` fields from the JSON cache file, or use Python:
   ```bash
   python -c "import json; d=json.load(open('$HOME/.synapse-sync/transcript_cache/<video_id>.json')); print(' '.join(s['text'] for s in d['transcript']))" > /tmp/transcript.txt
   ```

3. **Run Through Your Preferred LLM:**
   Paste the System Prompt and User Prompt (with transcript text) into Claude, ChatGPT, or your local model.

4. **Save the Markdown Note:**
   Save the `markdownNotes` content as a `.md` file in the playlist's notes directory:
   ```bash
   ~/.synapse-sync/processed_notes/<playlist_title>/notes/<Lecture_Title>.md
   ```

5. **Push to Google Drive & SynapseSync:**
   Upload your manually generated or edited notes directly to Google Drive:
   ```bash
   python tools/youtube_cli/main.py push --notebook-dir ~/.synapse-sync/processed_notes/<playlist_title>
   ```
   Once pushed, open the SynapseSync PWA and click **🔄 Sync from Google Drive** to enjoy full offline study, quizzes, and SRS cards!

---

## 9. Troubleshooting & FAQ

### "503 UNAVAILABLE: This model is currently experiencing high demand"
* **Behavior:** The CLI automatically catches this transient server error and retries up to 3 times with exponential backoff (2s, 4s, 8s).
* **Fix:** Usually succeeds on the second attempt. If Google's API remains overloaded across all retries, the video is marked as `failed` in `state.json` and you can re-run `python tools/youtube_cli/main.py retry --url "<url>"` a few minutes later.

### "429 RESOURCE_EXHAUSTED: Generate content requests per day limit exceeded on Free Tier"
* **Cause:** The Gemini Free Tier has a daily limit of 20 requests/day for `gemini-3.8-flash`.
* **Fix:**
  1. Wait until the daily quota resets (the error log displays the exact reset duration, e.g. `retryDelay: 10436s`), then run `main.py retry ...`.
  2. Or switch to a different model in `.env.local`:
     ```bash
     GEMINI_MODEL=gemini-2.5-flash
     ```
  3. Or use a paid Gemini API tier key with higher quotas.

### "I pressed Ctrl+C during processing. Did I lose my progress?"
* **Transcripts:** Saved immediately in `~/.synapse-sync/transcript_cache/<video_id>.json`. Zero transcripts are lost.
* **Notes:** Saved immediately on disk and Google Drive after each individual video completes. Any lecture that showed `[x/20] ✅ Completed` is already safely saved on your computer and in your Google Drive.
* Simply run the command again to continue from the first unfinished lecture.

### "Authentication failed (401 Unauthorized)"
* **Cause:** Your Google Drive access token has expired (Google access tokens expire after 60 minutes).
* **Fix:** Refresh the PWA page, ensure you are signed in, run `localStorage.getItem('synapse_gdrive_token')` in DevTools, and re-export `GOOGLE_DRIVE_ACCESS_TOKEN`.

