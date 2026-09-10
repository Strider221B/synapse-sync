# SynapseSync — System Architecture Document

> **Version:** 1.0  
> **Date:** 2026-09-10  
> **Status:** Draft  

---

## 1. Architecture Overview

SynapseSync follows an **offline-first, client-heavy architecture** where the browser (PWA) is the primary runtime and Vercel Python serverless functions serve as lightweight, stateless processing endpoints.

```mermaid
graph TB
    subgraph "User Devices"
        LAPTOP["🖥️ Laptop Browser"]
        PHONE["📱 Phone Browser (PWA)"]
    end

    subgraph "Vercel Edge Network"
        CDN["Vercel CDN<br/>Static Assets + App Shell"]
    end

    subgraph "Vercel Serverless — Node.js (Next.js API Routes)"
        FN_TRANSCRIPT["/api/transcript<br/>YouTube Transcript Fetcher<br/>(youtube-transcript npm)"]
        FN_PLAYLIST["/api/playlist-info<br/>YouTube Playlist Resolver"]
    end

    subgraph "Vercel Serverless — Python Functions"
        FN_PARSE["/api/parse-docx<br/>Document Parser"]
        FN_QUIZ["/api/generate-quiz<br/>Quiz Generator"]
        FN_SUMMARIZE["/api/summarize<br/>Note Summarizer"]
        FN_CHAT["/api/chat<br/>AI Study Assistant"]
    end

    subgraph "External Services"
        ONEDRIVE["Microsoft OneDrive<br/>(Graph API)"]
        GEMINI["Google Gemini API<br/>(Free Tier)"]
        YOUTUBE["YouTube<br/>(Transcript Scraping)"]
    end

    subgraph "Client-Side Storage"
        IDB["IndexedDB<br/>(Notes, Quizzes, SRS State)"]
        SW["Service Worker<br/>(App Shell Cache)"]
        LS["localStorage<br/>(Auth Tokens, Preferences)"]
    end

    LAPTOP --> CDN
    PHONE --> CDN
    CDN --> LAPTOP
    CDN --> PHONE

    LAPTOP --> FN_TRANSCRIPT
    LAPTOP --> FN_PLAYLIST
    LAPTOP --> FN_PARSE
    LAPTOP --> FN_QUIZ
    LAPTOP --> FN_SUMMARIZE
    LAPTOP --> FN_CHAT

    FN_TRANSCRIPT --> YOUTUBE
    FN_PLAYLIST --> YOUTUBE
    FN_QUIZ --> GEMINI
    FN_SUMMARIZE --> GEMINI
    FN_CHAT --> GEMINI

    LAPTOP --> ONEDRIVE
    PHONE --> ONEDRIVE

    LAPTOP --- IDB
    LAPTOP --- SW
    LAPTOP --- LS
    PHONE --- IDB
    PHONE --- SW
    PHONE --- LS
```

---

## 2. Architectural Principles

| Principle                    | Rationale                                                                |
|:-----------------------------|:-------------------------------------------------------------------------|
| **Offline-First**            | User travels frequently; IndexedDB is the source of truth               |
| **Client-Heavy / Server-Thin** | Vercel free tier has strict limits; minimize server work                |
| **Stateless Backend**        | Serverless functions have no persistent memory between invocations       |
| **Micro-Request Pattern**    | Every API call must complete within 60 seconds; one unit of work per call|
| **Progressive Enhancement**  | Core features work offline; AI features enhance when online              |

---

## 3. Component Architecture

### 3.1 Frontend: Next.js (React) PWA

The frontend is a **Next.js application** deployed to Vercel as static/SSR pages. It handles all user interaction, state management, and offline capabilities.

```mermaid
graph LR
    subgraph "Next.js Frontend"
        direction TB
        PAGES["Pages / Routes"]
        
        subgraph "Feature Modules"
            NOTES["Notes Module"]
            QUIZ["Quiz Module"]
            SRS["SRS Engine (SM-2)"]
            YT["YouTube Ingestion"]
            CHAT["AI Chat"]
            ONDRIVE["OneDrive Connector"]
        end

        subgraph "Core Services"
            IDB_SVC["IndexedDB Service"]
            SYNC_SVC["Sync Queue Service"]
            API_SVC["API Client Service"]
            AUTH_SVC["Auth Service (MSAL.js)"]
        end

        subgraph "PWA Layer"
            MANIFEST["Web App Manifest"]
            SERVICE_WORKER["Service Worker (Serwist)"]
            BG_SYNC["Background Sync Handler"]
        end
    end

    PAGES --> NOTES
    PAGES --> QUIZ
    PAGES --> SRS
    PAGES --> YT
    PAGES --> CHAT
    PAGES --> ONDRIVE

    NOTES --> IDB_SVC
    QUIZ --> IDB_SVC
    SRS --> IDB_SVC
    
    NOTES --> API_SVC
    QUIZ --> API_SVC
    YT --> API_SVC
    CHAT --> API_SVC
    
    ONDRIVE --> AUTH_SVC
    SYNC_SVC --> BG_SYNC
    IDB_SVC --> SYNC_SVC
```

#### Key Frontend Responsibilities

| Responsibility               | Implementation                                                          |
|:-----------------------------|:------------------------------------------------------------------------|
| Authentication               | MSAL.js handles OAuth PKCE flow; tokens in `localStorage`              |
| OneDrive file browsing       | Direct calls to Microsoft Graph API from browser (delegated auth)       |
| Note rendering               | Parse Markdown/extracted text; render with `react-markdown`             |
| Quiz taking & scoring        | Entirely client-side; results stored in IndexedDB                       |
| SM-2 algorithm execution     | Pure client-side computation — no server roundtrip needed               |
| Offline data management      | IndexedDB as primary store; sync queue for pending operations           |
| YouTube playlist orchestration | Frontend loops through video URLs, calling `/api/transcript` per video |

### 3.2 Backend: Hybrid Node.js + Python Serverless Functions

The backend uses a **hybrid runtime strategy**: YouTube transcript fetching runs as a **Next.js API route (Node.js)** using the `youtube-transcript` npm package, while AI processing and document parsing run as **Python serverless functions**.

> [!IMPORTANT]
> **Why Node.js for YouTube transcripts?** Direct client-side browser fetching from YouTube is **blocked by CORS** — browsers refuse cross-origin requests to YouTube's transcript endpoints. The request must be proxied through a server-side route. Using a Next.js API route (Node.js) keeps the transcript logic in the same deployment as the frontend, while still using the user's Vercel deployment as the proxy.

Each function is a **micro-scoped, stateless endpoint** that performs one focused task and returns structured JSON.

```mermaid
graph TD
    subgraph "API Layer — /api/"
        direction TB
        
        subgraph "Document Processing (Python)"
            PARSE["/api/parse-docx<br/>POST • Max 60s<br/>Input: .docx binary<br/>Output: extracted text"]
        end

        subgraph "YouTube Processing (Node.js — Next.js API Routes)"
            TRANSCRIPT["/api/transcript<br/>POST • Max 60s<br/>Input: video_url<br/>Output: transcript text"]
            PLAYLIST["/api/playlist-info<br/>POST • Max 60s<br/>Input: playlist_url<br/>Output: video URL list"]
        end

        subgraph "AI Processing — Gemini (Python)"
            QUIZ_GEN["/api/generate-quiz<br/>POST • Max 60s<br/>Input: text chunk<br/>Output: MCQs + Flashcards JSON"]
            SUMMARIZE_EP["/api/summarize<br/>POST • Max 60s<br/>Input: transcript text<br/>Output: structured notes"]
            CHAT_EP["/api/chat<br/>POST • Max 60s<br/>Input: context + question<br/>Output: AI response"]
        end
    end
```

#### Endpoint Specifications

| Endpoint              | Runtime   | Method | Input                         | Output                          | Gemini? | Max Time |
|:----------------------|:----------|:-------|:------------------------------|:--------------------------------|:--------|:---------|
| `/api/parse-docx`     | Python    | POST   | `.docx` file (multipart)     | `{ text: string }`             | No      | ~5s      |
| `/api/transcript`     | **Node.js** | POST | `{ videoUrl: string }`       | `{ transcript: string, title }` | No      | ~15s     |
| `/api/playlist-info`  | **Node.js** | POST | `{ playlistUrl: string }`    | `{ videos: [{url, title}] }`   | No      | ~10s     |
| `/api/generate-quiz`  | Python    | POST   | `{ text: string }`           | `{ mcqs: [], flashcards: [] }` | Yes     | ~20s     |
| `/api/summarize`      | Python    | POST   | `{ text: string }`           | `{ notes: string }`            | Yes     | ~15s     |
| `/api/chat`           | Python    | POST   | `{ context, question, history }` | `{ answer: string }`       | Yes     | ~10s     |

> [!NOTE]
> **Manual paste fallback:** If the Node.js transcript endpoint fails (due to YouTube IP blocking), the UI provides a text area for users to manually paste a transcript. The raw text is then sent directly to `/api/summarize` for AI processing.

### 3.3 Offline-First Data Layer

```mermaid
graph TB
    subgraph "Online Flow"
        direction LR
        API["Serverless API"] -->|Response| CACHE_FIRST["Cache in IndexedDB First"]
        CACHE_FIRST --> UI_UPDATE["Update UI"]
    end

    subgraph "Offline Flow"
        direction LR
        USER_ACTION["User Action<br/>(quiz, review)"] --> LOCAL_WRITE["Write to IndexedDB"]
        LOCAL_WRITE --> QUEUE["Add to Sync Queue"]
        QUEUE -->|On Reconnect| BG_SYNC_REPLAY["Background Sync<br/>Replay Queue"]
        BG_SYNC_REPLAY --> API_SYNC["Call API / OneDrive"]
    end

    subgraph "IndexedDB Schema"
        direction TB
        NOTEBOOKS[("notebooks<br/>id, name, source, createdAt")]
        NOTES_TBL[("notes<br/>id, notebookId, title, content,<br/>sourceUrl, updatedAt, isSynced")]
        QUIZZES[("quizzes<br/>id, noteId, mcqs[], flashcards[],<br/>generatedAt")]
        SRS_STATE[("srs_cards<br/>id, quizId, cardType, front, back,<br/>repetitions, ef, interval,<br/>nextReview, lastReview")]
        SYNC_QUEUE_TBL[("sync_queue<br/>id, operation, payload,<br/>createdAt, status")]
        CHAT_HIST[("chat_history<br/>id, noteId, messages[],<br/>updatedAt")]
    end

    NOTEBOOKS --> NOTES_TBL
    NOTES_TBL --> QUIZZES
    QUIZZES --> SRS_STATE
```

---

## 4. Authentication Architecture

```mermaid
sequenceDiagram
    participant User
    participant PWA as SynapseSync PWA
    participant MSAL as MSAL.js
    participant Entra as Microsoft Entra ID
    participant Graph as Microsoft Graph API

    User->>PWA: Click "Connect OneDrive"
    PWA->>MSAL: initiate login (PKCE)
    MSAL->>Entra: Authorization Code Request<br/>(with code_challenge)
    Entra->>User: Microsoft Login Page
    User->>Entra: Enter credentials
    Entra->>MSAL: Authorization Code
    MSAL->>Entra: Exchange Code for Tokens<br/>(with code_verifier)
    Entra->>MSAL: Access Token + Refresh Token
    MSAL->>PWA: Store tokens in localStorage

    Note over PWA: All subsequent API calls use<br/>the access token directly

    PWA->>Graph: GET /me/drive/root/children<br/>Authorization: Bearer {token}
    Graph->>PWA: File listing JSON

    Note over PWA: Token refresh happens<br/>automatically via MSAL.js
```

> [!IMPORTANT]
> **No tokens are ever sent to or stored on the Vercel backend.** The browser communicates directly with Microsoft Graph API using delegated permissions. The Python serverless functions never need OneDrive access — the browser downloads file content and sends it to `/api/parse-docx`.

---

## 5. Data Flow Diagrams

### 5.1 OneDrive → Notes Flow

```mermaid
sequenceDiagram
    participant User
    participant PWA
    participant Graph as MS Graph API
    participant API as /api/parse-docx
    participant IDB as IndexedDB

    User->>PWA: Select .docx file from OneDrive picker
    PWA->>Graph: GET /me/drive/items/{id}/content
    Graph->>PWA: Binary .docx file
    PWA->>API: POST /api/parse-docx (file upload)
    API->>API: zipfile + xml.etree extraction
    API->>PWA: { text: "extracted content..." }
    PWA->>IDB: Store note (text, metadata)
    PWA->>User: Display note in reader view
```

### 5.2 YouTube → Notes Flow (Dual-Path)

```mermaid
sequenceDiagram
    participant User
    participant PWA
    participant PL_API as /api/playlist-info (Node.js)
    participant TR_API as /api/transcript (Node.js)
    participant SUM_API as /api/summarize (Python)
    participant IDB as IndexedDB

    User->>PWA: Paste playlist URL
    PWA->>PL_API: POST { playlistUrl }
    PL_API->>PWA: { videos: [{url, title}, ...] }
    PWA->>IDB: Create notebook + check cached transcripts

    loop For each video (sequential)
        PWA->>IDB: Check transcript cache
        alt Cached transcript exists
            IDB->>PWA: Return cached transcript
        else Not cached — fetch from server
            PWA->>TR_API: POST { videoUrl }
            alt Success
                TR_API->>PWA: { transcript, title }
                PWA->>IDB: Cache transcript
            else Blocked (429/403)
                TR_API->>PWA: Error: REQUEST_BLOCKED
                PWA->>User: "Auto-fetch failed. Paste transcript manually?"
                User->>PWA: Pastes transcript text
            end
        end
        PWA->>SUM_API: POST { text: transcript }
        SUM_API->>PWA: { notes: "structured summary" }
        PWA->>IDB: Store note in notebook
        PWA->>User: Update progress (3/15 videos...)
    end

    PWA->>User: "Notebook ready! 15 notes created."
```

### 5.3 Quiz Generation & SRS Flow

```mermaid
sequenceDiagram
    participant User
    participant PWA
    participant QZ_API as /api/generate-quiz
    participant SM2 as SM-2 Engine (Client)
    participant IDB as IndexedDB

    User->>PWA: Open note → "Generate Quiz"
    PWA->>QZ_API: POST { text: note.content }
    QZ_API->>QZ_API: Call Gemini with JSON schema
    QZ_API->>PWA: { mcqs: [...], flashcards: [...] }
    PWA->>IDB: Store quiz + initialize SRS cards (EF=2.5, n=0)

    Note over PWA: Later... user opens "Review Queue"

    PWA->>IDB: Query cards WHERE nextReview <= today
    IDB->>PWA: Due cards list
    
    loop For each due card
        PWA->>User: Show card (front)
        User->>PWA: Reveal → Rate quality (0-5)
        PWA->>SM2: updateSM2(card, quality)
        SM2->>PWA: { newEF, newInterval, nextReview }
        PWA->>IDB: Update SRS card state
    end
```

---

## 6. Project Structure

```
synapse-sync/
├── api/                              # Vercel Python Serverless Functions
│   ├── parse_docx.py                 # .docx text extraction
│   ├── generate_quiz.py              # Gemini quiz generation
│   ├── summarize.py                  # Gemini note summarization
│   ├── chat.py                       # Gemini study assistant
│   └── requirements.txt              # Python dependencies
│
├── src/                              # Next.js Frontend Source
│   ├── app/                          # App Router pages
│   │   ├── layout.tsx                # Root layout + PWA meta
│   │   ├── page.tsx                  # Dashboard / Home
│   │   ├── api/                      # Next.js API Routes (Node.js)
│   │   │   ├── transcript/
│   │   │   │   └── route.ts          # YouTube transcript fetcher (Node.js)
│   │   │   └── playlist-info/
│   │   │       └── route.ts          # YouTube playlist resolver (Node.js)
│   │   ├── notes/
│   │   │   ├── page.tsx              # Notes listing
│   │   │   └── [id]/page.tsx         # Note reader view
│   │   ├── quiz/
│   │   │   ├── page.tsx              # Quiz selection
│   │   │   └── [id]/page.tsx         # Quiz taking interface
│   │   ├── review/
│   │   │   └── page.tsx              # SRS daily review queue
│   │   ├── youtube/
│   │   │   └── page.tsx              # YouTube import page
│   │   ├── chat/
│   │   │   └── page.tsx              # AI study assistant
│   │   └── settings/
│   │       └── page.tsx              # Settings & OneDrive connection
│   │
│   ├── components/                   # Reusable UI Components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── BottomNav.tsx         # Mobile navigation
│   │   │   └── Header.tsx
│   │   ├── notes/
│   │   │   ├── NoteCard.tsx
│   │   │   ├── NoteReader.tsx
│   │   │   └── OneDrivePicker.tsx
│   │   ├── quiz/
│   │   │   ├── MCQCard.tsx
│   │   │   ├── FlashCard.tsx
│   │   │   └── QuizResults.tsx
│   │   ├── youtube/
│   │   │   ├── PlaylistImporter.tsx   # Playlist URL input + progress
│   │   │   └── TranscriptPaster.tsx   # Manual paste fallback UI
│   │   ├── review/
│   │   │   ├── ReviewCard.tsx
│   │   │   └── ReviewStats.tsx
│   │   └── common/
│   │       ├── ProgressBar.tsx
│   │       ├── SearchBar.tsx
│   │       └── ThemeToggle.tsx
│   │
│   ├── lib/                          # Core Libraries
│   │   ├── db/
│   │   │   ├── indexeddb.ts          # IndexedDB wrapper (idb)
│   │   │   ├── schema.ts            # Database schema definitions
│   │   │   └── sync.ts              # Sync queue management
│   │   ├── srs/
│   │   │   └── sm2.ts               # SM-2 algorithm implementation
│   │   ├── auth/
│   │   │   └── msal.ts              # MSAL.js configuration
│   │   ├── api/
│   │   │   └── client.ts            # API client with retry logic
│   │   └── utils/
│   │       ├── markdown.ts           # Markdown rendering helpers
│   │       └── youtube.ts            # YouTube URL parsing
│   │
│   └── styles/
│       └── globals.css               # Design system tokens + global styles
│
├── public/
│   ├── manifest.json                 # PWA manifest
│   ├── sw.js                         # Service Worker
│   ├── icons/                        # PWA icons (multiple sizes)
│   └── offline.html                  # Offline fallback page
│
├── vercel.json                       # Vercel deployment configuration
├── next.config.js                    # Next.js configuration
├── package.json                      # Includes youtube-transcript npm dep
├── tsconfig.json
└── documentation/
    ├── prompts/
    │   └── 000_high_level.md
    └── design/
        └── high_level/
            ├── 01_product_requirements.md
            ├── 02_system_architecture.md
            ├── 03_data_models.md
            ├── 04_api_specifications.md
            ├── 05_deployment_guide.md
            └── 06_design_overview.md
```

---

## 7. Technology Stack Summary

| Layer                | Technology                  | Justification                                              |
|:---------------------|:----------------------------|:-----------------------------------------------------------|
| **Frontend Framework** | Next.js 14+ (App Router)  | SSR + static generation; native Vercel support             |
| **UI Library**       | React 18+                   | Component-based; massive ecosystem                         |
| **Styling**          | Vanilla CSS (custom properties) | Maximum control; no build-time dependency              |
| **PWA Tooling**      | Serwist (next-pwa successor) | Service Worker management; precaching                    |
| **Offline Storage**  | IndexedDB via `idb`         | Structured client-side storage; large capacity             |
| **Auth Library**     | MSAL.js v2                  | Official Microsoft OAuth library; handles PKCE             |
| **Backend Runtime (AI/Parsing)** | Python 3.12 on Vercel | User requirement; Gemini SDK + docx parsing              |
| **Backend Runtime (YouTube)**    | Node.js (Next.js API Routes) | `youtube-transcript` npm; avoids Python cloud-IP issues |
| **Doc Parsing**      | Python stdlib (`zipfile` + `xml`) | Zero dependencies; fast; reliable                    |
| **YouTube Transcripts** | `youtube-transcript` (npm) + `youtube-transcript-api` (Python fallback) | Dual-path: Node.js primary, Python backup; manual paste fallback |
| **AI Model**         | Google Gemini (Flash)       | Free tier; structured output; fast responses               |
| **Deployment**       | Vercel (Hobby tier)         | Free; auto-deploy from Git; edge CDN                       |

---

## 8. Security Considerations

| Concern                      | Mitigation                                                           |
|:-----------------------------|:---------------------------------------------------------------------|
| OAuth token leakage           | PKCE flow (no client secret); tokens in `localStorage` with expiry  |
| XSS on rendered notes         | Sanitize HTML output from Markdown parser; CSP headers              |
| API endpoint abuse             | Rate limiting via Vercel Edge Middleware; CORS whitelist             |
| Data in transit                | HTTPS enforced by Vercel; all API calls over TLS                    |
| User data privacy              | No server-side storage; notes processed transiently in functions    |
| Gemini data policy             | Free tier: inputs may train models; no PII in study content         |

---

## 9. Scalability & Future Considerations

| Consideration                | Current (v1)                | Future (v2+)                              |
|:-----------------------------|:----------------------------|:------------------------------------------|
| Storage                      | IndexedDB (per-device)      | Supabase / Vercel KV for cross-device sync|
| Auth state                   | Browser localStorage        | Lightweight DB for multi-device sessions  |
| AI model                     | Gemini Free (Flash)         | Gemini Pro / paid tier for heavier tasks  |
| Hosting                      | Vercel Hobby                | Vercel Pro for longer timeouts            |
| Collaboration                | Not supported               | Real-time sync via WebSockets             |
| Mobile                       | PWA                         | React Native or Capacitor wrapper         |
