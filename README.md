# Shopping-List

## 專案結構

此專案維持原本的靜態 HTML + Native ES Modules 架構，僅整理檔案與模組邊界，不遷移既有 Firestore / Google Drive 資料。

```text
Shopping-List/
├─ index.html                    # 網站入口
├─ auth-session.js               # 極薄的相容 bootstrap，轉接到 src/client
├─ src/client/
│  ├─ app/                       # 啟動流程、首頁 UI、商品增強功能
│  ├─ filters/                   # 分類 / 地點管理
│  ├─ photos/                    # Drive、照片壓縮、上傳、顯示恢復
│  └─ utils/                     # 共用 URL 工具
├─ firebase/
│  └─ firestore.rules            # Firestore Security Rules
├─ tests/
│  ├─ app/
│  ├─ filters/
│  ├─ photos/
│  ├─ utils/
│  └─ structure/                 # 架構、顯示與資料路徑 smoke tests
├─ docs/                         # 設計、實作計畫與工程規則
├─ .github/workflows/            # CI
└─ firebase.json                 # Firebase CLI 標準入口
```

`firebase.json` 保留在根目錄是刻意的，讓 Firebase CLI 維持標準使用方式；它會指向 `firebase/firestore.rules`。

目前沒有需要伺服器端執行的私密商業邏輯，因此沒有建立假的 `server/` / `api/` 目錄。未來若加入真正需要保護的 API Key 或伺服器邏輯，應放 Vercel Server Functions，秘密值放 Vercel Environment Variables，不能 commit 到 GitHub。即使 Repository 改為 Private，送到瀏覽器執行的前端 JavaScript 仍然可被使用者檢視。

## 資料相容性

這次重構 **不做 Firestore migration**。資料仍維持原本路徑：

```text
artifacts/japan-shopping-app/users/{uid}/...
```

現有商品、分類/地點設定、`itemPhotos` metadata、Google Drive `appDataFolder` 原圖都不搬移、不改 ID、不重建。

## Google Drive 照片功能設定

此專案使用 Firebase Authentication / Firestore 儲存帳號與購物清單文字資料，商品照片則存到登入者自己的 Google Drive `appDataFolder` 隱藏應用程式資料區。

部署前請完成以下 Google Cloud / Firebase 設定：

1. 開啟 Google Cloud Console，切換到專案 `shopping-list-a6c1e`。
2. 前往 **APIs & Services → Library**，啟用 **Google Drive API**。
3. 前往 **Google Auth Platform / OAuth consent**，確認應用程式允許要求 `https://www.googleapis.com/auth/drive.appdata` scope。
4. 若 OAuth publishing status 仍是 **Testing**，把實際要使用的 Google 帳號加入 **Test users**。
5. Firebase Authentication 必須保持 **Google** 登入提供者啟用。
6. Firebase Authentication → Settings → Authorized domains 必須包含實際部署網域，例如 `shopping-list-tau-one.vercel.app`；未來換自訂網域也要加入。
7. 若 Drive 同意畫面或 token 狀態異常，可在 Google 帳號撤銷該應用程式授權後，回網站重新按「連結 Google Drive」。

### 儲存方式與限制

- 網站欄位只保存網址，可使用 YouTube、Instagram、TikTok、部落格或其他介紹頁；不會下載或備份第三方影片。
- 未輸入 `http://` / `https://` 時會自動補 `https://`，且只接受 HTTP/HTTPS 網址。
- 商品網址與文字資料存於 Firestore，可跨裝置同步。
- 新照片會在瀏覽器端壓縮，最長邊 1600px，優先 WebP 品質 0.82，再上傳到 Google Drive `appDataFolder`。
- `appDataFolder` 中的檔案不會出現在一般 Google Drive 檔案列表，但仍會計入使用者 Drive 儲存空間。
- Drive access token 只保存在瀏覽器 `sessionStorage`，不寫入 Firestore 或永久 `localStorage`。
- 若 Drive token 不存在但 Firestore metadata 顯示照片仍存在，首頁會明確提示重新連結 Google Drive，不會把它當成「沒有照片」。
- 成功讀回 Drive 封面後會保存小型 Firestore 縮圖，降低重新開啟瀏覽器後封面暫時消失的機率。
- 若使用者刪除本應用程式的 Google Drive 隱藏資料，原圖將無法復原；Firestore 文字清單仍會保留。
- 舊版商品若已有 `photoUrl` Base64 照片，仍保留相容顯示；新照片改走 Google Drive。

## 測試

GitHub Actions 會在 `feature/**`、`fix/**`、`refactor/**` 分支執行：

- 全部 `*.test.mjs` unit / regression tests
- 所有 `src/client/**/*.js` 與 root bootstrap 語法檢查
- 網站 / Google Drive 整合標記檢查
- Firestore 原 schema 路徑 guard
- Repository 結構與 local import resolution 檢查
- 使用者可見 UI smoke tests
