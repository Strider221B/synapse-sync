# Epic 1 — Project Foundation & Setup

> **Priority:** P0  
> **Depends On:** Nothing (this is the first epic)  
> **Design Refs:** [System Architecture](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/02_system_architecture.md) §6-7, [Deployment Guide](file:///home/somesh/git_repos/synapse-sync/documentation/design/high_level/05_deployment_guide.md) §2-4  
> **Coding Standards:** [coding_standards.md](file:///home/somesh/git_repos/synapse-sync/documentation/prompts/coding_standards.md)

---

## Goal

Set up the complete project scaffolding — Next.js frontend, Python backend directory, Vercel configuration, CI pipeline, and environment config — so all subsequent epics have a working foundation to build on.

---

## Story 1.1 — Initialize the Next.js Project

**As a developer, I need a working Next.js 16.4.2 project (React 19) with App Router so I can start building pages and components.**

### Tasks

**Task 1.1.1 — Create Next.js application**
- Run `npx -y create-next-app@16.4.2 ./` from the project root with these options:
  - TypeScript: Yes
  - ESLint: Yes
  - App Router: Yes
  - `src/` directory: Yes
  - Tailwind: **No** (we use Vanilla CSS)
  - Import alias: `@/*`
- Verify the app runs with `npm run dev` on `http://localhost:3000`

**Task 1.1.2 — Configure TypeScript strictly**
- Open `tsconfig.json` and ensure `strict: true` is set
- Add `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }"`
- Verify `npx tsc --noEmit` passes with zero errors

**Task 1.1.3 — Set up the global CSS design system**
- Create `src/styles/globals.css` with CSS custom properties (design tokens) for:
  - Color palette (dark theme as default): background, surface, text, primary (`#6366f1` — indigo), accent, success, warning, error colors
  - Typography: font-family (use `Inter` from Google Fonts), font sizes, line heights
  - Spacing scale (4px base: `--space-1` through `--space-16`)
  - Border radius tokens
  - Transition/animation tokens
  - Light theme variant using `[data-theme="light"]` selector
- Import this in `src/app/layout.tsx`
- Add the Inter font from Google Fonts via `next/font/google`

**Task 1.1.4 — Create the root layout shell**
- In `src/app/layout.tsx`, set up:
  - HTML `<head>` with meta tags (title: "SynapseSync — AI Study Companion", description, viewport)
  - The Inter font applied to `<body>`
  - A placeholder layout with a sidebar area and main content area
  - `data-theme` attribute on `<html>` for theming (default: `"dark"`)

---

## Story 1.2 — Set Up the Python Backend Directory

**As a developer, I need the Python 3.13 serverless function directory configured with locked dependency versions so I can build API endpoints.**

### Tasks

**Task 1.2.1 — Create the `api/` directory structure**
- Create `api/` at the project root (Vercel detects this as Python serverless functions)
- Create `api/requirements.txt` with locked version:
  ```
  google-generativeai==0.8.6
  ```
- Create a placeholder `api/__init__.py` (empty, needed for imports)

**Task 1.2.2 — Create a health-check endpoint**
- Create `api/health.py` with a simple handler function that returns `{"status": "ok", "version": "1.0.0"}`
- This serves as a smoke test to verify Python functions deploy correctly
- Follow coding standards: the handler logic should be inside a class

**Task 1.2.3 — Create the `tools/youtube_cli/` directory structure**
- Create `tools/youtube_cli/` at the project root for local CLI tools (transcript fetching and note generation)
- Create `tools/youtube_cli/requirements.txt` with locked versions:
  ```
  youtube-transcript-api==1.2.4
  google-generativeai==0.8.6
  rich==15.0.0
  requests==2.34.2
  ```
- Create `tools/youtube_cli/__init__.py`

**Task 1.2.4 — Verify Python environment**
- Activate the virtual env: `source ~/python_envs/p313_llm/bin/activate`
- Run `uv pip install -r api/requirements.txt`
- Run `uv pip install -r tools/youtube_cli/requirements.txt`
- Verify the health endpoint can be imported without errors

---

## Story 1.3 — Configure Vercel Deployment

**As a developer, I need the Vercel deployment configuration so the app can be deployed and tested.**

### Tasks

**Task 1.3.1 — Create `vercel.json`**
- Create `vercel.json` at project root with:
  - `version: 2`
  - `framework: "nextjs"`
  - Python function builds: `{ "src": "api/*.py", "use": "@vercel/python" }`
  - Function timeout and memory config:
    - YouTube notes receiver (`youtube_notes.py`): `maxDuration: 60`, `memory: 1024`
    - AI endpoints (`generate_quiz.py`, `summarize.py`): `maxDuration: 60`, `memory: 1024`
    - Chat endpoint (`chat.py`): `maxDuration: 60`, `memory: 512`
    - Parsing endpoints (`parse_docx.py`): `maxDuration: 30`, `memory: 512`
  - CORS headers for `/api/*` routes: allow `POST`, `GET`, and `OPTIONS`, `Content-Type, Authorization` headers
  - Security headers for all routes: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`

**Task 1.3.2 — Create environment file templates**
- Create `.env.local.example` with all required environment variables (with placeholder values):
  ```
  GEMINI_API_KEY=your_gemini_api_key_here
  NEXT_PUBLIC_MSAL_CLIENT_ID=your_azure_client_id_here
  NEXT_PUBLIC_MSAL_REDIRECT_URI=http://localhost:3000
  NEXT_PUBLIC_API_URL=http://localhost:3000
  YOUTUBE_NOTES_API_KEY=your_shared_secret_here
  ```
- Create `.env.local` from the template (add to `.gitignore`)
- Ensure `.env.local` is already listed in `.gitignore`

**Task 1.3.3 — Update `.gitignore`**
- Ensure the following are ignored:
  - `node_modules/`, `.next/`, `out/`
  - `.env.local`, `.env*.local`
  - `__pycache__/`, `*.pyc`, `.venv/`
  - `.vercel/`

---

## Story 1.4 — Set Up CI/CD Pipeline

**As a developer, I need automated linting, type checking, and tests so code quality is enforced from the start.**

### Tasks

**Task 1.4.1 — Create GitHub Actions CI workflow**
- Create `.github/workflows/ci.yml` with two jobs:
  - **`frontend`**: Setup Node.js 20, `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test` (if tests exist), `npm run build`
  - **`backend`**: Setup Python 3.13, activate venv, `pip install uv && uv pip install -r api/requirements.txt -r tools/youtube_cli/requirements.txt ruff==0.16.9`, lint Python with ruff (`ruff check api/ tools/`)
- Trigger on: push to `main`/`develop`, pull requests to `main`

**Task 1.4.2 — Configure ESLint for the frontend**
- Ensure `.eslintrc.json` (created by Next.js) has sensible rules
- Add rule for no-unused-vars, no-console (warn)
- Verify `npm run lint` passes cleanly

**Task 1.4.3 — Configure Python linting with ruff**
- Create `pyproject.toml` in project root (or add to existing) with:
  ```toml
  [tool.ruff]
  line-length = 100
  
  [tool.ruff.lint]
  select = ["E", "W", "F", "I"]
  ```
- Verify `ruff check api/ tools/` passes cleanly

**Task 1.4.4 — Add a basic smoke test**
- Create `src/__tests__/smoke.test.ts` that verifies the app can render without crashing
- Run `npm test` to verify the test framework works

---

## Definition of Done

- [ ] `npm run dev` starts the Next.js dev server at `localhost:3000`
- [ ] Visiting `localhost:3000` shows the app shell (sidebar + main area) with design tokens applied
- [ ] `api/health.py` returns a valid JSON response
- [ ] `tools/youtube_cli/` structure and requirements are initialized
- [ ] `vercel.json` is properly configured
- [ ] `.env.local.example` exists with all required env vars documented (including `YOUTUBE_NOTES_API_KEY`)
- [ ] `npm run lint` passes with zero errors
- [ ] `ruff check api/ tools/` passes with zero errors
- [ ] GitHub Actions CI workflow is created
