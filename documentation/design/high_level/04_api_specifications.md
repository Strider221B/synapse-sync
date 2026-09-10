# SynapseSync — API Specifications

> **Version:** 1.0  
> **Date:** 2026-09-10  
> **Status:** Draft  

---

## 1. Overview

All API endpoints are **Vercel Python Serverless Functions** deployed under the `/api/` directory. Each function is a self-contained, stateless handler that spins up fresh on every invocation.

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

### 2.2 POST `/api/transcript`

> [!IMPORTANT]
> **Runtime: Node.js (Next.js API Route)** — This endpoint runs as a Next.js route handler (`src/app/api/transcript/route.ts`), **not** as a Python serverless function. This is because:
> 1. **CORS blocks client-side fetching**: Browsers refuse direct cross-origin requests to YouTube's transcript endpoints
> 2. **The `youtube-transcript` npm package** integrates naturally with the Next.js deployment
> 3. **Fallback available**: If the server-side fetch is blocked by YouTube (datacenter IP), the UI prompts the user to paste the transcript manually

Fetches the transcript/subtitles for a single YouTube video using the `youtube-transcript` npm package.

#### Request

```json
{
  "videoUrl": "https://www.youtube.com/watch?v=jGwO_UgTS7I",
  "language": "en"
}
```

| Field      | Type   | Required | Default | Description                        |
|:-----------|:-------|:---------|:--------|:-----------------------------------|
| `videoUrl` | string | Yes      | —       | Full YouTube video URL or video ID |
| `language` | string | No       | `"en"`  | Preferred transcript language code |

#### Response — `200 OK`

```json
{
  "transcript": "Welcome to lecture 1 of CS229. Today we're going to talk about...",
  "videoId": "jGwO_UgTS7I",
  "language": "en",
  "metadata": {
    "wordCount": 8234,
    "segmentCount": 412
  }
}
```

#### Error Scenarios

| Error Code                | HTTP | When                                           |
|:--------------------------|:-----|:-----------------------------------------------|
| `INVALID_URL`             | 400  | URL is not a valid YouTube video URL           |
| `TRANSCRIPTS_DISABLED`    | 404  | Video has no captions/subtitles                |
| `REQUEST_BLOCKED`         | 429  | YouTube blocked the request (cloud IP)         |
| `VIDEO_UNAVAILABLE`       | 404  | Video is private, deleted, or region-locked    |

#### Implementation — TypeScript (Next.js Route Handler)

```typescript
// src/app/api/transcript/route.ts
import { YoutubeTranscript } from 'youtube-transcript';
import { NextRequest, NextResponse } from 'next/server';

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:v=|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoUrl, language = 'en' } = body;

    if (!videoUrl) {
      return NextResponse.json(
        { error: { code: 'MISSING_URL', message: 'videoUrl is required' } },
        { status: 400 }
      );
    }

    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: { code: 'INVALID_URL', message: `Invalid YouTube URL: ${videoUrl}` } },
        { status: 400 }
      );
    }

    const segments = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: language,
    });

    const fullText = segments.map((seg) => seg.text).join(' ');

    return NextResponse.json({
      transcript: fullText,
      videoId,
      language,
      metadata: {
        wordCount: fullText.split(/\s+/).length,
        segmentCount: segments.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('disabled') || message.includes('not available')) {
      return NextResponse.json(
        { error: { code: 'TRANSCRIPTS_DISABLED', message: 'No transcripts available.' } },
        { status: 404 }
      );
    }
    if (message.includes('blocked') || message.includes('429')) {
      return NextResponse.json(
        { error: { code: 'REQUEST_BLOCKED', message: 'YouTube blocked this request. Use manual paste.' } },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: { code: 'FETCH_FAILED', message } },
      { status: 500 }
    );
  }
}
```

> [!WARNING]
> **Cloud IP Blocking Risk (Reduced):** While YouTube still may block Vercel datacenter IPs, the Node.js implementation is lighter-weight and the `youtube-transcript` npm package has different request patterns than the Python library. Mitigations:
> 1. **Retry logic** with exponential backoff on the frontend
> 2. **Manual paste fallback** — UI prompts user to paste transcript if auto-fetch fails
> 3. **Aggressive caching** — transcripts stored in IndexedDB; never re-fetched
> 4. **Python fallback** — `youtube-transcript-api` available as an alternative endpoint if needed

---

### 2.3 POST `/api/playlist-info`

> **Runtime: Node.js** (Next.js API Route — `src/app/api/playlist-info/route.ts`)

Resolves a YouTube playlist URL into a list of individual video URLs and titles. Uses lightweight HTML parsing (no YouTube Data API required).

#### Request

```json
{
  "playlistUrl": "https://www.youtube.com/playlist?list=PLoROMvodv4rMiGQp3WXShtMGgzqpfVfbU"
}
```

#### Response — `200 OK`

```json
{
  "playlistTitle": "Stanford CS229: Machine Learning",
  "videoCount": 20,
  "videos": [
    {
      "videoId": "jGwO_UgTS7I",
      "title": "Lecture 1 - Welcome | Stanford CS229",
      "url": "https://www.youtube.com/watch?v=jGwO_UgTS7I",
      "index": 1
    },
    {
      "videoId": "4b4MUYve_U8",
      "title": "Lecture 2 - Linear Regression | Stanford CS229",
      "url": "https://www.youtube.com/watch?v=4b4MUYve_U8",
      "index": 2
    }
  ]
}
```

---

### 2.4 POST `/api/generate-quiz`

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

| Field            | Type   | Required | Default    | Description                       |
|:-----------------|:-------|:---------|:-----------|:----------------------------------|
| `text`           | string | Yes      | —          | Note content to generate from     |
| `difficulty`     | string | No       | `"medium"` | `"easy"`, `"medium"`, or `"hard"` |
| `mcqCount`       | int    | No       | `5`        | Number of MCQs (1-10)             |
| `flashcardCount` | int    | No       | `5`        | Number of flashcards (1-10)       |

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
    "model": "gemini-2.0-flash",
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
    
    # Truncate to ~8000 words to stay within token limits
    words = text.split()
    if len(words) > 8000:
        text = ' '.join(words[:8000])
    
    model = genai.GenerativeModel('gemini-2.0-flash')
    
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
            'model': 'gemini-2.0-flash',
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

### 2.5 POST `/api/summarize`

Summarizes a YouTube transcript or long document into structured study notes using Gemini.

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
    "model": "gemini-2.0-flash",
    "inputTokens": 5000,
    "outputTokens": 1200
  }
}
```

---

### 2.6 POST `/api/chat`

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
    "model": "gemini-2.0-flash",
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
| `NEXT_PUBLIC_MSAL_CLIENT_ID` | Microsoft Entra | Vercel + `.env.local` | App registration client ID  |
| `NEXT_PUBLIC_MSAL_REDIRECT_URI` | Microsoft Entra | Vercel + `.env.local` | OAuth redirect URI      |
| `NEXT_PUBLIC_API_URL` | Internal   | Vercel + `.env.local` | API base URL (for absolute URLs)      |

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

### 6.1 Python Dependencies

```txt
# api/requirements.txt
google-generativeai==0.8.0
```

> [!NOTE]
> - The `.docx` parser uses only Python standard library modules (`zipfile`, `xml.etree.ElementTree`, `io`, `json`, `re`)
> - YouTube transcript fetching has moved to a **Node.js API route** (see Section 2.2)
> - The Python `youtube-transcript-api` package can be added back as a fallback if needed

### 6.2 Node.js Dependencies (package.json)

```json
{
  "dependencies": {
    "youtube-transcript": "^1.2.0"
  }
}
```

> [!TIP]
> The `youtube-transcript` npm package is lightweight (~15 KB) and handles YouTube's transcript XML format natively in Node.js — no Python bridge or subprocess needed.
