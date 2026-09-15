# Maps API Usage Hardening & Filter Picker UX Design

Date: 2026-09-15
Branch: `feature/maps-api-usage-hardening`
Base: `main@9134751e8ed9da3d8a1d25e9b71b1c385269a2c3`

## Goals

1. Reduce unnecessary Google Places requests while keeping short store names usable.
2. Make autocomplete sessions bill and terminate correctly.
3. Reuse permitted place metadata safely instead of re-querying unnecessarily.
4. Make nearby branch search explicit: opening the distance sheet does not call Places; pressing Search does.
5. De-duplicate repeated nearby searches for the same store and effectively same location.
6. Support one primary and one backup Browser API key for credential rotation/failure recovery, not quota circumvention.
7. Make Google Maps configuration understandable and testable from Account → API Settings.
8. Merge the existing “全部選項” entry into the leftmost “全部 ▼” category/location control.

## Non-goals

- Do not automate Google Cloud quota changes from the static web app.
- Do not store Cloud IAM credentials, service-account credentials, or unrestricted server secrets in the client.
- Do not rotate to the backup key when quota is exhausted.
- Do not implement multi-account/free-tier quota hopping.
- Do not change Firestore trip isolation, photo storage, auth, item status semantics, or pagination semantics.

## Current state

- The app already uses a 300 ms autocomplete debounce and `AutocompleteSessionToken` in `store-location-enhancements.js`.
- A selected place currently stores `storePlaceId`, resolved display name/address, `storeLat`, `storeLng`, and `storeResolvedAt` in the item.
- The distance sheet currently auto-runs a nearby Places Text Search when opened if a store query exists.
- A single Browser API key is stored in user-scoped Firestore preferences as `mapsBrowserApiKey` and copied to `window.shoppingListMapsBrowserApiKey`.
- `filter-picker.js` currently appends a separate “全部選項” button to the right end of each horizontal filter strip.

## Google policy constraints

- Place IDs may be stored indefinitely. Google recommends refreshing IDs older than 12 months.
- Places API latitude/longitude may be cached for up to 30 consecutive calendar days, after which they must be deleted/refreshed.
- Other Places content must not be treated as a permanent local Places database. User-authored store names/address text remain user data; Google-returned fields are transient display data unless explicitly permitted.
- Browser keys are client-side credentials and therefore visible to the browser. Security comes from website HTTP referrer restrictions, API restrictions, quota controls, and optional supported App Check—not from pretending a browser key is a server secret.

## 1. Autocomplete request policy

### Trigger rules

- 0 characters: hide suggestions, no request.
- 1 character: no automatic Places request. Show a small explicit “搜尋” action in the suggestion panel so a genuinely one-character store name can still be queried intentionally.
- 2+ characters: start/continue autocomplete after **450 ms debounce**.
- A newer input increments a monotonically increasing request id. Responses from older request ids are ignored.
- Re-focusing an unchanged resolved store value does not start a new request.

### Session lifecycle

A session starts on the first actual autocomplete request after the store input was changed.

- Create one fresh `AutocompleteSessionToken` per session.
- Reuse it for subsequent autocomplete requests in the same typing/selection interaction.
- A successful prediction selection calls `prediction.toPlace()` + `place.fetchFields()`; Google automatically associates the prediction session token with that first `fetchFields()` call, and that ends the session.
- After selection, cancellation, modal close, account change, or a materially new search interaction, discard the token. The next request creates a new token.
- Never reuse a completed token.

## 2. Persisted store identity and permitted cache

### Long-lived item data

Persist:

- `storeName`: the user-entered generic chain/store search text (e.g. `松本清`).
- `storePlaceId`: Google Place ID; allowed to be stored long term.
- `storeResolvedAt`: timestamp for the current coordinate cache.
- `storeLat` / `storeLng`: cached only while younger than 30 days.

### Existing compatibility fields

Existing items may already contain `storeDisplayName` and `storeAddress`. Do not destructively migrate or delete them in this change. New code must not depend on these fields as permanent authoritative Google content.

- `storeName` is the primary human-facing reusable store identity.
- `storePlaceId` is the primary reusable Google identity.
- `storeLat` / `storeLng` are valid only when `storeResolvedAt` is within 30 days.
- Expired coordinates are treated as unknown and refreshed only when functionality actually needs them.
- Existing user-entered `address` remains the user’s own item address field and is not overwritten unless the user explicitly selects a prediction.

## 3. Nearby branch search behavior

### Opening the sheet

Clicking homepage “距離”:

- opens the sheet;
- prefills the query from `storeName`, falling back to existing resolved display name for old data;
- obtains no Places result merely by opening;
- does not start Text Search automatically;
- may show a passive hint such as “按搜尋取得附近分店”.

### Pressing Search

Only the explicit Search button or Enter key:

1. gets current browser geolocation;
2. loads Places with the active credential;
3. runs Text Search;
4. locally sorts returned candidates by distance;
5. displays results;
6. tapping a result opens Google Maps using `query_place_id` when available.

Repeated clicks while the identical request is already in flight share/ignore the duplicate rather than sending another request.

## 4. Nearby result de-duplication/cache

The app will use a short-lived in-memory search cache only for request suppression/performance.

Cache key:

- normalized store query;
- active credential generation;
- quantized user location cell representing an effectively nearby origin (target approximately 150–250 m granularity).

Behavior:

- short TTL (target 5 minutes);
- no Firestore persistence of full nearby result lists;
- cached result objects are discarded on sign-out, account switch, key change, explicit refresh, or TTL expiry;
- cache is not used to evade Google usage metering and is not a durable Places database.

## 5. API key settings and failover

### Data model

In the authenticated user preference document:

```text
mapsApiKeys.primary
mapsApiKeys.backup
```

Backward compatibility:

- if legacy `mapsBrowserApiKey` exists and `mapsApiKeys.primary` is empty, treat it as the primary key in memory;
- on the next explicit Save in API Settings, write the new structure;
- do not commit any actual key to GitHub.

### UI

Account Settings gains an `API 設定` view containing Google Maps / Places:

- Primary Browser API Key (masked input)
- Backup Browser API Key (optional, masked input)
- Save
- Remove backup
- Test primary
- Test backup
- status text showing which key is currently active
- concise setup guidance for HTTP referrer and API restrictions
- quota setup guidance/link; quota is configured in Google Cloud Console, not by this frontend

### Security posture

The UI clearly states:

- Browser API keys are visible to the browser at runtime.
- Restrict both keys to approved website HTTP referrers.
- Restrict APIs to Maps JavaScript API and Places API (New) as required by the app.
- Never paste service-account/private server credentials into this page.

### Backup activation rules

Backup is only attempted for credential/bootstrap failures attributable to the primary key, such as an invalid/revoked/restricted key causing the Maps JavaScript library to fail.

Do **not** automatically switch to backup for:

- quota/rate-limit exhaustion;
- billing disabled;
- request-denied conditions indicating account/project policy or billing state;
- ordinary Places no-results responses.

When quota is exhausted, show a clear “Google Maps quota reached; check Cloud Console quota/billing” message and stop.

Because Maps JavaScript API is global in one browser page, key failover must be conservative: if a key-specific script load fails before the library is initialized, try backup once. If Google Maps is already loaded successfully in the page, changing keys takes effect after page reload unless the loader can prove a safe reinitialization path. The UI must never claim a hot key swap succeeded when the already-loaded global library is still using the old key.

## 6. Quota safety

The web app cannot safely modify Google Cloud quota directly because that would require management/IAM credentials inappropriate for a static browser app.

Instead:

- provide setup instructions in API Settings;
- encourage a hard quota in Google Cloud for Places requests;
- distinguish quota protection from budget alerts (alerts notify; quota stops requests);
- on quota-related runtime errors, stop retry/failover loops and surface actionable guidance.

## 7. “全部 ▼” filter picker UX

Remove the separately appended rightmost `全部選項` button.

For both category and location strips:

- the native leftmost `全部` chip becomes `全部 ▼` visually;
- a real user click on that chip opens the existing complete-picker modal;
- the picker modal contains an `全部` option that performs the actual no-filter selection;
- choosing any picker option delegates to the original source filter button so there is still one source of truth;
- programmatic resets on active-trip changes must select the no-filter state **without opening the modal**;
- existing horizontal chips remain usable for direct quick filtering.

Implementation should distinguish trusted/internal reset from a user pointer/click activation so the trip-switch `.click()` path does not open the picker.

## 8. Error handling

- Missing key: API Settings CTA, not repeated noisy errors on every keystroke.
- One-character autocomplete: no automatic request; manual Search remains possible.
- Places load failure: classify credential-like vs quota/billing vs generic network error.
- Credential-like primary failure: backup may be attempted once.
- Quota/billing failure: no key rotation; stop and explain.
- Stale autocomplete response: silently ignored.
- Account/key change: invalidate in-flight autocomplete, nearby requests, session token, and caches.

## 9. Testing strategy

Use TDD. Add regression coverage for at least:

1. 450 ms autocomplete scheduling contract and two-character automatic threshold.
2. one-character input does not auto-query but manual search path is allowed.
3. session token is reused within a session and renewed after successful selection.
4. stale suggestion responses cannot overwrite newer input.
5. stored coordinates expire after 30 days; Place ID remains reusable.
6. opening Distance does not invoke Text Search.
7. Search/Enter invokes Text Search exactly once for duplicate in-flight action.
8. nearby cache key treats sufficiently close origins as the same cell and expires after TTL.
9. primary key failure can attempt backup once; quota-related errors never rotate.
10. legacy `mapsBrowserApiKey` is read as primary without destructive migration.
11. API Settings never writes keys into source/static markup.
12. user click on `全部 ▼` opens picker; internal trip reset does not.
13. standalone `全部選項` controls are absent.
14. all existing trip/status/pagination/item-save tests remain green.

## 10. Files likely affected

- `src/client/app/account-settings.js`
- `src/client/app/filter-picker.js`
- `src/client/app/store-location-enhancements.js`
- `src/client/location/google-places-loader.js`
- `src/client/location/store-places.js`
- possibly a small new pure helper module for Places request/cache/key policy
- corresponding tests under `tests/app/` and `tests/location/`

No Firestore collection/schema migration is required; only the user preference document gains the new `mapsApiKeys` shape while retaining legacy-read compatibility.

## Acceptance criteria

- Short store names remain usable.
- Normal typing materially reduces Places calls.
- Autocomplete sessions terminate correctly on selection.
- Existing resolved items do not trigger unnecessary lookup work.
- Distance performs no Places search until explicit Search/Enter.
- Repeated identical nearby searches within a short window avoid duplicate calls without building a permanent Google data cache.
- Primary/backup credential rotation is available for key failure, never quota circumvention.
- User can configure/test keys without sharing them with ChatGPT or committing them to GitHub.
- Google Cloud quota remains a Cloud Console responsibility with clear guidance in-app.
- Category/location `全部 ▼` opens the full picker immediately, with no right-end `全部選項` button.
