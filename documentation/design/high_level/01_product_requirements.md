# SynapseSync — Product Requirements Document (PRD)

> **Version:** 1.0  
> **Date:** 2026-09-10  
> **Status:** Draft  

---

## 1. Product Vision

SynapseSync is an **AI-powered, offline-first study companion** that unifies note management, quiz generation, and spaced-repetition learning into a single cross-platform Progressive Web App. It bridges the gap between laptop study sessions and mobile-on-the-go review by connecting to OneDrive for document access and leveraging Google Gemini for intelligent content processing.

---

## 2. Target User

| Attribute        | Detail                                                                 |
|:-----------------|:-----------------------------------------------------------------------|
| **Primary User** | Self-directed learner (student, professional, lifelong learner)        |
| **Devices**      | Laptop (primary study) + Smartphone (review while traveling)           |
| **Content**      | Word documents (.docx) stored on OneDrive, YouTube lecture playlists   |
| **Pain Points**  | Cumbersome mobile access to notes; no active recall tools; no offline support |

---

## 3. Core Features

### 3.1 OneDrive Integration & Note Management

| ID    | Requirement                                                                                     | Priority |
|:------|:------------------------------------------------------------------------------------------------|:---------|
| NM-01 | OAuth 2.0 (PKCE) login with Microsoft via MSAL.js — no client secret required                  | P0       |
| NM-02 | Browse OneDrive files/folders and select `.docx` or `.md` files to import                       | P0       |
| NM-03 | Extract text from `.docx` using Python `zipfile` + `xml.etree` (zero external deps)            | P0       |
| NM-04 | Support Markdown (`.md`) files as a first-class alternative to `.docx`                         | P0       |
| NM-05 | Display imported notes in a clean, mobile-friendly reader view                                  | P0       |
| NM-06 | Organize notes into **Notebooks** (folders) with tags                                           | P1       |
| NM-07 | Full-text search across all cached notes                                                        | P1       |
| NM-08 | Edit / annotate notes inline and sync changes back to OneDrive                                  | P2       |

### 3.2 YouTube Transcript Ingestion

| ID    | Requirement                                                                                     | Priority |
|:------|:------------------------------------------------------------------------------------------------|:---------|
| YT-01 | **Primary path:** Accept a single YouTube URL → fetch transcript via Next.js API route (Node.js) using `youtube-transcript` npm package | P0       |
| YT-02 | **Fallback path:** Allow user to manually paste a transcript (for when server-side fetch is blocked) | P0       |
| YT-03 | Accept a YouTube playlist URL → resolve individual video URLs on the frontend                   | P0       |
| YT-04 | Process playlist videos **one at a time** (micro-request pattern) to stay within 60 s timeout   | P0       |
| YT-05 | Summarize each transcript into structured notes via Gemini                                      | P0       |
| YT-06 | Auto-create one Notebook per playlist, one note per video                                       | P1       |
| YT-07 | Show progress indicator during playlist ingestion                                               | P1       |
| YT-08 | Implement retry logic + exponential backoff for transient IP blocking                           | P1       |
| YT-09 | Cache fetched transcripts in IndexedDB — never re-fetch the same video                          | P1       |

### 3.3 AI-Powered Quiz & Flashcard Generation

| ID    | Requirement                                                                                     | Priority |
|:------|:------------------------------------------------------------------------------------------------|:---------|
| QZ-01 | Generate 5 MCQs + 5 flashcards from a note's text using Gemini structured output (JSON schema) | P0       |
| QZ-02 | User can regenerate quizzes on demand (re-roll)                                                 | P1       |
| QZ-03 | User can manually create / edit / delete flashcards and MCQs                                    | P1       |
| QZ-04 | MCQ interface: show question → 4 options → immediate feedback with explanation                  | P0       |
| QZ-05 | Flashcard interface: show front → tap to reveal back → self-rate recall quality (0-5)           | P0       |

### 3.4 Spaced Repetition System (SM-2)

| ID    | Requirement                                                                                     | Priority |
|:------|:------------------------------------------------------------------------------------------------|:---------|
| SR-01 | Implement the SuperMemo SM-2 algorithm per card (track `n`, `EF`, `interval`, `nextReviewDate`) | P0       |
| SR-02 | Daily "Review Queue" — surface all cards due today, sorted by urgency                           | P0       |
| SR-03 | After each review, update SM-2 parameters based on user's quality rating (0-5)                  | P0       |
| SR-04 | Dashboard showing: cards due today, streak count, mastery progress per notebook                 | P1       |
| SR-05 | Push notification (via PWA) when cards are due                                                   | P2       |

### 3.5 AI Study Assistant (Chat)

| ID    | Requirement                                                                                     | Priority |
|:------|:------------------------------------------------------------------------------------------------|:---------|
| AI-01 | Contextual Q&A: ask clarifying questions about the currently viewed note                        | P0       |
| AI-02 | "Explain Like I'm 5" mode for complex topics                                                    | P1       |
| AI-03 | Suggest related topics / further reading based on note content                                   | P2       |
| AI-04 | Conversation history stored locally per note                                                     | P1       |

### 3.6 Offline-First & PWA

| ID    | Requirement                                                                                     | Priority |
|:------|:------------------------------------------------------------------------------------------------|:---------|
| OL-01 | PWA manifest + Service Worker — installable on phone home screen                                | P0       |
| OL-02 | Cache app shell (HTML/CSS/JS) with cache-first strategy                                         | P0       |
| OL-03 | Store all notes, quizzes, flashcards, and SRS state in **IndexedDB**                           | P0       |
| OL-04 | Full offline study: read notes, take quizzes, review flashcards without connectivity            | P0       |
| OL-05 | **Sync queue**: track offline mutations; replay to server on reconnect                          | P0       |
| OL-06 | Conflict resolution: last-write-wins with timestamp-based merging                               | P1       |
| OL-07 | Background Sync API for automatic replay when connectivity returns                              | P1       |

---

## 4. Additional Features (Suggested Enhancements)

| ID    | Feature                        | Description                                                                                           | Priority |
|:------|:-------------------------------|:------------------------------------------------------------------------------------------------------|:---------|
| EF-01 | **Study Timer (Pomodoro)**     | Built-in Pomodoro timer with session tracking and break reminders                                     | P1       |
| EF-02 | **Progress Analytics**         | Charts showing daily study time, quiz accuracy trends, cards mastered over time                        | P1       |
| EF-03 | **Highlights & Annotations**   | Highlight text in notes; add margin annotations that persist                                          | P2       |
| EF-04 | **Export to PDF / Markdown**   | Export compiled notes and flashcards for sharing                                                      | P2       |
| EF-05 | **Collaborative Notebooks**   | Share a notebook link; others can view (read-only initially)                                          | P3       |
| EF-06 | **Topic Mind Maps**            | Auto-generate visual mind maps from note headings using Gemini                                        | P3       |
| EF-07 | **Voice Notes**                | Record audio → transcribe via browser Speech API → append to note                                    | P3       |
| EF-08 | **Bookmark YouTube Timestamps**| Pin specific timestamps in YouTube transcripts as review markers                                      | P2       |
| EF-09 | **Quiz Difficulty Levels**     | Let Gemini generate easy / medium / hard quizzes based on user's SRS performance                     | P2       |
| EF-10 | **Dark / Light Theme**         | User-selectable theme with system-preference detection                                                | P0       |

---

## 5. Platform & Technology Constraints

### 5.1 Hosting: Vercel Free Tier (Hobby)

| Constraint                  | Limit                                       | Mitigation                                              |
|:----------------------------|:--------------------------------------------|:--------------------------------------------------------|
| Function execution timeout  | **60 seconds** max                          | Micro-request pattern; one video/doc per API call       |
| Memory                      | 2 GB / 1 vCPU per function                  | Lightweight parsing (stdlib only for docx)              |
| Bundle size                 | 500 MB uncompressed                         | Minimal dependencies in Python functions                |
| Monthly CPU time            | 4 hours                                     | Offload heavy logic to client; cache aggressively       |
| Function invocations        | 1M / month                                  | Client-side caching reduces repeat calls                |
| Stateless execution         | No persistent storage between invocations   | Auth tokens in browser; data in IndexedDB               |
| Non-commercial use only     | Personal projects only                      | ✅ Compliant — personal study tool                      |

### 5.2 AI: Google Gemini Free Tier

| Constraint            | Limit (approximate)          | Mitigation                                                  |
|:----------------------|:-----------------------------|:------------------------------------------------------------|
| RPM (Flash models)    | ~15-30 RPM                   | Queue requests; debounce user actions                       |
| RPD                   | ~1,000-1,500 / day           | Cache generated quizzes; avoid re-generation                |
| TPM                   | ~250K-1M tokens/min          | Chunk large documents before sending to Gemini              |
| Data usage policy     | Inputs may be used by Google | No sensitive/PII data; only study content                   |
| Structured output     | ✅ Supported (JSON schema)   | Use `response_mime_type: "application/json"` + schema       |

### 5.3 OneDrive: Microsoft Graph API

| Constraint         | Detail                                        |
|:-------------------|:----------------------------------------------|
| Authentication     | OAuth 2.0 Authorization Code + PKCE via MSAL.js |
| Token storage      | Browser `localStorage` (public client — no secret) |
| Scopes needed      | `Files.Read`, `Files.ReadWrite`, `User.Read`  |
| Throttling         | 429 responses with `retry-after` header       |
| Cost               | Free (included with Microsoft account)        |

### 5.4 YouTube Transcripts

| Constraint            | Detail                                        | Mitigation                                    |
|:----------------------|:----------------------------------------------|:----------------------------------------------|
| Library               | `youtube-transcript` (Node.js npm package)    | Runs in Next.js API route (same Vercel deploy)|
| CORS restriction      | Browser **cannot** fetch YouTube directly (CORS blocked) | Must proxy through server-side API route  |
| Cloud IP blocking     | YouTube may block Vercel data-center IPs      | Retry + backoff; manual paste fallback; cache transcripts in IndexedDB |
| Timeout               | Long playlists exceed 60 s                    | Frontend loops one-video-at-a-time            |
| Python `youtube-transcript-api` | Originally planned; still available as alternative | Can be used if Node.js route is insufficient; deployed as `/api/transcript.py` |

---

## 6. Non-Functional Requirements

| Category         | Requirement                                                                 |
|:-----------------|:----------------------------------------------------------------------------|
| **Performance**  | First Contentful Paint < 2 s; Time to Interactive < 3 s                    |
| **Responsiveness** | Fully responsive: 320px (phone) to 2560px (ultrawide)                    |
| **Accessibility** | WCAG 2.1 AA compliance; keyboard navigation; screen reader support        |
| **Security**     | No server-side token storage; PKCE for OAuth; HTTPS only                   |
| **Privacy**      | Notes never stored on our servers; only transient processing in functions   |
| **Reliability**  | Graceful degradation when offline; clear error states for API failures      |

---

## 7. User Stories

### Epic: Note Management
- **US-01**: As a student, I want to connect my OneDrive account so I can access my study notes from any device.
- **US-02**: As a student, I want to import a Word document and read it in a clean, distraction-free format on my phone.
- **US-03**: As a student, I want to organize my notes into notebooks so I can study one subject at a time.

### Epic: YouTube Learning
- **US-04**: As a student, I want to paste a YouTube video link and get structured study notes from the lecture.
- **US-05**: As a student, I want to paste a playlist link (e.g., Stanford AI lectures) and have it create a notebook with one note per video.
- **US-06**: As a student, I want to see a progress bar while a playlist is being processed.

### Epic: Active Recall
- **US-07**: As a student, I want AI-generated flashcards and MCQs so I can test my understanding without manual effort.
- **US-08**: As a student, I want to take a quiz on a specific note and get immediate feedback on my answers.
- **US-09**: As a student, I want the app to re-surface cards I struggle with using spaced repetition.

### Epic: Offline Study
- **US-10**: As a commuter, I want to study my notes and do flashcard reviews during my subway ride with no internet.
- **US-11**: As a traveler, I want my quiz results to sync automatically when I reconnect to WiFi.

### Epic: AI Assistant
- **US-12**: As a student, I want to ask clarifying questions about a confusing paragraph and get an AI explanation.
- **US-13**: As a student, I want the AI to simplify complex topics using analogies.

---

## 8. Success Metrics

| Metric                        | Target               |
|:------------------------------|:----------------------|
| Daily Active Study Sessions   | ≥ 1 per day (personal use) |
| Offline Quiz Completion Rate  | 100% functional offline     |
| Quiz Generation Latency       | < 10 seconds per note       |
| Transcript Processing         | < 15 seconds per video      |
| PWA Lighthouse Score          | ≥ 90                        |

---

## 9. Out of Scope (v1)

- Real-time collaborative editing
- Native mobile apps (iOS / Android)
- Server-side database (all state in IndexedDB + OneDrive)
- Paid tier features or monetization
- Support for file formats beyond `.docx` and `.md`
- Integration with LMS platforms (Canvas, Blackboard)
