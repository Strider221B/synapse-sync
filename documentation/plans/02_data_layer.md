# Epic 2 — Client-Side Data Layer (IndexedDB)

> **Priority:** P0  
> **Depends On:** Epic 1 (Project Foundation)  
> **Design Refs:** [Data Models](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md), [System Architecture](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/02_system_architecture.md) §3.3  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Build the complete IndexedDB data layer — database initialization, TypeScript interfaces for all entities, and CRUD service classes. This is the foundation that every feature reads from and writes to.

---

## Story 2.1 — Define All Data Model Interfaces

**As a developer, I need TypeScript interfaces for every entity so the entire codebase has type safety on all data.**

### Tasks

**Task 2.1.1 — Create the `Notebook` interface**
- Create file `src/lib/db/models/notebook.ts`
- Define the `Notebook` interface with fields: `id` (UUID string), `name`, `source` (`'onedrive' | 'youtube_playlist' | 'manual'`), `sourceUrl?`, `description?`, `tags` (string array), `createdAt`, `updatedAt` (ISO 8601 strings), `isSynced` (boolean)
- Refer to [Data Models §3.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md) for exact field definitions

**Task 2.1.2 — Create the `Note` interface**
- Create file `src/lib/db/models/note.ts`
- Define the `Note` interface with fields: `id`, `notebookId` (FK), `title`, `content`, `contentFormat` (`'markdown' | 'plaintext'`), `sourceType` (`'onedrive_docx' | 'onedrive_md' | 'youtube_transcript' | 'manual'`), `sourceUrl?`, `oneDriveItemId?`, `wordCount`, `createdAt`, `updatedAt`, `isSynced`
- Refer to [Data Models §3.2](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)

**Task 2.1.3 — Create the quiz-related interfaces**
- Create `src/lib/db/models/quiz.ts` — `Quiz` interface: `id`, `noteId`, `modelUsed`, `version`, `generatedAt`
- Create `src/lib/db/models/mcq_card.ts` — `MCQCard` interface: `id`, `quizId`, `question`, `options` (tuple of 4 strings), `correctIndex` (0-3), `explanation`
- Create `src/lib/db/models/flashcard.ts` — `Flashcard` interface: `id`, `quizId`, `front`, `back`, `tags`
- Refer to [Data Models §3.3-3.5](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)

**Task 2.1.4 — Create the SRS card interface**
- Create `src/lib/db/models/srs_card.ts`
- Define `SRSCard` interface with SM-2 fields: `id`, `cardId` (FK to MCQ or Flashcard), `cardType` (`'mcq' | 'flashcard'`), `repetitions`, `easinessFactor`, `interval`, `nextReview`, `lastReview` (nullable), `totalReviews`, `correctCount`
- Refer to [Data Models §3.6](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)

**Task 2.1.5 — Create supporting interfaces**
- Create `src/lib/db/models/chat_message.ts` — `ChatMessage` interface: `id`, `noteId`, `role` (`'user' | 'assistant'`), `content`, `timestamp`
- Create `src/lib/db/models/sync_entry.ts` — `SyncEntry` interface: `id`, `entityType`, `entityId`, `operation` (`'create' | 'update' | 'delete'`), `payload`, `createdAt`, `status` (`'pending' | 'in_progress' | 'completed' | 'failed'`), `retryCount`, `errorMessage?`
- Create `src/lib/db/models/user_preference.ts` — `UserPreference` interface: `key`, `value`
- Refer to [Data Models §3.7-3.9](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)

**Task 2.1.6 — Create a barrel export file**
- Create `src/lib/db/models/index.ts` that re-exports all interfaces from one import path
- Example: `export type { Notebook } from './notebook';`

---

## Story 2.2 — Initialize IndexedDB and Create the Database Service

**As a developer, I need a centralized database service that initializes IndexedDB and provides typed access to all object stores.**

### Tasks

**Task 2.2.1 — Install the `idb` and `uuid` libraries**
- Run `npm install idb@8.0.4 uuid@14.0.3`
- This gives a Promise-based wrapper over the native IndexedDB API and UUID generation
- Run `npm install --save-dev @types/uuid` for TypeScript definitions

**Task 2.2.2 — Define the database schema**
- Create `src/lib/db/schema.ts`
- Define a `SynapseSyncDB` interface that extends `DBSchema` from `idb`
- Map all 9 object stores with their key types and index definitions:
  - `notebooks`: key `id`, indexes `by-source`, `by-updated`
  - `notes`: key `id`, indexes `by-notebook`, `by-source-type`, `by-updated`, `by-title`
  - `quizzes`: key `id`, indexes `by-note`, `by-generated`
  - `mcq_cards`: key `id`, index `by-quiz`
  - `flashcards`: key `id`, index `by-quiz`
  - `srs_cards`: key `id`, indexes `by-card` (unique), `by-next-review`, `by-card-type`
  - `chat_messages`: key `id`, indexes `by-note`, `by-timestamp`
  - `sync_queue`: key `id`, indexes `by-status`, `by-entity`, `by-created`
  - `preferences`: key `key`
- Refer to [Data Models §6](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md) for the exact initialization code

**Task 2.2.3 — Create the database initialization service**
- Create `src/lib/db/database.ts`
- Implement a class `DatabaseService` with:
  - A method `getDB()` that returns the opened database instance (singleton pattern — only opens once)
  - The `upgrade` callback inside `openDB()` that creates all 9 object stores and their indexes
  - Database name: `'synapse-sync'`, version: `1`
- Refer to the `initDB()` function in [Data Models §6](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)

---

## Story 2.3 — Build CRUD Service Classes for Each Entity

**As a developer, I need service classes with create/read/update/delete operations for each data entity so feature modules don't interact with IndexedDB directly.**

### Tasks

**Task 2.3.1 — Create the `NotebookService` class**
- Create `src/lib/db/services/notebook_service.ts`
- Methods:
  - `create(data)` — generates UUID, sets timestamps, saves to `notebooks` store
  - `getById(id)` — retrieves a single notebook
  - `getAll()` — retrieves all notebooks, sorted by `updatedAt` descending
  - `getBySource(source)` — uses the `by-source` index
  - `update(id, data)` — updates fields and `updatedAt` timestamp
  - `delete(id)` — removes the notebook
- Inject `DatabaseService` via constructor

**Task 2.3.2 — Create the `NoteService` class**
- Create `src/lib/db/services/note_service.ts`
- Methods:
  - `create(data)` — generates UUID, computes `wordCount`, sets timestamps
  - `getById(id)` — retrieves a single note
  - `getByNotebook(notebookId)` — uses the `by-notebook` index
  - `getBySourceType(sourceType)` — uses the `by-source-type` index
  - `getAll()` — retrieves all notes
  - `update(id, data)` — updates fields, recomputes `wordCount` if content changed
  - `delete(id)` — removes the note
  - `search(query)` — iterates over all notes and filters by `String.includes()` on title and content (case-insensitive)

**Task 2.3.3 — Create the `QuizService` class**
- Create `src/lib/db/services/quiz_service.ts`
- Methods:
  - `create(noteId, mcqs, flashcards, modelUsed)` — creates `Quiz`, `MCQCard[]`, and `Flashcard[]` records in a single transaction, and initializes `SRSCard` records for each card (starting values: `EF=2.5`, `repetitions=0`, `interval=0`, `nextReview=now`)
  - `getByNote(noteId)` — returns all quizzes for a note
  - `getQuizWithCards(quizId)` — returns the quiz plus its MCQ cards and flashcards
  - `delete(quizId)` — removes the quiz and all associated cards and SRS state (cascading delete)

**Task 2.3.4 — Create the `SRSCardService` class**
- Create `src/lib/db/services/srs_card_service.ts`
- Methods:
  - `getDueCards(date?)` — queries the `by-next-review` index for all cards due on or before the given date (default: today)
  - `getByCardId(cardId)` — uses the `by-card` index to look up SRS state
  - `update(id, data)` — updates SM-2 parameters after a review
  - `getStats()` — returns summary statistics: total cards, cards due today, mastered cards (those with high EF and long interval)

**Task 2.3.5 — Create the `ChatMessageService` class**
- Create `src/lib/db/services/chat_message_service.ts`
- Methods:
  - `create(noteId, role, content)` — adds a message with UUID and timestamp
  - `getByNote(noteId)` — returns all messages for a note, ordered by `timestamp`
  - `deleteByNote(noteId)` — clears all messages for a note

**Task 2.3.6 — Create the `SyncQueueService` class**
- Create `src/lib/db/services/sync_queue_service.ts`
- Methods:
  - `enqueue(entityType, entityId, operation, payload)` — adds a new sync entry with `status: 'pending'`
  - `getPending()` — returns all entries with `status: 'pending'`, sorted by `createdAt` (FIFO)
  - `markCompleted(id)` — updates status to `'completed'`
  - `markFailed(id, errorMessage)` — updates status and increments `retryCount`

**Task 2.3.7 — Create the `PreferencesService` class**
- Create `src/lib/db/services/preferences_service.ts`
- Methods:
  - `get(key)` — retrieves a preference value, returns the default if not found
  - `set(key, value)` — creates or updates a preference
  - `getAll()` — returns all preferences as a key-value map
- Define known preference keys and defaults as constants (theme: `'system'`, dailyCardGoal: `20`, etc.)

**Task 2.3.8 — Create a barrel export for services**
- Create `src/lib/db/services/index.ts` that re-exports all service classes

---

## Definition of Done

- [ ] All 9 TypeScript interfaces are defined and exported
- [ ] `DatabaseService` opens IndexedDB with all 9 object stores and correct indexes
- [ ] All 7 service classes have working CRUD methods
- [ ] Each service is unit-testable by mocking the `DatabaseService`
- [ ] `npm run lint` and `npx tsc --noEmit` pass with zero errors
