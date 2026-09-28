# Epic 6 — Spaced Repetition System (SM-2)

> **Priority:** P0  
> **Depends On:** Epic 2 (Data Layer), Epic 5 (Quiz Generation)  
> **Design Refs:** [Product Requirements §3.4](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [Data Models §4](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Implement the SuperMemo SM-2 spaced repetition algorithm to automatically schedule card reviews based on how well the user recalls each card. Build a daily review queue and a progress dashboard.

---

## Story 6.1 — SM-2 Algorithm Engine

**As a user, I want the app to automatically determine when I should review each card based on how well I recalled it.**

### Tasks

**Task 6.1.1 — Implement the SM-2 algorithm**
- Create `src/lib/srs/sm2.ts`
- Implement a class `SM2Engine` with a method `calculate(card: SRSCard, quality: number): SM2Result` that:
  1. Clamps the quality rating to 0-5
  2. Updates the Easiness Factor (EF): `EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))`, floored at 1.3
  3. If quality < 3 (failed recall): reset repetitions to 0, set interval to 1 day
  4. If quality ≥ 3 (successful recall):
     - First review (repetitions = 0): interval = 1
     - Second review (repetitions = 1): interval = 6
     - Subsequent: interval = round(previous interval × EF)
     - Increment repetitions
  5. Calculate `nextReview` = today + interval days
  6. Return `{ repetitions, easinessFactor, interval, nextReview }`
- Refer to the pseudocode in [Data Models §4.1](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/03_data_models.md)
- This is a **pure function** — no database access, no side effects. It runs entirely client-side.

**Task 6.1.2 — Write comprehensive tests for SM-2**
- Create tests covering:
  - First review with quality 5 → interval should be 1 day
  - Second review with quality 4 → interval should be 6 days
  - Third review with quality 5 → interval should be 6 × EF (approximately 15 days)
  - Failed recall (quality 0, 1, or 2) → repetitions reset to 0, interval reset to 1
  - EF never drops below 1.3
  - EF increases when quality = 5, stays roughly stable at quality = 4, decreases at quality = 3
  - Edge cases: quality exactly 0, quality exactly 5, EF already at minimum (1.3)

---

## Story 6.2 — Daily Review Queue

**As a user, I want to open a "Review" page and see all cards that are due for review today.**

### Tasks

**Task 6.2.1 — Build the review queue page**
- Create `src/app/review/page.tsx`
- On page load:
  1. Query `SRSCardService.getDueCards()` to get all cards where `nextReview <= today`
  2. For each SRS card, load the associated MCQ card or flashcard data (need to look up by `cardId` and `cardType`)
  3. Sort by urgency (most overdue first)
  4. Display the count: "You have N cards to review today"
  5. "Start Review" button begins the review session
- If no cards are due, show an encouraging message: "All caught up! 🎉 No cards due for review."

**Task 6.2.2 — Build the review session flow**
- Create `src/components/review/ReviewSession.tsx`
- Flow for each card:
  1. Determine card type (MCQ or flashcard) from `SRSCard.cardType`
  2. **Flashcard**: show front → user taps to flip → show back → user rates quality (0-5)
  3. **MCQ**: show question → user selects an answer → show correct/incorrect + explanation → user rates quality (0-5)
  4. After the user rates quality:
     - Call `SM2Engine.calculate(card, quality)` to compute new SRS parameters
     - Update the SRS card in IndexedDB via `SRSCardService.update()`
     - Update analytics fields: increment `totalReviews`, increment `correctCount` if quality ≥ 3
     - Advance to next card
  5. After all cards: show the review summary

**Task 6.2.3 — Build the quality rating component**
- Create `src/components/review/QualityRating.tsx`
- Displays 6 buttons (0-5) with labels and colors:
  - 0: "Blackout" (red)
  - 1: "Incorrect" (orange)
  - 2: "Wrong but easy" (yellow)
  - 3: "Correct, hard" (light green)
  - 4: "Correct, hesitant" (green)
  - 5: "Perfect" (blue)
- Each button triggers the SM-2 update for the current card
- Compact layout that works well on mobile

**Task 6.2.4 — Build the review summary component**
- Create `src/components/review/ReviewStats.tsx`
- Shown at the end of a review session:
  - Total cards reviewed
  - Average quality rating
  - Cards mastered (quality 4-5) vs. struggling (quality 0-2)
  - "Review Again" button (starts a new session with any remaining due cards)
  - "Back to Dashboard" navigation

---

## Story 6.3 — SRS Dashboard

**As a user, I want to see my overall learning progress on the dashboard.**

### Tasks

**Task 6.3.1 — Build the SRS stats widget**
- Create `src/components/review/SRSDashboardWidget.tsx`
- Displays on the home/dashboard page:
  - Cards due today (count with badge, clickable → goes to review page)
  - Study streak: consecutive days with at least one review session (compute from SRS card `lastReview` timestamps)
  - Mastery progress per notebook: percentage of cards with interval > 21 days (well-learned)
  - Next review date: when the next batch of cards becomes due

**Task 6.3.2 — Integrate the SRS widget into the dashboard**
- On the main dashboard page (`src/app/page.tsx`), add the SRS widget alongside other content
- The widget should be visually prominent — it's the primary call-to-action for returning users
- Show a notification-style badge on the "Review" navigation item when cards are due

---

## Definition of Done

- [ ] SM-2 algorithm correctly calculates new EF, interval, and nextReview for all quality ratings (0-5)
- [ ] SM-2 unit tests cover happy paths, edge cases, and failure scenarios
- [ ] Review queue page shows all cards due today, sorted by urgency
- [ ] Review session presents each card (MCQ or flashcard) and collects a quality rating
- [ ] After rating, SRS parameters are updated in IndexedDB
- [ ] Review summary shows session statistics
- [ ] Dashboard widget shows cards due, streak count, and mastery progress
- [ ] All review functionality works fully offline (no network calls needed)
