# Epic 5 — AI-Powered Quiz & Flashcard Generation

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation), Epic 2 (Data Layer)  
> **Design Refs:** [Product Requirements §3.3](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [API Specs §2.4](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md), [Data Models §5.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Enable users to generate AI-powered MCQs and flashcards from any note, take quizzes with immediate feedback, and review flashcards — all stored locally in IndexedDB.

---

## Story 5.1 — Quiz Generation Backend (Gemini)

**As a user, I want to click "Generate Quiz" on any note and get 5 MCQs + 5 flashcards created by AI.**

### Tasks

**Task 5.1.1 — Build the `/api/generate-quiz` Python endpoint**
- Create `api/generate_quiz.py`
- Implement a handler class that:
  - Accepts POST with JSON body: `{ text, difficulty?, mcqCount?, flashcardCount? }`
  - Validates that `text` is at least 50 characters; `difficulty` is one of `easy`, `medium`, `hard`; counts are clamped to 1-10
  - Truncates text to ~8000 words if longer
  - Builds a system prompt that instructs Gemini to generate quiz content strictly from the provided text
  - Calls Gemini with structured output mode using the quiz JSON schema (see [Data Models §5.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)):
    - `response_mime_type: "application/json"`
    - `response_schema` = the quiz schema (MCQs with 4 options + correct index + explanation, flashcards with front/back)
    - `temperature: 0.7`
  - Returns: `{ mcqs: [...], flashcards: [...], metadata: { model, inputTokens, outputTokens } }`
- Use the `GeminiService.call_with_retry()` utility from Epic 4 for retry logic
- Handle errors: text too short (400), rate limited (429), generation failed (500)
- Refer to [API Specs §2.4](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md) for the exact implementation
- **Python virtual env:** `source ~/python_envs/p313_llm/bin/activate`

**Task 5.1.2 — Define the Gemini quiz prompt**
- Create a dedicated prompt constant (not hardcoded in the handler) following the system prompt from the API spec:
  - Instruct Gemini to generate MCQs that test deep understanding, not surface recall
  - MCQs must have exactly 4 options with one correct answer and an explanation
  - Flashcard fronts should be open-ended recall questions
  - Flashcard backs should be concise but complete answers
  - All content must be based strictly on the provided text — no external knowledge
  - Respect the difficulty parameter

---

## Story 5.2 — Quiz Generation Frontend Flow

**As a user, I want to generate a quiz from the note reader view and see the quiz stored for future use.**

### Tasks

**Task 5.2.1 — Add "Generate Quiz" button to the note reader**
- In the note reader page (`src/app/notes/[id]/page.tsx`), add a "Generate Quiz" action button
- When clicked:
  1. Show a loading state ("Generating quiz...")
  2. Call `/api/generate-quiz` via `ApiClient.post()` with the note's content
  3. On success: save the quiz, MCQ cards, flashcards, and SRS cards to IndexedDB via `QuizService.create()`
  4. Navigate to the quiz-taking page for this quiz
  5. On error: show user-friendly error message (rate limited → "Try again in a minute", too short → "Note needs more content")
- Show a badge if the note already has quizzes generated (clickable to view them)

**Task 5.2.2 — Build the quiz selection page**
- Create `src/app/quiz/page.tsx`
- Lists all notes that have quizzes generated
- Each entry shows: note title, number of quizzes, last generated date
- Clicking an entry navigates to the quiz-taking interface

---

## Story 5.3 — MCQ Quiz-Taking Interface

**As a user, I want to take a multiple-choice quiz and get immediate feedback with explanations.**

### Tasks

**Task 5.3.1 — Build the MCQ quiz page**
- Create `src/app/quiz/[id]/page.tsx`
- Flow:
  1. Load the quiz and its MCQ cards from IndexedDB
  2. Show one question at a time
  3. Display the question text and 4 clickable options
  4. When the user selects an option:
     - Immediately highlight correct (green) and incorrect (red)
     - Show the explanation text below the options
     - Show a "Next" button to proceed
  5. After all questions: show a results summary (score, percentage, per-question breakdown)
- Track which questions the user got right/wrong (for later SRS integration)

**Task 5.3.2 — Build the `MCQCard` component**
- Create `src/components/quiz/MCQCard.tsx`
- Displays a single MCQ question with 4 option buttons
- States: unanswered (all options neutral), answered-correct (selected option green, rest dimmed), answered-incorrect (selected option red, correct option green)
- Includes the explanation area (hidden until answered)
- Smooth transitions between states using CSS

**Task 5.3.3 — Build the `QuizResults` component**
- Create `src/components/quiz/QuizResults.tsx`
- Displays:
  - Overall score (e.g., "4 out of 5 correct")
  - Percentage with a circular progress indicator or bar
  - List of questions with ✅/❌ indicators
  - "Retake Quiz" button and "Generate New Quiz" button (re-roll)
  - "Back to Note" navigation

---

## Story 5.4 — Flashcard Review Interface

**As a user, I want to review flashcards by seeing the front, tapping to reveal the back, and rating my recall.**

### Tasks

**Task 5.4.1 — Build the flashcard review component**
- Create `src/components/quiz/FlashCard.tsx`
- Displays a card with a flip animation:
  - Front side: shows the question/prompt text
  - Back side: shows the answer/explanation text
  - User taps or clicks to flip from front to back
- Use CSS 3D transform for a smooth flip animation
- After revealing the back, show the quality rating buttons (0-5) — this integrates with the SM-2 system in Epic 6

**Task 5.4.2 — Build the flashcard review page**
- Add flashcard review mode to `src/app/quiz/[id]/page.tsx` (or a separate route)
- Flow:
  1. Load flashcards from the quiz via IndexedDB
  2. Show one card at a time (front side)
  3. User taps to flip → sees the back
  4. User rates recall quality (0-5)
  5. Next card
  6. After all cards: show summary

---

## Definition of Done

- [ ] "Generate Quiz" button on note reader calls the backend and saves quiz + cards to IndexedDB
- [ ] MCQ quiz-taking shows questions one at a time with immediate correct/incorrect feedback and explanations
- [ ] Quiz results page shows score, percentage, and per-question breakdown
- [ ] Flashcard review shows front → flip animation → back → quality rating
- [ ] Re-roll (regenerate) works and creates a new quiz version
- [ ] Gemini structured output returns clean JSON matching the schema 100% of the time
- [ ] Rate limit errors show "Try again in a minute" message
- [ ] All quiz data persists in IndexedDB for offline access
