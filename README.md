# 家帳本 HomeBook（暫定名稱）

和另一半一起用的「生活記事＋提醒」App。目前先做成網頁 App（PWA），iPhone 用 Safari 開啟後「加入主畫面」，用起來就像一般 App。

## 功能

| 類型 | 記什麼 | 自動幫你做 |
|---|---|---|
| 💎 貴重物品 | 購買日期、價格、通路、保固、照片 | 算出「已經用了幾年幾個月」、平均每天花費；快到預計換新日或保固到期時提醒。按「換新了」會把舊的標記淘汰，並帶入資料新增一筆 |
| 🧻 消耗品 | 每次「買了」「開始用」「用完了」 | 算出平均多久用完、預計用完日期；沒庫存又快用完時提醒補貨 |
| 🔁 定期更換 | 牙刷、濾芯、濾網…的週期 | 到期提醒；按「換好了」就重新開始計時，並保留歷次更換紀錄 |
| 🧧 紅包 | 年份、誰給的、給哪個小孩、金額 | 依年份統計每個小孩收到多少；「依親友」可以看同一位親友歷年包多少，方便回禮。可以連續輸入很多筆 |

- **搜尋**：名稱、分類、標籤、備註、通路、親友、小孩、年份（例如「2026」「馬年」）、金額都搜得到；用空白分開多個關鍵字，就會找出同時符合的紀錄（例如「紅包 大舅」）
- **今天頁**：已到期和快到期的項目排在最前面，可以直接按「換好了」「用完了」
- **家庭共享**：一人建立家庭，另一人輸入代碼加入，兩支手機即時同步；沒網路時也能用，連線後自動上傳
- **提醒通知**：可以匯出到 iPhone「行事曆」（前一天早上 9 點和 7 天前提醒）
- **安全**：刪除的東西先放到垃圾桶，可以復原；可以匯出／匯入 JSON 備份

## 在電腦上試用

```powershell
python -m http.server 5173 --directory D:\APP\HomeBook
```
然後打開 http://localhost:5173 。（還沒設定 Firebase 時是「本機模式」，資料只存在這個瀏覽器）

## 設定家庭共享（Firebase，免費，一次就好）

1. 到 https://console.firebase.google.com 用 Google 帳號登入 →「新增專案」（名稱例如 homebook，Google Analytics 可以關掉）
2. 左側「建構 → Authentication」→ 開始使用 →「登入方式」分頁 → 啟用 **匿名**
3. 左側「建構 → Firestore Database」→ 建立資料庫 → 位置選 `asia-east1`（台灣）→ 以「正式版模式」開始
4. Firestore 的「規則」分頁，把 [firestore.rules](firestore.rules) 的內容整個貼上 →「發布」
5. 專案設定（齒輪）→「一般」→ 下方「你的應用程式」→ 點 `</>`（網頁）→ 註冊應用程式 → 複製 `firebaseConfig` 裡的值，貼到 [js/firebase-config.js](js/firebase-config.js)
6. 發布網站後（見下方），把網址加到 Authentication →「設定」→「授權網域」

> 免費額度（每天 5 萬次讀取、2 萬次寫入）兩個人用綽綽有餘。

## 發布到網路（讓手機能開）

任選一種：
- **Netlify Drop（最簡單）**：到 https://app.netlify.com/drop ，把整個 `HomeBook` 資料夾拖進去，就會得到一個 https 網址
- **GitHub Pages**：建一個 repository，上傳 `HomeBook` 裡的檔案，在 Settings → Pages 開啟
- **Firebase Hosting**：需要安裝 Node.js 和 firebase-tools

拿到網址後：兩支 iPhone 都用 **Safari** 打開 → 分享 →「加入主畫面」→ 打開 App → 設定 → 一人「建立家庭」，把代碼傳給另一人「輸入代碼加入」。

## 更新版本

修改程式後，把 `sw.js` 裡的 `CACHE = 'homebook-v1'` 改成 v2、v3…再重新發布，手機才會換成新版（關掉 App 重開兩次）。

## 檔案結構

```
index.html            主頁面
css/app.css           樣式（支援深色模式）
js/app.js             畫面與操作
js/logic.js           日期計算、提醒判斷、搜尋
js/store.js           本機（IndexedDB）／雲端（Firestore）儲存
js/templates.js       常用範本（手機 5 年、牙刷 3 個月…）
js/ics.js             匯出行事曆提醒
js/firebase-config.js Firebase 設定（自己填）
firestore.rules       Firestore 安全規則
sw.js                 離線快取
```

## 之後可以加的功能

- 推播通知（Web Push，iOS 16.4 以上、加到主畫面後支援；需要 Firebase Blaze 方案的 Cloud Functions 或其他排程服務）
- 掃描發票／收據自動帶入價格
- 改成原生 iOS App（SwiftUI + iCloud 共享，需要 Mac）
