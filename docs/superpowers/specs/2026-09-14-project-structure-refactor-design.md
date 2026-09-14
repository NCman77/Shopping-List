# Project Structure Refactor Design

## Goal
Reorganize the Shopping List repository into clear frontend, Firebase, test, and documentation areas without changing Firestore document paths, existing user data, Google Drive `appDataFolder` contents, or user-visible behavior.

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
├─ auth-session.js               # thin compatibility bootstrap only
├─ firebase.json                 # Firebase CLI standard entrypoint
├─ src/
│  └─ client/
│     ├─ app/
│     ├─ filters/
│     ├─ photos/
│     └─ utils/
├─ firebase/
│  └─ firestore.rules
├─ tests/
│  ├─ app/
│  ├─ filters/
│  ├─ photos/
│  ├─ utils/
│  └─ structure/
├─ docs/
├─ .github/workflows/
├─ README.md
└─ .gitignore
```

`index.html` remains at repository root so Vercel and GitHub Pages keep serving the same entry point without adding a bundler. The root `auth-session.js` remains as a deliberately tiny compatibility bridge because the existing 50KB inline page imports it; this avoids rewriting `index.html` solely for a path change. The real bootstrap and application logic live under `src/client/app/`.

`firebase.json` also remains at root because that is the Firebase CLI convention. It points to `firebase/firestore.rules`.

`public/` is intentionally not introduced because this project does not currently use Vite/another bundler where `public/` has special semantics. Creating it only for appearance would not make files more or less public. Likewise, no empty `server/` or `api/` directory is created until the app actually has server-side logic.

## Module boundaries
- `src/client/app`: application bootstrapping and page-level enhancements.
- `src/client/filters`: category/location ordering and deletion rules.
- `src/client/photos`: Drive storage, upload transactions, compression, metadata, and visibility recovery.
- `src/client/utils`: generic URL helpers.
- `firebase`: Firestore rules.
- `tests`: mirrors production domains and adds structure/UI smoke coverage.

Compatibility shims inside `src/client/app/` may re-export cross-domain helpers when needed to preserve the existing large modules byte-for-byte during this low-risk migration. They contain no application logic and can be removed in a later focused refactor.

## Deployment and compatibility
The refactor is path-only plus import/entrypoint rewiring. No build step, framework migration, SDK upgrade, or database migration is added. Deployed JavaScript remains native ES modules.

## Verification
Required before merge:
1. All existing Node regression/unit tests pass from their organized locations.
2. Syntax-check every `src/client/**/*.js` module and the root bootstrap.
3. Static dependency check verifies every local client import target exists.
4. Root bootstrap remains a thin bridge into `src/client/app/auth-session.js`.
5. User-visible smoke tests verify essential DOM anchors and feature markers remain present.
6. Firestore path guard verifies `artifacts/japan-shopping-app/users` remains in application modules/rules and no new top-level `/users` schema is introduced.
7. `firebase.json` points to `firebase/firestore.rules`, whose authorization semantics remain unchanged.
8. Branch CI must be green before merge.
9. GitHub Pages and Vercel must deploy successfully from the resulting `main` commit.

## Non-goals
- No Firestore migration.
- No Firebase SDK upgrade.
- No conversion to React/Vue/Vite.
- No server/API introduction in this refactor.
- No user-facing redesign.
