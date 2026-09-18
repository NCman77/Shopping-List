# Firestore personalization images

## 供確認的中文摘要

- 首頁橫幅、頁面與商品小卡背景改為只接受 JPEG、PNG、WebP 靜態照片；不再接受 GIF 或影片。商品本身的照片及 Google Drive 流程不變。
- 選取照片後在瀏覽器壓縮，儲存前顯示壓縮後預覽。來源照片上限 25 MB；壓縮後最多 900,000 位元組。原檔不會上傳或保留。
- 每張背景照片獨立存入該使用者的 Firestore 文件，使用 `Bytes` 欄位；個人化設定只保留圖片 ID、順序和位置等資料，避免設定文件超過 Firestore 的 1 MiB 限制。
- Firestore 規則只允許登入者存取自己的背景，並限制欄位、種類、MIME 類型與大小，不開放公開讀取。
- 現有 Google Drive 靜態背景只需一次授權遷移：先壓縮並存入 Firestore、更新設定，成功後才刪除 Drive 舊檔；失敗時保留舊檔與舊設定。
- 先部署經測試的 Firestore 規則，再發佈網站新版。上次的 Firebase CLI 憑證已撤銷，部署前必須重新登入。

## Goal

Remove recurring Google Drive authorization from the three personalization backgrounds: the homepage header, the page background, and the item card background. New uploads are static photos only. The browser compresses each photo before upload and stores only the compressed result in Cloud Firestore. Product photos and their Google Drive workflow remain unchanged.

## Supported media and limits

- Accept JPEG, PNG, and WebP input. Reject GIF, video, and files that the browser cannot decode as a still image. The file picker and validation must agree.
- Accept source files up to 25 MB to bound browser memory use. Never upload the source file.
- Resize without upscaling and try progressively smaller dimensions and WebP/JPEG quality until the encoded output is at most 900,000 bytes. Report a clear error if that cannot be achieved. The stored MIME type must match the actual encoded blob.
- Show the compressed result in the editor preview before the user confirms the save, so loss of detail is visible.
- Use Firestore `Bytes`, not a Base64 data URL. Firestore documents have a 1 MiB limit; the 900,000 byte cap reserves space for metadata and the document path. Each image gets its own document, including each entry of a rotating playlist.

## Data model and access

Create `artifacts/japan-shopping-app/users/{userId}/personalizationMedia/{mediaId}` with `bytes`, `mimeType`, `kind`, `fileName`, and creation time. `kind` is `header`, `page`, or `item-card`. Existing preferences keep their layout, order, and framing fields; each new `fileId` is `firestore:{mediaId}`. This keeps large bytes out of the shared settings document.

Add a Firestore rule for this collection. Only the matching Firebase Auth user may read, create, or delete its documents. Writes must contain only the expected fields, a supported encoded MIME type, a supported kind, and no more than 900,000 bytes. Public reads are forbidden. Updates to image bytes are unnecessary: replacing a background creates a new document and later removes the old one. Existing rules for items, product photos, and other features are unchanged.

## Client flow

Introduce one user-scoped Firestore media service with the same upload, download, delete, and deferred-cleanup operations used by the three personalization screens. Its upload operation compresses the selected photo and writes a dedicated media document. Download returns a `Blob` that the existing background renderers turn into an object URL. The renderer revokes object URLs when the user or selection changes. Firebase Auth, already used by the site, authorizes reads; no Google Drive token is needed for `firestore:` IDs.

The three screens accept still photos and use this service for all new uploads. They retain their current frame controls and rotating playlist behavior. Saving writes new media documents first, then the preferences that reference them. If the preferences write fails, newly written documents are deleted or queued for cleanup. Old media is deleted only after preferences persistence succeeds. A cleanup failure does not hide the newly saved background.

## Legacy photos

Existing Google Drive background IDs remain readable until migrated. When a legacy still photo is detected, offer one Google Drive authorization to download it. Compress it to the new limit, write the Firestore media document, update preferences, and only then delete the old Drive file. If any earlier step fails, keep the old reference and old file. An unsuccessful Drive deletion is queued for later cleanup and does not require Drive access to display the new Firestore image.

The user reports that existing personalization backgrounds are still photos. Do not silently delete an unexpected legacy GIF or video; show that it must be replaced with a supported photo. Preserve existing `storage:` references for compatibility, but do not create new Storage uploads. Product photo Drive IDs and data are outside this migration.

## Verification and rollout

Add focused tests for compression size and MIME handling, the three upload paths, Firestore reads, cleanup ordering, migration failure and success, and the rule's owner and size checks. Run the existing full unit suite and Firestore emulator rules tests. Confirm that the three screens load `firestore:` images after a fresh browser session without a Drive token and that product photo behavior is unchanged.

Deploy the new Firestore rules to the verified Firebase project before publishing the new website code. Deployment requires a fresh Firebase CLI login because the previous CLI credential was revoked. Do not deploy Storage, Hosting, Functions, or unrelated services as part of the rules step. Website publishing follows the project's existing release process. Do not commit any credentials.

## Trade-offs

Firestore will store and transfer the compressed image on every uncached read; it is less suitable than Storage for large or high-resolution media. This design deliberately accepts lower image quality and still-image-only support in exchange for avoiding a Storage bucket and recurring Drive authorization for these backgrounds. The 900,000 byte cap and one-image-per-document structure are required by Firestore's document limit.
