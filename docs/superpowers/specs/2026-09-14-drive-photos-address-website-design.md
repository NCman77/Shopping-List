# 購物清單：地址、網站與 Google Drive 多照片設計

日期：2026-09-14

## 目標

在現有購物清單中加入三項能力：

1. 商品可記錄地址，並用按鈕在 Google 地圖定位。
2. 商品可記錄介紹網站，並從商品卡片開啟外部頁面或影片介紹。
3. 商品可附加多張照片；照片在瀏覽器內自動壓縮後，存入登入者 Google Drive 的隱藏應用程式資料區，讓不同裝置登入同一 Google 帳號後讀取。

這次不使用 Firebase Storage，因此不需要為照片功能升級 Firebase Blaze 方案。

## 範圍與限制

- 使用者介面不設定每件商品的照片張數上限。
- 實際可保存的照片量仍受使用者 Google Drive 剩餘容量、Google API 配額、瀏覽器記憶體與網路狀況限制，不能保證數學意義上的無限。
- 影片只保存外部網址，不下載、不轉存，也不嵌入第三方影片。
- Google 地圖使用 Maps URL 開啟搜尋，不使用 Google Maps JavaScript API，也不需要 Maps API Key。
- 維持現有 Firebase Authentication 與 Firestore；Firebase Auth 負責身分，Firestore 負責清單資料，Drive 只負責照片檔案。

## 系統架構

### Firebase Authentication

- Google 登入仍是主要登入方式。
- Google 登入提供 Firebase 使用者 UID，作為 Firestore 資料隔離依據。
- Google Provider 額外要求 `https://www.googleapis.com/auth/drive.appdata` 權限，以存取該應用程式自己的 Drive 隱藏資料。
- Drive OAuth access token 只保存在目前瀏覽器工作階段的記憶體或 `sessionStorage`，不寫入 Firestore，也不長期保存在 `localStorage`。
- 若 token 過期或不存在，照片區顯示「重新連結 Google Drive」按鈕；由使用者點擊後透過 Google 重新驗證取得新 token。

### Firestore

- 商品文件保存名稱、分類、購買地點、地址、網站、描述、購買狀態、封面照片 ID 與建立／更新時間。
- 每張照片使用獨立的照片索引文件，避免所有照片 metadata 塞進同一商品文件而受 Firestore 單文件大小限制。
- 現有 Firestore UID 安全規則繼續保護商品與照片索引。

### Google Drive `appDataFolder`

- 實際壓縮照片上傳至使用者 Drive 的 `appDataFolder`。
- 這些檔案不會顯示在一般 Google Drive 檔案列表中，只能由本應用程式透過 Drive API 存取。
- 照片計入使用者的 Google Drive 儲存空間。
- 使用者若在 Google 帳號中刪除本應用程式的隱藏資料，照片將無法復原；清單文字資料仍保留於 Firestore。

## 資料模型

商品文件沿用目前路徑：

`artifacts/japan-shopping-app/users/{uid}/items/{itemId}`

新增或保留以下欄位：

```text
name: string
category: string
location: string
address: string
website: string
description: string
purchased: boolean
coverPhotoId: string | null
createdAt: number
updatedAt: number
photoUrl: string | null  // 僅供舊版單張 Base64 照片相容
```

照片索引使用同一使用者下的獨立 collection：

`artifacts/japan-shopping-app/users/{uid}/itemPhotos/{photoId}`

```text
itemId: string
driveFileId: string
fileName: string
mimeType: string
width: number
height: number
size: number
order: number
status: "active" | "deleting"
createdAt: number
```

商品與照片索引各使用一個即時監聽器，前端依 `itemId` 合併資料，避免為每件商品建立額外監聽器。只有 `active` 照片顯示在畫面；照片順序依 `order` 排列，第一張作為封面。第一版不提供拖曳排序。

## 畫面與互動

### 地址

- 在「哪裡買」下方新增完整寬度的「地址」輸入欄位。
- 輸入欄位右側提供小型地圖按鈕。
- 地址為選填；沒有地址時按鈕停用。
- 點擊後以新分頁開啟：

  `https://www.google.com/maps/search/?api=1&query={URL 編碼後的地址}`

- 不自動加上國家名稱，避免非日本地址被錯誤定位；使用者輸入的完整地址原樣送入 Google 地圖搜尋。

### 網站

- 在新增／編輯商品共用視窗中，於「買到了嗎？」上方加入「網站」欄位。
- 網址為選填。
- 若使用者輸入網域但未輸入協定，儲存時自動補上 `https://`。
- 只接受 `http:` 或 `https:` 網址；其他協定顯示錯誤並停止儲存，避免 `javascript:` 等不安全連結。
- 有網站的商品卡片顯示「觀看介紹」按鈕，以新分頁開啟並加上 `noopener,noreferrer` 防護。

### 多張照片

- 檔案選擇器啟用 `multiple`，可一次選多張，也可分次追加。
- 預覽區使用縮圖格狀排列，顯示上傳前的新照片與既有照片。
- 每張縮圖有刪除按鈕；第一張標示為封面。
- 使用者選擇照片後立即在本機壓縮，不必等到按下儲存才處理。
- 儲存期間停用重複提交，顯示目前上傳張數與總張數。
- 商品卡片只下載封面縮圖；打開商品／編輯畫面後才載入其餘照片，以降低手機流量與 Drive API 請求量。
- 點擊照片可查看較大版本；畫面關閉或照片更換時撤銷瀏覽器 object URL，避免記憶體累積。

## 照片壓縮

- 將照片依 EXIF／瀏覽器解碼後的正確方向載入。
- 最長邊超過 1600px 時等比例縮小；較小照片不放大。
- 優先輸出 WebP，品質約 0.82；瀏覽器無法輸出 WebP 時改用 JPEG，品質約 0.82。
- 壓縮不成功時不直接上傳原始大圖，而是標示該檔失敗，讓使用者移除或重新選擇，避免意外耗盡 Drive 空間。
- 各照片獨立處理；單張失敗不清除其他已選照片。
- 同時最多處理或上傳兩張照片，避免手機因大量影像同時解碼而記憶體不足。

## 儲存與同步流程

### 新增商品

1. 前端先產生 Firestore 商品 ID。
2. 驗證文字、網站網址與照片狀態。
3. 若有照片但沒有有效 Drive token，要求使用者按下「連結 Google Drive」，完成後再繼續。
4. 將壓縮後照片上傳到 `appDataFolder`，並記錄 Drive file ID。
5. 所有照片成功後，寫入商品文件與照片索引文件。
6. 若照片上傳失敗，刪除本次已上傳的 Drive 檔案，不建立商品文件，並保留表單供重試。
7. 若 Firestore 寫入失敗，盡力刪除本次上傳檔案並顯示錯誤；下次成功連結 Drive 時再嘗試清理未完成檔案。

### 編輯商品

1. 既有照片保持不動，只上傳本次新增的照片。
2. 新照片上傳成功後更新商品與照片索引。
3. 使用者移除的舊照片在 Firestore 更新成功後才從 Drive 刪除，避免儲存失敗時連原照片也遺失。
4. 移除舊照片時，先將其索引標為 `deleting`，讓各裝置立即停止顯示，再刪除 Drive 檔案與照片索引。
5. Drive 刪除失敗不回滾已保存的文字修改；保留 `deleting` 索引，待下次取得有效 token 時再重試。

### 刪除商品

1. 先取得該商品全部照片索引。
2. 有照片時先要求有效 Drive token，再刪除 Drive 檔案。
3. Drive 確認刪除後，再刪除照片索引與商品文件。
4. 每成功刪除一個 Drive 檔案便移除對應照片索引；若部分檔案失敗，商品與尚未刪除的索引暫時保留並顯示錯誤，使用者可重試，避免留下無法追蹤的隱藏檔案。

### 跨裝置讀取

- Firestore 的商品與照片索引維持即時同步。
- 新裝置第一次需要完成 Google 登入及 Drive 權限同意。
- 文字清單可在 Firebase 登入恢復後立即顯示。
- 若目前沒有 Drive token，照片位置顯示連結提示；使用者點擊並重新驗證後載入照片。
- Drive API 回傳 401 或 403 時清除舊 token，停止重複請求並要求重新連結。

## 舊資料相容

- 仍可顯示現有商品的 `photoUrl` Base64 單張照片。
- 新增照片只使用 Drive，不再把 Base64 寫入商品文件。
- 編輯含舊照片的商品時，舊照片可繼續保留；若使用者重新選擇照片，則上傳至 Drive 並移除舊 `photoUrl`。
- 不在背景大量搬移舊照片，避免未經使用者操作就觸發 Drive 授權或大量寫入。

## 錯誤處理

- 登入錯誤、Drive 未授權、token 過期、圖片解碼失敗、上傳失敗、Firestore 寫入失敗與地圖／網站格式錯誤使用不同訊息，不以單一「儲存失敗」掩蓋原因。
- 儲存按鈕顯示進度並防止連按。
- 網路中斷時保留未送出的表單與已壓縮照片於目前頁面記憶體；重新整理頁面後不保證保留未儲存照片。
- Drive 照片載入失敗時顯示預設圖片，不阻止使用者查看或編輯文字資料。
- Firestore 即時監聽切換帳號時清除上一位使用者的商品、照片索引與本機照片 URL。
- 若照片已上傳但 Firestore 寫入失敗，前端先立即嘗試刪除 Drive 檔案；仍失敗的 file ID 會記錄在依 UID 隔離的本機清理佇列，下一次同一使用者連結 Drive 時重試。佇列不含 access token 或照片內容。

## Google／Firebase 設定需求

使用者需要在 Firebase 對應的 Google Cloud 專案完成：

1. 啟用 Google Drive API。
2. 在 OAuth 同意畫面加入 `drive.appdata` scope。
3. 若 OAuth 應用仍是 Testing，將實際使用的 Google 帳號加入測試使用者；若要給其他人長期使用，依 Google 規定發布應用。
4. 保留 Firebase Authentication 的 Google 登入方式。
5. 保留 Vercel 網域 `shopping-list-tau-one.vercel.app` 為 Firebase Authorized domain；若日後使用自訂網域，也要加入該網域。

實作完成後，README 會加入逐步設定說明與重新授權方式。

## 程式結構

目前主要邏輯集中於 `index.html`。這次只做與新功能直接相關的拆分：

- `drive-photo-service.js`：Drive token、上傳、下載、刪除與失效處理。
- `image-compression.js`：影像方向、縮圖、壓縮與格式回退。
- `url-utils.js`：網站網址正規化、安全驗證與 Maps URL 建立。
- `index.html`：表單、預覽、商品卡片與 Firestore 協調流程。

這些模組以可單元測試的函式介面隔離，不進行與本功能無關的大型重構。

## 測試與驗收

### 自動測試

- 網站網址補齊與拒絕危險協定。
- 地址的 Google Maps URL 編碼。
- 圖片尺寸計算、格式回退與壓縮失敗處理。
- 照片排序、封面選擇及商品／照片索引合併。
- Drive 401／403 轉為重新授權狀態。
- 新增、編輯、刪除時的成功、部分失敗與補償清理流程。
- 登出或切換帳號時清除 Drive token 與照片 object URL。
- 保留現有 Google 登入 session 測試。

### 人工驗收

- 手機與電腦用同一 Google 帳號登入，可看到相同文字清單和照片。
- 地址按鈕開啟 Google 地圖並搜尋正確地址。
- 網站按鈕以新分頁開啟正確網址。
- 一次選取及分次追加多張照片，皆自動壓縮、顯示預覽並成功保存。
- 編輯商品可新增與刪除照片；第一張照片作為封面。
- token 過期後能透過按鈕重新連結 Drive。
- 刪除商品後，其 Drive 隱藏照片與 Firestore 索引一併刪除。
- 舊版 `photoUrl` 商品仍能顯示。

## 不在本次範圍

- 照片拖曳排序。
- 影片上傳或下載。
- 公開分享 Drive 照片。
- 背景服務或伺服器端定時清理。
- Google Maps 地址自動完成、座標或導航 API。
