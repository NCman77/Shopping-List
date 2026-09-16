# CI、分頁與長期維護修復計畫

## 目標

- 讓 CI 在主要合併路徑與目前 Codex 分支上可靠執行。
- 讓商品分頁只把目前頁面的卡片留在 DOM，保留現有 Firestore 訂閱、篩選與排序語意。
- 修復壓縮失敗照片無法移除、舊 FX 回應覆蓋新商品、詳情頁 Drive 載入按鈕被隱藏三個使用者問題。
- 降低 Service Worker cache 邊界與舊資料遷移的長期維護風險，不處理無障礙議題。

## 實作順序

1. 先補 CI、分頁、照片、FX、詳情按鈕、Service Worker 與批次遷移的失敗測試。
2. 逐項實作並執行對應的 focused tests。
3. 執行完整測試、所有 client JavaScript 語法檢查與 `git diff --check`。
4. 將分支合併到 `main`，確認合併後工作樹乾淨。
5. 檢查 Vercel CLI/專案連結並部署；若需要登入或 project link，保留程式碼合併結果並回報部署阻塞。

## 不在本次範圍

- 不改變地圖搜尋國家參數的既定產品決策。
- 不導入 Firestore cursor pagination，避免改變篩選、排序與讀取成本。
- 不處理無障礙技術債。
