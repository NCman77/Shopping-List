# Project Structure Refactor Design

## Goal
Reorganize the Shopping List repository into clear frontend, Firebase, test, documentation, and static-asset areas without changing Firestore document paths, existing user data, Google Drive appDataFolder contents, or user-visible behavior.

## Constraints
- Keep Firestore paths exactly under `artifacts/japan-shopping-app/users/{uid}/...`.
- Do not migrate, copy, rewrite, or delete existing Firestore documents.
- Do not move or delete existing Google Drive files or `itemPhotos` metadata as part of this refactor.
- Preserve current Google authentication, filters, item CRUD, website/address actions, multi-photo upload/delete, Drive reconnect, persistent thumbnails, fixed mobile add button, avatar-only header, and category/location management behavior.
- No secrets may be committed. A future private GitHub repository improves source privacy but browser-delivered client code remains observable.
- Vercel and GitHub Pages must continue to deploy successfully.

## Target repository structure

```text
/
├─ index.html
├─ src/
│  └─ client/
│     ├─ app/
│     │  ├─ app-enhancements.js
│     │  ├─ auth-session.js
│     │  └─ home-ui-enhancements.js
│     ├─ filters/
│     │  └─ filter-management.js
│     ├─ photos/
│     │  ├─ drive-photo-service.js
│     │  ├─ drive-upload-rollback-fetch.js
│     │  ├─ image-compression.js
│     │  ├─ photo-metadata.js
│     │  ├─ photo-upload-transaction.js
│     │  ├─ photo-visibility-enhancements.js
│     │  └─ photo-visibility-state.js
│     └─ utils/
│        └─ url-utils.js
├─ firebase/
│  ├─ firebase.json
│  └─ firestore.rules
├─ tests/
│  ├─ app/
│  ├─ filters/
│  ├─ photos/
│  └─ utils/
├─ docs/
├─ .github/workflows/
├─ README.md
└─ .gitignore
```

`index.html` remains at repository root so both Vercel static hosting and GitHub Pages can continue serving the same entry point without introducing a new bundler in this migration. `public/` is intentionally not introduced yet because this repository is not currently using Vite/another bundler where `public/` has special deployment semantics; adding a cosmetic `public/` folder would create false security and deployment ambiguity.

## Module boundaries
- `src/client/app`: application bootstrapping and page-level enhancements.
- `src/client/filters`: category/location ordering and deletion rules.
- `src/client/photos`: Drive storage, upload transactions, compression, metadata, and visibility recovery.
- `src/client/utils`: generic URL helpers.
- `firebase`: deployable Firebase configuration/rules only.
- `tests`: mirrors the production module domains so tests no longer clutter the root.

## Import strategy
All relative imports are updated after moves. `index.html` loads `src/client/app/auth-session.js` as the single external module entry used by the existing page. Dynamic imports inside `auth-session.js` remain relative to its new directory. Cross-domain imports use explicit `../photos/...`, `../filters/...`, or `../utils/...` paths.

## Deployment and compatibility
The refactor is path-only plus import rewiring. No build step is added, so deployed JavaScript remains native ES modules exactly as today. GitHub Pages and Vercel can serve nested module files directly.

## Verification
Required before merge:
1. All existing Node regression/unit tests pass from their new locations.
2. Syntax-check every production JavaScript module.
3. Static dependency check verifies every local import target exists.
4. `index.html` references the new auth entry path and contains no references to deleted root JS paths.
5. Firestore path guard verifies `artifacts/japan-shopping-app/users` remains in the application modules/rules and no new top-level `/users` schema is introduced.
6. Firebase rules content is functionally unchanged after moving to `firebase/firestore.rules`.
7. GitHub Pages deployment succeeds from the resulting `main` commit.
8. Vercel deployment status succeeds from the same `main` commit.

## Non-goals
- No Firestore migration.
- No Firebase SDK upgrade.
- No conversion to React/Vue/Vite.
- No server/API introduction in this refactor.
- No user-facing feature redesign.
