# Epic 7 — AI Study Assistant (Chat)

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation), Epic 2 (Data Layer), Epic 3 (Notes)  
> **Design Refs:** [Product Requirements §3.5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [API Specs §2.5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Enable users to ask AI-powered questions about their notes, get explanations of complex topics, and maintain a conversation history scoped to each note.

---

## Story 7.1 — Chat Backend (Gemini)

**As a user, I want to ask clarifying questions about my notes and get intelligent answers from the AI.**

### Tasks

**Task 7.1.1 — Build the `/api/chat` Python endpoint**
- Create `api/chat.py`
- Implement a handler class that:
  - Accepts POST with JSON body: `{ noteContext, question, conversationHistory?, mode? }`
  - `noteContext` = the full text of the note being discussed (required)
  - `question` = the user's current question (required)
  - `conversationHistory` = array of `{ role, content }` objects representing prior messages (optional, default `[]`)
  - `mode` = one of `"default"`, `"explain"` (ELI5), `"quiz"` (optional, default `"default"`)
  - Builds a Gemini prompt that includes:
    - A system instruction setting the AI's role as a study assistant
    - The note content as context
    - The conversation history (for continuity)
    - The user's question
    - Mode-specific instructions (e.g., for `"explain"` mode: "Explain using simple analogies, as if to a 5-year-old")
  - Calls Gemini and returns: `{ answer, metadata: { model, inputTokens, outputTokens } }`
- Use the `GeminiService.call_with_retry()` utility for retry logic
- Handle errors: missing fields (400), rate limited (429), failure (500)
- Refer to [API Specs §2.5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/04_api_specifications.md) for the exact implementation
- **Python virtual env:** `source ~/python_envs/p313_llm/bin/activate`

**Task 7.1.2 — Design the chat system prompts**
- Create a dedicated prompts module (or constants) with system prompt variations:
  - **Default mode**: "You are a knowledgeable study assistant. Answer questions based strictly on the provided note content. If the answer isn't in the notes, say so."
  - **Explain mode (ELI5)**: "Explain using simple language, analogies, and real-world examples. Break down complex concepts as if explaining to a beginner."
  - **Quiz mode**: "Based on the note content, quiz the student by asking follow-up questions to test their understanding."
- These prompts should be named constants, not magic strings

---

## Story 7.2 — Chat UI

**As a user, I want a chat interface where I can have a conversation about my note.**

### Tasks

**Task 7.2.1 — Build the chat page**
- Create `src/app/chat/page.tsx`
- If the user navigates here from a note, the note context is pre-loaded
- If navigated directly, show a note selector dropdown to pick which note to discuss
- The chat page shows the conversation history and a message input area

**Task 7.2.2 — Build the chat interface component**
- Create `src/components/chat/ChatInterface.tsx`
- Layout:
  - Scrollable message area showing the conversation (most recent at bottom)
  - User messages aligned right, AI messages aligned left
  - AI messages rendered with Markdown support (code blocks, bold, lists)
  - Input area at the bottom: text input + send button
  - Mode selector (dropdown or toggle): Default, "Explain Like I'm 5", Quiz Me
- Behavior:
  - On send:
    1. Add the user's message to the local message list and render it immediately
    2. Show a typing indicator for the AI
    3. Call `/api/chat` with the note context, question, conversation history, and mode
    4. On response: add the AI's message to the list, hide typing indicator
    5. Save both messages to IndexedDB via `ChatMessageService.create()`
  - On page load: load existing conversation history from IndexedDB via `ChatMessageService.getByNote(noteId)`
- Handle errors: show inline error message if the AI fails to respond; allow retry

**Task 7.2.3 — Build the chat message bubble component**
- Create `src/components/chat/ChatBubble.tsx`
- Renders a single message with:
  - Avatar (user icon or AI icon)
  - Message content (with Markdown rendering for AI messages)
  - Timestamp
  - Role-based styling (user = primary color, AI = surface color)

**Task 7.2.4 — Add "Ask AI" entry point from note reader**
- In the note reader page (`src/app/notes/[id]/page.tsx`), add an "Ask AI" button
- Clicking it navigates to the chat page with the note ID as a parameter
- The chat page loads the note content from IndexedDB and uses it as context

---

## Story 7.3 — Chat History Management

**As a user, I want my conversation history with the AI to persist so I can refer back to it later.**

### Tasks

**Task 7.3.1 — Load and display conversation history**
- When the chat page opens with a `noteId`, load all previous messages from IndexedDB
- Display them in chronological order
- If no history exists, show a welcome message: "Ask me anything about this note!"

**Task 7.3.2 — Add "Clear History" action**
- Add a "Clear Conversation" button/action in the chat page header
- When clicked, show a confirmation dialog
- On confirm, call `ChatMessageService.deleteByNote(noteId)` and clear the local message list

**Task 7.3.3 — Manage conversation context window**
- The Gemini API has token limits. When the conversation history gets long:
  - Only send the last N messages (e.g., last 10) as `conversationHistory` to the API
  - Always include the full note context
  - This keeps the request within token limits while maintaining conversation continuity

---

## Definition of Done

- [ ] `/api/chat` endpoint returns AI responses based on note context and conversation history
- [ ] Chat UI shows messages in a clean, scrollable interface with Markdown rendering
- [ ] User messages appear immediately; AI messages appear after API response with a typing indicator
- [ ] "Explain Like I'm 5" mode produces simplified explanations
- [ ] Conversation history persists in IndexedDB and loads on page revisit
- [ ] "Clear History" action works with confirmation
- [ ] "Ask AI" button in note reader navigates to chat with the correct note context
- [ ] Long conversations are trimmed to stay within API token limits
