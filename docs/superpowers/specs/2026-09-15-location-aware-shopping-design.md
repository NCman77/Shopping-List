# Location-Aware Shopping Design

Date: 2026-09-15
Repository: `NCman77/Shopping-List`
Branch: `feature/location-aware-shopping`

## Goal

Add three related capabilities without requiring OpenAI API:

1. A location-aware homepage sort that keeps all currently visible items but prioritizes items for stores closest to the user's current position.
2. A per-item **距離** action beside the existing address action that searches matching nearby branches, sorts them nearest-to-farthest, and opens the selected branch in Google Maps.
3. A compact **all options** picker for category/location filters so long horizontal chip lists remain easy to use.

The implementation must preserve the existing trip isolation, status workflow, pagination, item copy, Google Drive photo behavior, category/location management, and Google Maps address action.

## Architecture

This is a new location subsystem composed of small independent modules and bootstrapped through the existing `feature-bootstrap.js` pattern.

### Modules

- `src/client/location/distance.js`
  - Pure Haversine distance calculation.
  - Formatting such as `85 m`, `1.4 km`.
  - Stable nearest-first sort helpers.

- `src/client/location/browser-location.js`
  - Wraps browser Geolocation API.
  - Never persists the user's live position to Firestore.
  - Supports one-shot acquisition for branch search and watched position for nearby sort.
  - Nearby sort only reorders when movement exceeds a threshold (default 150 m) to avoid UI jitter and battery waste.

- `src/client/location/google-places-loader.js`
  - Dynamically loads Google Maps JavaScript API / Places library after authentication and only when needed.
  - No API key is committed to the public GitHub repository.
  - Reads a user-scoped Google Maps browser key from Firestore settings.
  - Handles unavailable/missing/invalid API configuration without breaking the rest of the app.

- `src/client/location/store-places.js`
  - Place autocomplete for store selection while editing/adding an item.
  - Text search for nearby branches using `Place.searchByText`.
  - Requests only required Place fields to limit billing and data transfer.
  - Converts Google Place results into the app's normalized store shape.

- `src/client/app/store-location-enhancements.js`
  - Adds the optional store-name field and place selection UI to the existing item form.
  - Adds the homepage **距離** action beside the existing address action.
  - Opens a branch-results modal.
  - Provides one-time resolution/backfill for legacy items that have an address but no saved coordinates.

- `src/client/app/nearby-sort.js`
  - Adds the homepage `附近排序` control.
  - Integrates with the existing item workflow rather than replacing it.
  - Applies distance ordering after trip/category/location/status eligibility and before pagination.
  - Preserves existing status semantics: wanted items remain first, then not-wanted, then purchased; within each status group, known-distance items sort nearest-first. Items without a resolvable store location remain visible after known-distance items in their status group.

- `src/client/app/filter-picker.js`
  - Keeps existing horizontal category/location chips.
  - Adds a compact `全部選項`/expand control.
  - Opens a bottom-sheet/modal containing all options at once.
  - Selecting an option applies the existing filter and closes the picker.
  - Adds local text search when there are many options.

## Google Maps / Places Configuration

### No OpenAI API

OpenAI API is not used. Store discovery and branch results come from Google Places; distance is calculated locally in JavaScript.

### User-scoped API key

Because the site is a public static GitHub Pages application, a hard-coded browser API key must not be committed to the repository.

A new account setting will store the user's Google Maps browser API key in the authenticated Firestore preferences document. Firestore rules already scope this document to the signed-in user.

The user should create a Google Maps Platform key with:

- HTTP referrer restriction for the production domains used by this app, including `https://ncman77.github.io/Shopping-List/*` and the Vercel production domain if used.
- API restriction to only the browser APIs needed by this feature (Maps JavaScript API and Places API (New)).

The key is still visible to the browser at runtime, as all browser Maps keys are, so domain/API restrictions are mandatory protection against misuse.

### Lazy API usage

No Places requests are made merely because the homepage loads.

Places is invoked only when:

- the user searches/selects a store while editing an item;
- the user presses **距離**;
- nearby sorting needs a one-time coordinate resolution for an active-trip item that has an address but no saved coordinates.

Once an item has saved coordinates, future distance sorting is local and does not call Places.

## Firestore Item Data

Existing fields are preserved. New optional fields:

```text
storeName          string
storePlaceId       string
storeDisplayName   string
storeAddress       string
storeLat           number
storeLng           number
storeResolvedAt    number
```

Rules:

- `address` remains the user-visible/backward-compatible address field.
- A selected Place updates `store*` fields and also writes the selected formatted address to `address`.
- Existing items are not bulk-migrated.
- Existing items with `address` but no coordinates may be resolved lazily when the feature needs distance data.
- A failed lookup never deletes/replaces the user's original address.
- Editing an item without touching its store fields preserves its existing place metadata.
- Cross-trip item copy must copy reusable store/place metadata so copied items do not require another Places lookup.

## Account Settings Data

Extend the existing authenticated preferences document with:

```text
mapsBrowserApiKey  string
nearbySortEnabled  boolean
```

`nearbySortEnabled` is a preference only. Live latitude/longitude is never stored.

## User Experience

### 1. Store selection in add/edit item

Add an optional field:

```text
商店
[ 松本清____________ ]
```

As the user types, Places autocomplete suggestions are displayed. A selected suggestion saves canonical place data.

The existing manual address input remains editable. Users can still enter an address without selecting a Place.

If Maps API configuration is absent or unavailable, the form continues working exactly as before; store autocomplete is simply unavailable and a short setup message is shown.

### 2. Homepage actions

For an item with an address/store identity:

```text
[地址] [距離]
```

- **地址** retains the existing behavior and opens the current stored address in Google Maps.
- **距離** obtains the current position on demand and opens the branch-results modal.

If `storeName` is missing, the modal asks for a store name first; after a branch is selected, the store identity can be saved back to that item.

### 3. Branch-results modal

Example:

```text
松本清附近分店

120 m   matsukiyo LAB 澀谷店
        東京都渋谷区...

380 m   松本清 道玄坂店
        東京都渋谷区...

1.4 km  松本清 原宿竹下通店
        東京都渋谷区...
```

Behavior:

- Search query is based on `storeName`.
- Search is biased around the user's current position.
- Results request only ID, name, formatted address, location, and business status.
- Closed/permanently closed locations are excluded when status data is available.
- Results are re-sorted locally by Haversine distance to guarantee nearest-first presentation.
- Duplicate Place IDs are removed.
- Tapping a branch opens a Google Maps URL targeting its Place ID when available.
- Search is intentionally "nearby matching branches", not a promise to enumerate every branch in an entire country.

### 4. Nearby homepage sorting

Homepage control:

```text
📍 附近排序  [off/on]
```

When enabled:

1. Request location permission if needed.
2. Keep all items that are already eligible under the active trip and current filters.
3. Keep existing status groups (`wanted`, `not_wanted`, `purchased`).
4. Within each status group, sort known store coordinates nearest-first.
5. Items without coordinates remain visible after known-distance items in the same status group.
6. Apply pagination only after this sort.
7. Recompute distance locally when the user moves about 150 m or more.

Each card with known distance may show a small non-interactive label such as `120 m` or `1.4 km`.

If location permission is denied, nearby sorting switches off for the session and normal ordering remains unchanged.

### 5. Category/location all-options picker

Keep current horizontal chips for quick access.

Add an expand button at the end/right of each filter row:

```text
分類  全部 藥妝 保養 食品 ...  [全部選項]
地點  全部 新宿 澀谷 銀座 ...  [全部選項]
```

The picker:

- lists all currently available options for the active trip;
- includes the existing `全部` filter;
- uses a two-column/grid layout on mobile when practical;
- has a search field when option count is large;
- highlights the current selection;
- selecting an option reuses the existing filtering mechanism and closes the picker;
- does not change global category/location definitions or management behavior.

## Location Permission and Privacy

- Browser location is requested only after the user explicitly enables nearby sorting or taps **距離**.
- Current coordinates stay in browser memory only.
- No background tracking when the page/PWA is closed.
- No user position is written to Firestore, Google Drive, or item documents.
- Store coordinates are saved because they describe public business locations, not the user's position.

## Failure Handling

The new subsystem must fail independently.

- No Maps key: existing app works; location-dependent store discovery shows configuration guidance.
- Invalid/restricted key: existing app works; Places actions show a clear error.
- User denies location: existing ordering/actions remain usable; only nearby functions are unavailable.
- Geolocation timeout/unavailable: preserve normal sort and show retry.
- Places returns no branches: show empty result; do not mutate the item.
- Place resolution fails for a legacy address: keep original address and leave item unsorted by distance.
- Firestore update of resolved store data fails: keep the result usable for the current session but do not claim it was saved.
- Trip switch: stop/restart nearby sort against the new active trip and reset pagination consistently with the existing trip workflow.
- Sign-out/account switch: stop geolocation watcher and clear all in-memory position/place state.

## Compatibility Requirements

Must not regress:

- trip isolation by `tripId`;
- smart active trip selection;
- category/location filter visibility by active trip;
- status filtering and status transitions;
- existing status group ordering when nearby sort is off;
- 10-item pagination and swipe behavior;
- item view/edit behavior;
- item copy between trips, including independent photos;
- Google Drive photo storage/recovery;
- existing address -> Google Maps action;
- category/location add/delete/reorder management;
- PWA/GitHub Pages operation;
- Firebase Auth and Firestore paths/rules.

## Implementation Phases

### Phase 1 — Places/store identity and branch distance

- API-key setting and lazy Maps JS loader.
- Store/place model and pure distance utilities.
- Store autocomplete/select UI in item form.
- Persist optional place metadata.
- Add **距離** action and nearby branch-results modal.
- Preserve existing **地址** action.
- Copy place metadata during cross-trip item copy.
- Add one-time legacy address coordinate resolution where safe.

### Phase 2 — Location-aware homepage sort

- Nearby-sort control.
- Geolocation lifecycle.
- 150 m movement threshold.
- Distance labels.
- Integrate sorting before pagination while preserving status grouping and all existing filters.
- Stop watcher on sign-out/trip context teardown.

### Phase 3 — All-options category/location picker

- Expand controls.
- Reusable all-options modal/bottom sheet.
- Search/highlight/selection behavior.
- Reuse existing filters without touching global definitions.

### Phase 4 — Focused regression review and repair

After all three phases:

- run the full existing CI suite plus all new tests;
- inspect the complete branch diff against `main`;
- review only the surface area changed by this feature for integration bugs and accidental feature loss;
- fix all findings using regression tests before merge;
- repeat until clean;
- open a PR and merge to `main` only when the exact final head passes CI and review.

Do not manually deploy Vercel. GitHub/Vercel deployment remains repository-driven.

## Test Strategy

### Pure unit tests

- Haversine distance and formatting.
- Stable distance sort.
- Unknown-coordinate ordering.
- Place result normalization/deduplication.
- Copy store metadata.
- Movement-threshold decisions.
- filter-picker option normalization/search.

### Source/integration regression tests

- Maps key is not hard-coded in repository source.
- API key setting uses existing user-scoped preferences path and merge semantics.
- Places loader is lazy and failure-isolated.
- Item save preserves place data unless intentionally changed.
- Address action remains present and unchanged.
- **距離** action does not replace address.
- Branch modal opens Google Maps using Place ID when available.
- Geolocation position is never written to Firestore.
- Nearby sort happens before pagination.
- Nearby sort disabled path preserves existing sort exactly.
- Trip switch resets/reconciles nearby view correctly.
- Sign-out stops location watcher.
- category/location picker delegates to existing filtering controls.
- Drive/photo modules are unchanged unless store-copy metadata requires a scoped item-copy edit.

### Final acceptance scenarios

1. Without a Maps API key, every existing shopping-list feature remains functional.
2. With a valid restricted Maps key, typing a store produces Places suggestions and selecting one fills canonical store/address/location metadata.
3. Existing address-only items remain intact and can still open Google Maps.
4. Tapping **距離** with location permission returns matching branches ordered nearest-first; tapping one opens Google Maps.
5. Denying location does not break or hide the shopping list.
6. Enabling nearby sort never hides products solely because distance is unknown.
7. Nearby sort prioritizes nearer wanted items while retaining not-wanted and purchased sections afterward.
8. Changing category/location/status filters still works under nearby sort.
9. Pagination remains 10 per page after distance ordering.
10. Switching between same-country trips never leaks items.
11. A copied item retains its store identity/coordinates but remains an independent item.
12. Category/location `全部選項` displays all active-trip values and selecting one immediately applies the existing homepage filter.
13. Mobile and desktop layouts remain usable.
