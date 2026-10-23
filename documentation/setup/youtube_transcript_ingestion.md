# YouTube Transcript Ingestion & Google Drive Setup Guide

> **Target Audience:** Developers, students, and self-hosters ingesting YouTube lectures into SynapseSync.  
> **Last Updated:** October 2026  
> **Python Environment:** `~/python_envs/p313_llm` (Python 3.13)  
> **Destination:** Google Drive (`SynapseSync/`) & Local Offline IndexedDB  

---

## 1. Overview & Architecture

SynapseSync uses a **local-first ingestion pipeline** for YouTube lectures and playlists. This design solves the two major limitations of cloud-based ingestion:
1. **Zero IP Blocking:** YouTube aggressively throttles or blocks cloud datacenter IPs (such as Vercel or AWS). Running transcript fetching locally uses your residential machine IP, which is not blocked.
2. **No Timeout Constraints:** Vercel serverless functions have a 60-second execution limit. Ingesting an entire 20-lecture playlist with detailed, exhaustive note generation takes several minutes, which runs unimpeded on your local machine.
3. **Google Drive as the Sole Source of Truth:** The application server does **not** store any notes, notebooks, or quizzes. The CLI uploads generated notes directly to your dedicated Google Drive folder (`SynapseSync/`). The PWA then synchronizes them directly into your browser's IndexedDB for **100% offline** studying.

```
      YouTube Playlist / Video
                 │
                 ▼ (youtube-transcript-api from residential IP)
      Local Transcript Fetcher (~/.synapse-sync/transcript_cache/)
                 │
                 ▼ (Gemini AI with GEMINI_API_KEY — no 60s timeout)
      Note Generator (Exhaustive Study Notes)
                 │
                 ├──► Local Disk Backup (~/.synapse-sync/processed_notes/)
                 │
                 ▼ (GoogleDrivePusher with GOOGLE_DRIVE_ACCESS_TOKEN)
      Google Drive (⭐ Sole Cloud Source of Truth)
      └── SynapseSync/
          ├── notebooks/notebook_<id>.json
          └── notes/note_<id>.json
                 │
                 ▼ (GoogleDriveSyncService via PWA)
      PWA IndexedDB (Local Offline DB)
      └── Full offline reading, quizzes, and Spaced Repetition (SRS)
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

### 3.3 Gemini API Key
Obtain a free API key from [Google AI Studio](https://aistudio.google.com/):
```bash
export GEMINI_API_KEY="AIzaSy..."
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

### 5.1 Ingest a Single Video
```bash
python tools/youtube_cli/main.py process --url "https://www.youtube.com/watch?v=jGwO_UgTS7I"
```

### 5.2 Ingest an Entire Playlist
To process a multi-lecture series (e.g. Stanford CS229):
```bash
python tools/youtube_cli/main.py process --url "https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU"
```
The CLI displays real-time sequential progress with a summary table upon completion:
```
Resolving playlist: https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU
[1/20] ⏳ In progress: Lecture 1 - Welcome | Stanford CS229
[1/20] ✅ Completed: Lecture 1 - Welcome | Stanford CS229
[2/20] ⏳ In progress: Lecture 2 - Linear Regression
[2/20] ✅ Completed: Lecture 2 - Linear Regression
...
Saved to Google Drive: 20 notes stored.
```

### 5.3 Local-Only Execution
Skip remote upload and store notes solely on your local filesystem:
```bash
python tools/youtube_cli/main.py process --url "https://www.youtube.com/watch?v=..." --local-only
```
Notes are saved to: `~/.synapse-sync/processed_notes/<Notebook_Name>/`

### 5.4 Push a Previously Processed Notebook
To upload a previously generated local notebook directory to Google Drive:
```bash
python tools/youtube_cli/main.py push --notebook-dir ~/.synapse-sync/processed_notes/Stanford_CS229
```

### 5.5 Custom Dedicated Folder Name
By default, notes are uploaded to `SynapseSync/` in your Google Drive root. You can specify a custom dedicated folder:
```bash
python tools/youtube_cli/main.py process --url "<url>" --drive-folder "Stanford_AI_Notes"
```
or via environment variable:
```bash
export GOOGLE_DRIVE_FOLDER_NAME="Stanford_AI_Notes"
```

### 5.6 CLI Reference & Options Table

#### `process` Command Options
| Option / Flag | Environment Variable | Default | Description |
|:---|:---|:---|:---|
| `--url <url>` | — | *(Required)* | YouTube video URL or playlist URL to ingest. |
| `--drive-token <token>` | `GOOGLE_DRIVE_ACCESS_TOKEN` | `""` | Google OAuth Bearer access token. |
| `--drive-folder <name>` | `GOOGLE_DRIVE_FOLDER_NAME` | `SynapseSync` | Target folder name in Google Drive root. |
| `--local-only` | — | `False` | Skip Drive upload; save solely to local disk. |
| `--output-dir <path>` | — | `~/.synapse-sync/processed_notes` | Local directory for note JSON backups. |
| `--cache-dir <path>` | — | `~/.synapse-sync/transcript_cache` | Local directory for raw transcript cache. |
| `--model <name>` | — | `gemini-3.8-flash` | Gemini model used for note generation. |

#### `push` Command Options
| Option / Flag | Environment Variable | Default | Description |
|:---|:---|:---|:---|
| `--notebook-dir <path>` | — | *(Required)* | Path to directory containing `notebook.json` and `notes.json`. |
| `--drive-token <token>` | `GOOGLE_DRIVE_ACCESS_TOKEN` | `""` | Google OAuth Bearer access token. |
| `--drive-folder <name>` | `GOOGLE_DRIVE_FOLDER_NAME` | `SynapseSync` | Target folder name in Google Drive root. |

---

## 6. Google Drive Storage Layout

The `GoogleDrivePusher` organizes files in Google Drive so they are automatically detected by the PWA's `GoogleDriveSyncService`:

```
My Google Drive/
└── SynapseSync/                  # Target folder (default)
    ├── notebooks/
    │   ├── notebook_nb_101.json  # Playlist / course metadata
    │   └── notebook_nb_102.json
    └── notes/
        ├── note_n_201.json       # Individual lecture detailed notes
        ├── note_n_202.json
        └── note_n_203.json
```

### Note Record JSON Structure
Each `note_<id>.json` contains the full lecture study note matching the application schema:
```json
{
  "id": "note_550e8400-e29b-41d4-a716-446655440000",
  "notebookId": "nb_12345678-abcd-1234-abcd-123456789abc",
  "title": "Stanford CS229: Lecture 1 - Machine Learning Introduction",
  "content": "# Lecture 1: Machine Learning Introduction\n\n## 1. What is Machine Learning?\n...",
  "contentFormat": "markdown",
  "sourceType": "youtube_transcript",
  "sourceUrl": "https://www.youtube.com/watch?v=jGwO_UgTS7I",
  "wordCount": 8540,
  "createdAt": "2026-10-22T04:30:00.000Z",
  "updatedAt": "2026-10-22T04:30:00.000Z",
  "isSynced": true
}
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

## 8. Manual Transcript Paste Fallback (In-App)

For one-off videos where running the CLI is unnecessary:
1. In the PWA, visit `/youtube`.
2. Click the **📝 Manual Transcript Paste** tab.
3. Paste the raw transcript text and optional video URL/title.
4. Click **✨ Generate Detailed Study Notes**.
5. The web app calls the `/api/summarize` Gemini endpoint, formats the study note, saves it to IndexedDB, and queues it to sync to your Google Drive automatically.

---

## 9. Troubleshooting & FAQ

### "Authentication failed (401 Unauthorized)"
* **Cause:** Your Google Drive access token has expired (Google access tokens usually expire after 60 minutes).
* **Fix:** Refresh the PWA page, ensure you are signed in, run `localStorage.getItem('synapse_gdrive_token')` in DevTools, and re-export `GOOGLE_DRIVE_ACCESS_TOKEN`.

### "TranscriptsDisabledError: Subtitles are disabled for this video"
* **Cause:** The YouTube video creator did not enable English subtitles or auto-captions.
* **Fix:** Use the **Manual Transcript Paste** tab in the PWA by copying captions from an external transcript tool or course syllabus.

### Where are transcripts cached locally?
* Transcripts are cached at `~/.synapse-sync/transcript_cache/<video_id>.json`.
* If you want to force a re-fetch of captions from YouTube, delete the corresponding JSON file from that directory.

### Where are local notes stored?
* Local notes are stored at `~/.synapse-sync/processed_notes/<Notebook_Name>/`.
* Each folder contains `notebook.json` and `notes.json`.
