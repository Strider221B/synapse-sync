# SynapseSync — API Specifications

> **Version:** 1.1  
> **Date:** 2026-10-19  
> **Status:** Draft  

---

## 1. Overview

All API endpoints are **Vercel Python Serverless Functions** deployed under the `/api/` directory. Each function is a self-contained, stateless handler that spins up fresh on every invocation. The server maintains **no persistent note or user data storage**; Google Drive is the sole source of truth. YouTube transcript fetching and detailed note generation run **locally** on the developer's machine via a Python CLI tool; the processed notes are uploaded directly to the user's dedicated Google Drive folder (`SynapseSync/`). The `/api/youtube-notes` endpoint is retained as a legacy endpoint.

### Base URL
- **Production:** `https://synapse-sync.vercel.app/api`
- **Preview:** `https://synapse-sync-{branch}-{hash}.vercel.app/api`
- **Local Dev:** `http://localhost:3000/api`

### Common Headers

| Header           | Value                         | Required |
|:-----------------|:------------------------------|:---------|
| `Content-Type`   | `application/json` or `multipart/form-data` | Yes |
| `Accept`         | `application/json`            | Yes      |

### Common Error Response

```json
{
  "error": {
    "code": "TRANSCRIPT_FETCH_FAILED",
    "message": "Could not fetch transcript for this video. It may not have captions enabled.",
    "details": "TranscriptsDisabled: No transcripts available for video ID xyz"
  }
}
```

| HTTP Status | Meaning                                    |
|:------------|:-------------------------------------------|
| 200         | Success                                    |
| 400         | Bad request (missing/invalid parameters)   |
| 404         | Resource not found                         |
| 429         | Rate limited (Gemini or YouTube)           |
| 500         | Internal server error                      |
| 504         | Function timed out (> 60 seconds)          |

---

## 2. Endpoint Specifications

### 2.1 POST `/api/parse-docx`

Extracts plain text from a `.docx` file using Python's standard library (`zipfile` + `xml.etree`). Zero external dependencies.

#### Request

**Content-Type:** `multipart/form-data`

| Field  | Type   | Required | Description                    |
|:-------|:-------|:---------|:-------------------------------|
| `file` | Binary | Yes      | The `.docx` file to parse      |

#### Response — `200 OK`

```json
{
  "text": "Chapter 1: Introduction\n\nMachine learning is a subset of artificial intelligence...",
  "metadata": {
    "paragraphCount": 47,
    "wordCount": 3842,
    "estimatedReadTimeMinutes": 15
  }
}
```

#### Implementation Notes

```python
# api/parse_docx.py
import zipfile
import xml.etree.ElementTree as ET
import io
import json

WORD_NS = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def handler(request):
    """Parse .docx file and extract text content."""
    if request.method != 'POST':
        return json.dumps({"error": {"code": "METHOD_NOT_ALLOWED", "message": "Use POST"}}), 405
    
    file = request.files.get('file')
    if not file:
        return json.dumps({"error": {"code": "MISSING_FILE", "message": "No file uploaded"}}), 400
    
    try:
        doc = zipfile.ZipFile(io.BytesIO(file.read()))
        xml_content = doc.read('word/document.xml')
        doc.close()
        
        tree = ET.fromstring(xml_content)
        paragraphs = []
        for para in tree.iter(WORD_NS + 'p'):
            texts = [node.text for node in para.iter(WORD_NS + 't') if node.text]
            if texts:
                paragraphs.append(''.join(texts))
        
        full_text = '\n\n'.join(paragraphs)
        word_count = len(full_text.split())
        
        return json.dumps({
            "text": full_text,
            "metadata": {
                "paragraphCount": len(paragraphs),
                "wordCount": word_count,
                "estimatedReadTimeMinutes": max(1, word_count // 250)
            }
        }), 200
    except Exception as e:
        return json.dumps({"error": {"code": "PARSE_FAILED", "message": str(e)}}), 500
```

---

### 2.2 POST `/api/youtube-notes` (Legacy Compatibility Endpoint)

Receives pre-processed YouTube notes from the local CLI tool when `--server-url` is explicitly specified. In the standard architecture, the CLI uploads directly to the user's dedicated Google Drive folder via `GoogleDrivePusher` (`SynapseSync/notebooks/` and `SynapseSync/notes/`), ensuring Google Drive is the sole source of truth and eliminating server-side storage.

> [!NOTE]
> **Preferred Flow:** Run the local CLI with `GOOGLE_DRIVE_ACCESS_TOKEN` to upload directly to Google Drive. The PWA syncs notes directly from Google Drive into IndexedDB. This endpoint is maintained for testing and backward compatibility.

> [!IMPORTANT]
> **This endpoint does NOT fetch transcripts or call Gemini.** All AI processing happens locally on the developer's machine.

#### Request

```json
{
  "notebook": {
    "name": "Stanford CS229: Machine Learning",
    "source": "youtube_playlist",
    "sourceUrl": "https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU",
    "description": "Complete lecture series from Stanford CS229",
    "tags": ["machine-learning", "stanford", "cs229"]
  },
  "notes": [
    {
      "title": "Lecture 1 - Welcome | Stanford CS229",
      "content": "# Lecture 1: Introduction to Machine Learning\n\n## 1. What is Machine Learning?\n\nMachine learning is defined as...\n\n### 1.1 Formal Definition\n\nArthur Samuel (1959) defined machine learning as...\n\n### 1.2 Types of Machine Learning\n\n#### Supervised Learning\n- **Definition:** Learning from labeled training data...\n- **Example:** Given a dataset of house prices with features (size, bedrooms, location)...\n\n#### Unsupervised Learning\n- **Definition:** Finding patterns in unlabeled data...\n\n#### Reinforcement Learning\n- **Definition:** Learning through interaction with an environment...\n\n## 2. Linear Regression\n\n### 2.1 The Hypothesis Function\n\nThe hypothesis function h(x) = θ0 + θ1*x maps inputs to predicted outputs...\n\n### 2.2 Cost Function\n\nThe cost function J(θ) measures how well our hypothesis fits the training data...\n\n(... exhaustively detailed notes continuing for the entire lecture ...)",
      "contentFormat": "markdown",
      "sourceType": "youtube_transcript",
      "sourceUrl": "https://www.youtube.com/watch?v=jGwO_UgTS7I",
      "videoId": "jGwO_UgTS7I",
      "wordCount": 8500
    }
  ]
}
```

| Field              | Type   | Required | Description                                                  |
|:-------------------|:-------|:---------|:-------------------------------------------------------------|
| `notebook`         | object | Yes      | Notebook metadata (name, source, sourceUrl, description, tags) |
| `notes`            | array  | Yes      | Array of processed notes to store                            |
| `notes[].title`    | string | Yes      | Video title                                                  |
| `notes[].content`  | string | Yes      | Detailed markdown notes (generated by Gemini locally)        |
| `notes[].contentFormat` | string | Yes | Always `"markdown"`                                          |
| `notes[].sourceType`    | string | Yes | Always `"youtube_transcript"`                                |
| `notes[].sourceUrl`     | string | Yes | YouTube video URL                                            |
| `notes[].videoId`       | string | Yes | 11-character YouTube video ID                                |
| `notes[].wordCount`     | int    | Yes | Word count of the generated notes                            |

#### Response — `200 OK`

```json
{
  "notebookId": "nb_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "noteIds": [
    "note_11111111-2222-3333-4444-555555555555"
  ],
  "notesStored": 1
}
```

#### Error Scenarios

| Error Code                 | HTTP | When                                           |
|:---------------------------|:-----|:-----------------------------------------------|
| `MISSING_NOTEBOOK`         | 400  | `notebook` field is missing or empty           |
| `MISSING_NOTES`            | 400  | `notes` array is missing or empty              |
| `INVALID_NOTE`             | 400  | A note is missing required fields              |
| `STORAGE_FAILED`           | 500  | Failed to persist the data                     |

---

### 2.3 POST `/api/generate-quiz`

Sends note text to Google Gemini and receives structured MCQs and flashcards. Uses Gemini's structured output mode with a JSON schema to guarantee clean responses.

#### Request

```json
{
  "text": "Machine learning is a subset of artificial intelligence that focuses on...",
  "difficulty": "medium",
  "mcqCount": 5,
  "flashcardCount": 5
}
```

| Field            | Type   | Required | Default    | Description                                             |
|:-----------------|:-------|:---------|:-----------|:--------------------------------------------------------|
| `text`           | string | Yes      | —          | Note content to generate from                           |
| `difficulty`     | string | No       | `"medium"` | `"easy"`, `"medium"`, or `"hard"`                       |
| `mcqCount`       | int    | No       | `5`        | Number of MCQs (1-10)                                   |
| `flashcardCount` | int    | No       | `5`        | Number of flashcards (1-10)                             |
| `throttleSpeed`  | string | No       | `"low"`    | `"low"` (paid plan, 0s delay) or `"high"` (free tier, 4s delay) |

#### Response — `200 OK`

```json
{
  "mcqs": [
    {
      "question": "Which of the following best describes supervised learning?",
      "options": [
        "Learning from labeled training data",
        "Learning without any data",
        "Learning from unlabeled data only",
        "A type of reinforcement learning"
      ],
      "correctIndex": 0,
      "explanation": "Supervised learning uses labeled training data where both input features and desired output are provided to the algorithm."
    }
  ],
  "flashcards": [
    {
      "front": "What is the bias-variance tradeoff?",
      "back": "The bias-variance tradeoff is the balance between a model's ability to minimize bias (error from wrong assumptions) and variance (error from sensitivity to training data fluctuations). Lower bias often means higher variance and vice versa."
    }
  ],
  "metadata": {
    "model": "gemini-3.8-flash",
    "inputTokens": 1250,
    "outputTokens": 890
  }
}
```

#### Implementation Notes

```python
# api/generate_quiz.py
import google.generativeai as genai
import json
import os

genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))

QUIZ_SCHEMA = {
    "type": "object",
    "properties": {
        "mcqs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correctIndex": {"type": "integer"},
                    "explanation": {"type": "string"}
                },
                "required": ["question", "options", "correctIndex", "explanation"]
            }
        },
        "flashcards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "front": {"type": "string"},
                    "back": {"type": "string"}
                },
                "required": ["front", "back"]
            }
        }
    },
    "required": ["mcqs", "flashcards"]
}

SYSTEM_PROMPT = """You are an expert educational content creator. Generate quiz questions 
and flashcards that test deep understanding, not just surface-level recall. 

Rules:
- MCQ questions should have exactly 4 options with one correct answer
- Flashcard fronts should be open-ended questions that require active recall
- Flashcard backs should be concise but complete answers
- All content must be based STRICTLY on the provided text — do not add external knowledge
- Explanations should reference specific concepts from the text
- Difficulty: {difficulty}"""

def handler(request):
    if request.method != 'POST':
        return json.dumps({"error": {"code": "METHOD_NOT_ALLOWED"}}), 405
    
    body = request.get_json()
    text = body.get('text', '')
    difficulty = body.get('difficulty', 'medium')
    mcq_count = min(10, max(1, body.get('mcqCount', 5)))
    flashcard_count = min(10, max(1, body.get('flashcardCount', 5)))
    
    if not text or len(text.strip()) < 50:
        return json.dumps({
            "error": {"code": "TEXT_TOO_SHORT", 
                      "message": "Provide at least 50 characters of text."}
        }), 400
    
    # Chunketize text (like NoteGenerator) to avoid losing content on long documents (up to 100+ pages)
    words = text.split()
    CHUNK_WORDS = 2500
    chunks = [words[i:i + CHUNK_WORDS] for i in range(0, len(words), CHUNK_WORDS)]
    # Generates MCQs and flashcards per chunk and stitches/merges results across all segments
    
    model = genai.GenerativeModel('gemini-3.8-flash')
    
    prompt = f"""{SYSTEM_PROMPT.format(difficulty=difficulty)}

Generate exactly {mcq_count} multiple-choice questions and {flashcard_count} active recall flashcards 
based strictly on the following text:

---
{text}
---"""
    
    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=QUIZ_SCHEMA,
                temperature=0.7,
            )
        )
        
        result = json.loads(response.text)
        result['metadata'] = {
            'model': 'gemini-3.8-flash',
            'inputTokens': response.usage_metadata.prompt_token_count,
            'outputTokens': response.usage_metadata.candidates_token_count
        }
        
        return json.dumps(result), 200
        
    except Exception as e:
        error_msg = str(e)
        if '429' in error_msg or 'RESOURCE_EXHAUSTED' in error_msg:
            return json.dumps({
                "error": {"code": "RATE_LIMITED", 
                          "message": "Gemini API rate limit reached. Try again in a minute."}
            }), 429
        return json.dumps({"error": {"code": "GENERATION_FAILED", "message": error_msg}}), 500
```

---

### 2.4 POST `/api/summarize`

Generates **detailed, comprehensive notes** from a YouTube transcript or long document using Gemini. Used as a server-side fallback when the local CLI tool is not used (e.g., manual transcript paste in the PWA).

> [!IMPORTANT]
> **Detailed notes, not summaries.** Gemini is instructed to capture every concept, definition, example, analogy, formula, and explanation from the source material. The output should be exhaustive enough that a reader can fully understand the topic without referring to the original video or text.

#### Request

```json
{
  "text": "Welcome to lecture 1 of CS229. Today we're going to talk about...",
  "title": "Stanford CS229 - Lecture 1",
  "format": "markdown"
}
```

| Field    | Type   | Required | Default      | Description                            |
|:---------|:-------|:---------|:-------------|:---------------------------------------|
| `text`   | string | Yes      | —            | Raw text (transcript or document)      |
| `title`  | string | No       | Auto-derived | Suggested title for the notes          |
| `format` | string | No       | `"markdown"` | Output format: `"markdown"` or `"plaintext"` |

#### Response — `200 OK`

```json
{
  "title": "Stanford CS229 - Lecture 1: Introduction to Machine Learning",
  "summary": "This lecture introduces the fundamental concepts of machine learning...",
  "keyPoints": [
    "Machine learning is a subset of AI focused on learning from data",
    "Three types: supervised, unsupervised, and reinforcement learning",
    "Linear regression is the foundational supervised learning algorithm"
  ],
  "markdownNotes": "# Lecture 1: Introduction to Machine Learning\n\n## Overview\n...",
  "metadata": {
    "model": "gemini-3.8-flash",
    "inputTokens": 5000,
    "outputTokens": 1200
  }
}
```

### 2.5 POST `/api/chat`

AI study assistant that answers questions about note content. Maintains context through conversation history sent from the client.

#### Request

```json
{
  "noteContext": "Machine learning is a subset of artificial intelligence...",
  "question": "Can you explain the difference between supervised and unsupervised learning with a simple analogy?",
  "conversationHistory": [
    { "role": "user", "content": "What is machine learning?" },
    { "role": "assistant", "content": "Machine learning is..." }
  ],
  "mode": "explain"
}
```

| Field                 | Type     | Required | Default     | Description                                |
|:----------------------|:---------|:---------|:------------|:-------------------------------------------|
| `noteContext`         | string   | Yes      | —           | The note text providing context            |
| `question`            | string   | Yes      | —           | User's question                            |
| `conversationHistory` | array    | No       | `[]`        | Previous messages for context continuity   |
| `mode`                | string   | No       | `"default"` | `"default"`, `"explain"` (ELI5), `"quiz"` |

#### Response — `200 OK`

```json
{
  "answer": "Think of it like learning to cook! **Supervised learning** is like following a recipe — someone gives you the ingredients (input) and the finished dish (output), and you learn the steps in between. **Unsupervised learning** is like being dropped in a kitchen with random ingredients and figuring out on your own which ones go well together, without anyone telling you what dish to make.",
  "metadata": {
    "model": "gemini-3.8-flash",
    "inputTokens": 2100,
    "outputTokens": 350
  }
}
```

---

## 3. Rate Limiting Strategy

### 3.1 Client-Side Rate Limiting

The frontend implements request throttling to stay within Gemini's free tier limits.

```typescript
class APIRateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private requestsThisMinute = 0;
  private minuteResetTimer: number | null = null;

  // Gemini Flash free tier: ~15-30 RPM
  private readonly MAX_RPM = 15; // Conservative
  private readonly MIN_DELAY_MS = 4000; // 4 seconds between requests

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      if (this.requestsThisMinute >= this.MAX_RPM) {
        await this.sleep(60000); // Wait for rate limit window to reset
        this.requestsThisMinute = 0;
      }

      const task = this.queue.shift();
      if (task) {
        await task();
        this.requestsThisMinute++;
        await this.sleep(this.MIN_DELAY_MS);
      }
    }

    this.processing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3.2 Server-Side 429 Handling

All Gemini-calling endpoints implement exponential backoff:

```python
import time

def call_gemini_with_retry(model, prompt, config, max_retries=3):
    """Call Gemini API with exponential backoff on rate limits."""
    for attempt in range(max_retries):
        try:
            return model.generate_content(prompt, generation_config=config)
        except Exception as e:
            if '429' in str(e) and attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 2  # 2s, 4s, 8s
                time.sleep(wait_time)
                continue
            raise
```

---

## 4. Environment Variables

| Variable         | Service        | Where Set       | Description                              |
|:-----------------|:---------------|:----------------|:-----------------------------------------|
| `GEMINI_API_KEY` | Google Gemini  | Vercel Dashboard | API key from Google AI Studio           |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Cloud | Vercel + `.env.local` | Default OAuth 2.0 Web Client ID        |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID_SC` | Google Cloud | Vercel + `.env.local` | OAuth 2.0 Web Client ID for user SC    |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID_DB` | Google Cloud | Vercel + `.env.local` | OAuth 2.0 Web Client ID for user DB    |
| `NEXT_PUBLIC_GOOGLE_USERS` | Internal | Vercel + `.env.local` | Optional JSON array of custom pre-registered users |
| `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` | Google Cloud | Vercel + `.env.local` | OAuth 2.0 redirect URI          |
| `NEXT_PUBLIC_API_URL` | Internal   | Vercel + `.env.local` | API base URL (for absolute URLs)      |
| `YOUTUBE_NOTES_API_KEY` | Internal | Vercel Dashboard | Shared secret for authenticating local CLI pushes to `/api/youtube-notes` |

> [!IMPORTANT]
> Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. **Never** prefix sensitive keys (like `GEMINI_API_KEY`) with `NEXT_PUBLIC_`.

---

## 5. Vercel Configuration

```json
// vercel.json
{
  "version": 2,
  "builds": [
    {
      "src": "api/*.py",
      "use": "@vercel/python"
    },
    {
      "src": "next.config.js",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    }
  ],
  "functions": {
    "api/*.py": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

---

## 6. Dependencies

### 6.1 Python Dependencies (Vercel Serverless)

```txt
# api/requirements.txt
google-generativeai==0.8.0
```

> [!NOTE]
> - The `.docx` parser uses only Python standard library modules (`zipfile`, `xml.etree.ElementTree`, `io`, `json`, `re`)
> - YouTube transcript fetching and detailed note generation run **locally** via the CLI tool (see Section 2.2)
> - The `/api/youtube-notes` endpoint only receives and stores pre-processed data

### 6.2 Python Dependencies (Local CLI Tool)

```txt
# tools/youtube_cli/requirements.txt
youtube-transcript-api>=0.6.0
google-generativeai>=0.8.0
httpx>=0.27.0
rich>=13.0.0      # CLI progress display
```

> [!TIP]
> The local CLI tool uses `youtube-transcript-api` for transcript fetching (Python, runs locally with residential IP — no cloud blocking), `google-generativeai` for detailed note generation, `httpx` for pushing results to the Vercel API, and `rich` for beautiful CLI progress output.
