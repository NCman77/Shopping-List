# Shopping-List

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
- 若使用者刪除本應用程式的 Google Drive 隱藏資料，照片將無法復原；Firestore 文字清單仍會保留。
- 舊版商品若已有 `photoUrl` Base64 照片，仍保留相容顯示；新照片改走 Google Drive。
