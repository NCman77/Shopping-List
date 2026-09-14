# Project Structure Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the repository into domain-based source/test/Firebase directories while preserving all current behavior and all existing Firestore/Drive data paths.

**Architecture:** Keep the app as native static ES modules with root `index.html`; move implementation modules into `src/client/*`, tests into mirrored `tests/*`, and Firebase files into `firebase/*`. Rewire relative imports and deployment/test configuration without introducing a bundler or changing the database schema.

**Tech Stack:** Static HTML, native ES modules, Firebase 11.6.1 browser modules, Google Drive API, Node built-in test runner, GitHub Actions, Vercel, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-14-project-structure-refactor-design.md`

## Global Constraints
- Keep Firestore paths exactly under `artifacts/japan-shopping-app/users/{uid}/...`.
- Do not migrate or delete Firestore documents or Drive files.
- Preserve all current user-visible behavior.
- No secrets committed.
- Vercel and GitHub Pages must remain deployable.

---

### Task 1: Define structural regression tests

**Files:**
- Create: `tests/structure/project-structure.test.mjs`

**Interfaces:**
- Consumes repository files through Node `fs`.
- Produces automated assertions for required directories, entrypoint path, local import resolution, and Firestore schema preservation.

- [ ] **Step 1: Write tests that expect the new directory layout and fail on the old layout.**
- [ ] **Step 2: Verify the test fails because production files are still at repository root.**
- [ ] **Step 3: Keep this test as the migration acceptance guard.**

### Task 2: Move production modules by domain

**Files:**
- Move app modules to `src/client/app/`.
- Move photo modules to `src/client/photos/`.
- Move filter module to `src/client/filters/`.
- Move URL helper to `src/client/utils/`.

**Interfaces:**
- `src/client/app/auth-session.js` remains the browser bootstrap module.
- Existing exported function names stay unchanged.

- [ ] **Step 1: Move files using Git tree entries without modifying contents.**
- [ ] **Step 2: Update imports in moved modules to their new relative locations.**
- [ ] **Step 3: Update `index.html` to load `./src/client/app/auth-session.js`.**
- [ ] **Step 4: Run structural/import tests and syntax checks.**

### Task 3: Move tests and Firebase configuration

**Files:**
- Move app tests to `tests/app/`.
- Move photo tests to `tests/photos/`.
- Move filter tests to `tests/filters/`.
- Move URL test to `tests/utils/`.
- Move `firebase.json` and `firestore.rules` to `firebase/`.

**Interfaces:**
- Tests import production modules through `../../src/client/...`.
- Firebase config points at `firebase/firestore.rules` where necessary.

- [ ] **Step 1: Move test/config files.**
- [ ] **Step 2: Rewire test imports.**
- [ ] **Step 3: Preserve Firestore rules semantics byte-for-byte except path/config references required by the move.**
- [ ] **Step 4: Run all tests.**

### Task 4: Update CI and documentation

**Files:**
- Modify: `.github/workflows/feature-tests.yml`
- Modify: `README.md`
- Modify: `docs/engineering-guardrails.md`

**Interfaces:**
- CI recursively discovers `tests/**/*.test.mjs` and `src/client/**/*.js`.

- [ ] **Step 1: Update CI commands for nested source/tests.**
- [ ] **Step 2: Add structural and Firestore schema guards to CI.**
- [ ] **Step 3: Document the new repository map and privacy model.**
- [ ] **Step 4: Run the complete CI suite.**

### Task 5: Final compatibility verification

**Files:** No new production behavior.

- [ ] **Step 1: Verify all local imports resolve from `index.html` and production modules.**
- [ ] **Step 2: Verify no old root JS files remain.**
- [ ] **Step 3: Verify no Firestore migration strings or alternate user schema were introduced.**
- [ ] **Step 4: Verify branch CI is green.**
- [ ] **Step 5: Review diff for behavior-changing code; only path/import/config/docs changes are acceptable.**
- [ ] **Step 6: Merge to `main` only after all required checks pass, then verify Vercel and GitHub Pages deployment statuses for the merge commit.**
