# Item Workflow, Pagination, and PWA Design

## Goal

Update the shopping list so purchase intent is controlled from the homepage, add a reversible `not_wanted` state, paginate the homepage at 10 items per page with touch gestures, make product opening read-only until the user explicitly enters edit mode, and make the site installable as a PWA from mobile Chrome.

## Status model

Keep backward compatibility with existing item documents. Existing `purchased: true` means `purchased`. Existing `purchased: false` with no new status field means `wanted`. New documents may also carry `shoppingStatus: 'wanted' | 'purchased' | 'not_wanted'`.

Status resolution rules:

1. `shoppingStatus === 'not_wanted'` => not wanted.
2. `shoppingStatus === 'purchased'` => purchased.
3. `shoppingStatus === 'wanted'` => wanted.
4. Otherwise fall back to legacy `purchased` boolean.

Writes keep `purchased` synchronized for compatibility: purchased => `purchased: true`; wanted/not wanted => `purchased: false`.

## Homepage filters and card actions

Status filter order becomes `全部`, `想買`, `到手`, `不想買`.

Normal wanted cards show a `不想買` button on the far left and the existing purchase control on the far right. Clicking `不想買` opens a confirmation modal before writing `shoppingStatus: 'not_wanted'` and `purchased: false`.

Not-wanted cards show a `恢復` button on the far left. Clicking it writes `shoppingStatus: 'wanted'` and `purchased: false`, returning the item to `想買`.

Purchased cards remain purchasable/unpurchasable using the homepage purchase control. In the `全部` view, wanted items are ordered first, not-wanted items next, and purchased items last. Within each group, preserve the existing newest-first ordering.

## Add/edit modal

Remove the visible `買到了嗎？` control from add/edit UI. New items always start as wanted.

Opening a product from the homepage enters read-only detail mode. The header shows `編輯` and does not show an enabled save action. Fields, photo controls, and mutating controls are disabled/read-only. Clicking `編輯` enables edit mode and exposes `儲存`. Creating a new item still opens directly in editable mode.

## Pagination and gestures

After country/status/category/location filtering and status ordering, show at most 10 cards per page. Reset to page 1 whenever a filter changes or the active country changes. Show a compact page control below the list when there is more than one page.

On touch devices, horizontal swipe gestures on the item-list area change pages only when horizontal travel clearly dominates vertical travel. Per the approved UX: swipe left => previous page; swipe right => next page. Gestures do not wrap around at the first/last page.

## PWA installation

Add a web app manifest with `display: standalone`, `start_url: ./`, scope `./`, theme/background metadata, and 192x192 plus 512x512 PNG icons. Add a service worker that caches the application shell and uses network-first navigation with cache fallback. Register it from a small standalone client module loaded by the existing bootstrap.

The PWA must work from both the GitHub Pages subpath `/Shopping-List/` and later Vercel root deployment by using relative URLs rather than hard-coded root paths.

## Architecture

Prefer additive focused modules over expanding `index.html` or the already-large enhancement files. Pure status/pagination logic lives in a testable helper module. DOM orchestration for status actions, pagination, gesture handling, and detail/edit mode lives in a homepage workflow enhancement module loaded independently by `feature-bootstrap.js`. PWA registration lives in its own module.

## Compatibility and safety

- Do not bulk-migrate Firestore documents.
- Preserve country isolation and existing category/location management.
- Preserve Google Drive photo behavior.
- Keep existing data readable by older code through synchronized `purchased` boolean writes.
- New behavior must fail closed: inability to write a status must leave the visible state unchanged and surface an error.
- All new production behavior requires regression tests and must pass the repository GitHub Actions workflow before merge.
