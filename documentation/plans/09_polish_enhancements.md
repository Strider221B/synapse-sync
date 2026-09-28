# Epic 9 — Polish, Theming & Enhancements

> **Priority:** P1  
> **Depends On:** All prior epics (1-8)  
> **Design Refs:** [Product Requirements §4](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md), [Product Requirements §6](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/01_product_requirements.md)  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Polish the UI/UX, add dark/light theme support, build the main dashboard, implement the navigation system, and add quality-of-life enhancements that make the app feel complete and premium.

---

## Story 9.1 — Dark/Light Theme Toggle

**As a user, I want to switch between dark and light themes, or have the app follow my system preference.**

### Tasks

**Task 9.1.1 — Build the theme system**
- In `src/styles/globals.css`, define two complete color palettes:
  - **Dark theme** (default): dark backgrounds (`#0a0a0f`), light text, indigo primary (`#6366f1`)
  - **Light theme**: light backgrounds, dark text, same primary color
  - Use `[data-theme="light"]` selector to override CSS custom properties
  - Support `[data-theme="system"]` using `@media (prefers-color-scheme: dark/light)` queries

**Task 9.1.2 — Build the `ThemeToggle` component**
- Create `src/components/common/ThemeToggle.tsx`
- A button or dropdown with three options: Dark, Light, System
- When changed, update the `data-theme` attribute on `<html>` and save the preference via `PreferencesService.set('theme', value)`
- On app load, read the saved theme preference and apply it

**Task 9.1.3 — Test theme across all components**
- Verify every page and component looks correct in both dark and light themes
- Pay special attention to: text readability, card backgrounds, input fields, borders, shadows, chart colors

---

## Story 9.2 — Navigation System (Sidebar + Bottom Nav)

**As a user, I want clear navigation that works on both desktop (sidebar) and mobile (bottom nav).**

### Tasks

**Task 9.2.1 — Build the desktop sidebar**
- Create `src/components/layout/Sidebar.tsx`
- Navigation items with icons:
  - 🏠 Dashboard (home page)
  - 📚 Notes (notes listing)
  - 🎬 YouTube Import
  - 📝 Quiz
  - 🔄 Review (with due-card count badge)
  - 💬 AI Chat
  - ⚙️ Settings
- Active page indicator (highlighted item)
- Collapsible on smaller desktop screens
- SynapseSync logo/brand at the top

**Task 9.2.2 — Build the mobile bottom navigation**
- Create `src/components/layout/BottomNav.tsx`
- Show on screens < 768px width; hide sidebar
- Bottom bar with the 5 most important nav items: Dashboard, Notes, Review, Quiz, Settings
- Active page indicator
- The Review item should show a badge with the due-card count

**Task 9.2.3 — Build the responsive layout wrapper**
- Create `src/components/layout/AppLayout.tsx`
- Combines the `Sidebar` (desktop) and `BottomNav` (mobile) with the main content area
- Uses CSS media queries for responsive behavior
- Wraps all pages in the root layout

---

## Story 9.3 — Dashboard Home Page

**As a user, I want a dashboard that shows my study progress and provides quick actions.**

### Tasks

**Task 9.3.1 — Build the dashboard page**
- Modify `src/app/page.tsx` to be the main dashboard
- Dashboard sections:
  1. **Welcome header**: "Good morning, [name]" or "Welcome to SynapseSync" with today's date
  2. **SRS Review Widget** (from Epic 6): cards due today, streak count
  3. **Quick Actions**: "Import Notes", "YouTube Import", "Start Review" — prominent buttons
  4. **Recent Notes**: last 5 notes accessed, shown as cards
  5. **Study Stats**: total notes, total quizzes, total flashcards, total reviews completed

**Task 9.3.2 — Create summary statistics service**
- Create `src/lib/db/services/stats_service.ts`
- Methods:
  - `getDashboardStats()` — returns an object with: total notebooks, total notes, total quizzes, total flashcards, total SRS cards, cards due today, total reviews completed
- Reads all counts from IndexedDB in a single efficient operation

---

## Story 9.4 — Settings Page

**As a user, I want a settings page where I can manage my preferences and connections.**

### Tasks

**Task 9.4.1 — Build the settings page**
- Create `src/app/settings/page.tsx`
- Sections:
  1. **OneDrive Connection**: connected status, user name, connect/disconnect button (reuses `OneDriveConnectButton`)
  2. **Theme**: dark/light/system selector (reuses `ThemeToggle`)
  3. **Study Preferences**: daily card goal (number input, default 20), quiz difficulty default (dropdown)
  4. **Data Management**: "Clear All Data" button (with confirmation — wipes IndexedDB), "Export Notes" placeholder (future feature)
  5. **About**: app version, link to design docs, credits

**Task 9.4.2 — Build the settings form components**
- Create reusable form components:
  - `src/components/settings/SettingRow.tsx` — a labeled row with a control on the right side
  - `src/components/settings/NumberInput.tsx` — styled number input for the daily goal
  - `src/components/settings/SelectDropdown.tsx` — styled dropdown for difficulty

---

## Story 9.5 — UI Polish & Responsive Refinements

**As a user, I want the app to look polished, feel responsive, and have smooth interactions.**

### Tasks

**Task 9.5.1 — Add loading states and skeleton screens**
- Create `src/components/common/Skeleton.tsx` — a pulsing skeleton placeholder component
- Add skeleton screens to:
  - Notes listing page (while loading from IndexedDB)
  - Note reader (while loading content)
  - Quiz page (while loading cards)
  - Dashboard (while computing stats)

**Task 9.5.2 — Add error boundary and error states**
- Create `src/components/common/ErrorBoundary.tsx` — wraps page content to catch React rendering errors
- Create `src/components/common/ErrorState.tsx` — a reusable error display with icon, message, and retry button
- Add error states to all pages that make API calls or read from IndexedDB

**Task 9.5.3 — Add toast notifications**
- Create `src/components/common/ToastNotification.tsx`
- A notification system for feedback:
  - Success: "Quiz generated successfully", "Note imported"
  - Error: "Failed to connect to OneDrive", "Rate limit reached"
  - Info: "Sync completed — 3 changes uploaded"
- Toast appears at top-right (desktop) or top-center (mobile), auto-dismisses after 4 seconds

**Task 9.5.4 — Add micro-animations**
- Page transitions: smooth fade-in on navigation
- Card interactions: subtle scale-up on hover (desktop)
- Flashcard flip: polished 3D rotate animation
- Button clicks: subtle press effect
- Progress bar: smooth width transition
- Use CSS `transition` and `@keyframes` — no heavy animation libraries

**Task 9.5.5 — Responsive audit**
- Test all pages at these breakpoints:
  - 320px (small phone)
  - 375px (standard phone)
  - 768px (tablet)
  - 1024px (small laptop)
  - 1440px (desktop)
  - 2560px (ultrawide)
- Fix any layout issues: text overflow, touch target sizes (min 44×44px), spacing

**Task 9.5.6 — Accessibility audit**
- Verify WCAG 2.1 AA compliance:
  - Color contrast ratios (at least 4.5:1 for normal text, 3:1 for large text)
  - All interactive elements have focus styles
  - Keyboard navigation works on all pages (Tab, Enter, Escape)
  - Screen reader compatibility: all images have alt text, all buttons have labels, page regions use ARIA landmarks
  - Form inputs have associated labels

---

## Definition of Done

- [ ] Dark/light/system theme toggle works correctly and persists across sessions
- [ ] Desktop sidebar and mobile bottom nav both display with correct active states
- [ ] Dashboard shows study stats, due cards, recent notes, and quick actions
- [ ] Settings page allows configuring preferences, managing OneDrive connection, and clearing data
- [ ] Loading states (skeletons) appear on all data-dependent pages
- [ ] Error states display helpful messages with retry options
- [ ] Toast notifications provide feedback on user actions
- [ ] Micro-animations make the app feel polished and responsive
- [ ] All pages render correctly across all tested breakpoints (320px to 2560px)
- [ ] WCAG 2.1 AA compliance verified (contrast, focus, keyboard nav, screen reader)
