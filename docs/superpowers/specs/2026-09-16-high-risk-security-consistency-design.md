# High-Risk Security and Consistency Design

## Goal

Eliminate the four approved high-risk defects without changing the shopping-list product flow:

1. Stored XSS and HTML injection through persisted item, category, location, description, identifier, and photo data.
2. An asynchronous item save writing form B values into item A.
3. A background download or save from an earlier authentication session affecting a later session.
4. Google Drive files becoming orphaned when their corresponding Firestore save fails.

## Scope

This change covers the main item filter, select, and card renderers in `index.html`; the enhanced item-save flow and its trip-save wrapper; background personalization download/save behavior; and Drive photo upload rollback.

Existing persisted strings remain unchanged. Text resembling HTML, such as `<b>東京</b>`, is displayed literally rather than interpreted or stripped. No data migration is required.

The work does not add a framework, replace Firebase, redesign the user interface, change Firestore paths, change Google Drive scopes, or address lower-priority findings from the audit.

## Architecture

### 1. Safe persisted-data rendering

Persisted or user-controlled values must never be concatenated into an HTML string or inline event-handler attribute.

The filter, form-select, and item-card renderers will create their static structure with DOM APIs or a static template containing no persisted values. They will then assign:

- visible values with `textContent`;
- category/location/item identifiers through DOM properties or `dataset`;
- event behavior with `addEventListener` closures;
- link destinations through URL construction followed by property assignment;
- image sources only after validation by a dedicated allow-list function.

Allowed image sources are HTTPS URLs and the image forms already used by this application: `blob:` object URLs and base64 `data:image/` URLs for supported raster formats. Script-capable or unexpected schemes are rejected and the normal no-photo placeholder is shown.

The card continues to expose the selectors and data attributes required by existing enhancement modules. Styling and visible labels remain unchanged except that stored HTML is shown literally.

### 2. Immutable item-save operation

Opening or closing the item modal advances a modal generation value. At the start of a save, before any network wait, the application captures an immutable operation containing:

- operation ID and modal generation;
- authenticated user ID;
- item ID and whether this is a new item;
- every form value;
- copied pending-photo entries;
- copied removed-photo IDs;
- existing trip membership inputs needed by the trip-save wrapper.

The save button is disabled before the first asynchronous Firestore or Drive call. All later reads use the captured operation rather than live DOM fields or mutable global photo collections.

Before account-sensitive side effects, the operation verifies that the authenticated UID still matches. UI completion also verifies that the modal generation still belongs to the operation. A stale operation may finish or roll back its own persistence work, but it must not close, clear, or overwrite a newer editor.

The base save function returns an explicit result object with `succeeded`, `itemId`, and `userId`. The trip-save guard consumes that result instead of inferring success from a CSS transform class. A reserved new item is removed only when the same operation explicitly reports failure.

Concurrent presses of the save button are ignored while the current save owns the button.

### 3. Authentication-session guard for backgrounds

Background personalization maintains an authentication generation that advances on every auth-state callback, including logout. Every download and save captures:

- the current UID;
- the auth generation;
- the exact Firestore settings reference;
- the relevant normalized preferences and pending file.

After each asynchronous Drive or Firebase boundary, the operation checks that UID and generation are still current before applying an object URL, updating shared state, closing the editor, or showing a success-dependent UI state.

Firestore writes use the captured settings reference and never recompute it after an await. If the session becomes stale before persistence, no Firestore write occurs. If a stale save already uploaded a Drive file, that file is rolled back; failed deletion is queued under the original UID. Object URLs created by stale downloads are revoked immediately.

Only the most recent background load for the active auth generation may update the displayed background.

### 4. Drive upload transaction ownership

The item-save flow explicitly owns the Drive uploads it starts. The photo transaction records every successfully uploaded Drive file ID and remains uncommitted until the Firestore batch succeeds.

If upload, thumbnail generation, operation validation, or Firestore commit fails, all newly uploaded files from that operation are rolled back. Rollback attempts immediate Drive deletion when authorization is available and always queues any deletion that fails, including authorization failures.

Existing Drive files and photo metadata are not deleted during rollback. Removal of pre-existing photos continues only after the Firestore batch has committed its `deleting` state.

Successful Firestore commit marks the upload transaction complete so those file IDs are no longer eligible for rollback.

The existing fetch-level rollback remains a defense for partial upload-request failures, while the higher-level item transaction covers failures after all upload requests succeeded.

## Error Handling

- Validation errors leave the modal open and do not start network work.
- Authentication changes produce a stale-operation result and silently prevent old UI updates; any uploaded file is still cleaned up.
- Firestore and Drive errors continue to use the existing user-facing message system.
- Rollback failure never replaces the original save error. It is logged and recorded in the per-user cleanup queue.
- Cleanup queue entries are de-duplicated.

## Testing Strategy

Implementation follows test-driven development. Each behavior receives a regression test that is observed failing before production code changes.

Required coverage:

1. Persisted HTML strings are treated as text in filters, selects, and item cards; malicious identifiers do not create inline handlers; unsafe image schemes are rejected.
2. A save snapshot remains tied to item A even if the live form changes to item B while `getDoc`, upload, thumbnail creation, or commit is pending.
3. A stale item save does not close or clear a newer modal generation.
4. The trip-save guard uses the explicit save result and cleans only the reservation owned by a failed new-item operation.
5. A background download completing after logout or account switch cannot apply its object URL.
6. A background save uses its captured user reference and rolls back an upload when the auth generation becomes stale.
7. Item photo uploads are deleted when Firestore commit fails; deletion failures and authorization failures enter the correct user's cleanup queue.
8. Successful item and background saves retain their newly uploaded files.

After focused tests pass, run the complete Node test suite, syntax-check every tracked JavaScript file, and inspect the Git diff. Existing unrelated test failures must be reported separately and must not be represented as caused by this change without evidence.

## Acceptance Criteria

- No persisted value in the scoped renderers is inserted through HTML interpolation or inline event-handler interpolation.
- Existing strings containing markup display literally.
- Item saves cannot mix IDs, fields, photos, users, or modal state across operations.
- Background work cannot cross authentication generations.
- Every Drive file uploaded by a failed item or background save is either deleted or durably queued for cleanup under its originating user.
- All new regression tests pass, and no previously passing test regresses.

