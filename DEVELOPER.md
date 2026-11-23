# 家帳本 HomeBook — 開發交接文件

給接手開發的人看的。使用說明請看 [README.md](README.md)。

- 線上版：https://chengshunyi.github.io/homebook/
- 原始碼：https://github.com/CHENGSHUNYI/homebook
- 目前版本：v0.1.4

---

## 1. 這是什麼

一對夫妻共用的「生活記事＋提醒」App，四種紀錄：

| type | 中文 | 核心邏輯 |
|---|---|---|
| `asset` | 貴重物品 | 購買日 + 預計使用年限 → 換新提醒；保固到期提醒；已用多久、每天成本 |
| `consumable` | 消耗品 | 「買了／開始用／用完」事件紀錄 → 算平均用完天數、預測用完日、庫存 |
| `replace` | 定期更換 | 上次更換日 + 週期 → 到期提醒；保留更換歷史 |
| `redpacket` | 紅包 | 年份 × 小孩 × 親友 × 金額；收到／包出；跨年度對照 |

需求重點（來自使用者）：**多人同步編輯、免費、紀錄和提醒放在一起、分類與關鍵字搜尋、輸入要快**。

## 2. 技術選擇與原因

- **純 HTML／CSS／JavaScript（ES Modules），沒有 build、沒有 npm 套件**
  使用者是 Windows 電腦、沒有 Mac，所以先做成 PWA。不需要建置工具，任何靜態網站主機都能放。
- **Firebase（Firestore + 匿名登入）** 負責家庭同步，從 gstatic CDN 動態載入 SDK v10.14.1
- **IndexedDB** 是本機模式的儲存
- **GitHub Pages** 部署：推上 `main` 分支約 1 分鐘後生效

## 3. 本機開發

```powershell
python -m http.server 5173
```
在專案根目錄執行，然後打開 http://localhost:5173 。

- 在 `localhost`／`127.0.0.1` 上 **不會註冊 Service Worker**，改了程式重新整理就能看到
- 用瀏覽器開發者工具切到 iPhone 尺寸來測試畫面
- 想要乾淨的本機資料：DevTools → Application → IndexedDB → 刪除 `homebook`，以及 Local Storage 的 `homebook.settings`

## 4. 檔案結構

```
index.html            外框：主畫面容器、底部分頁、＋按鈕；head 裡有一小段腳本先套用外觀設定（避免閃色）
css/app.css           全部樣式；主題用 CSS 變數（見第 8 節）
js/app.js             畫面渲染、事件處理、表單、詳細頁、設定頁（最大的檔案）
js/logic.js           純函式：日期計算、提醒判斷、消耗品統計、搜尋比對（沒有 DOM，可單獨測試）
js/store.js           資料層：LocalStore（IndexedDB）與 CloudStore（Firestore），介面相同
js/templates.js       新增時的常用範本、預設分類
js/sample.js          範例資料（日期以今天往回推）
js/ics.js             匯出 .ics 行事曆提醒
js/firebase-config.js Firebase 網頁設定
firestore.rules       Firestore 安全規則（要手動貼到 Firebase 主控台）
sw.js                 Service Worker 離線快取
manifest.webmanifest  PWA 設定
icons/                App 圖示（180／192／512）
```

## 5. 資料模型

所有紀錄都是同一個集合裡的物件，用 `type` 區分。日期一律存成 `'YYYY-MM-DD'` 字串（本地時區，不要用 `toISOString()`，會差一天）。

### 共用欄位
```js
{
  id: 'lq3x9k2abc12',      // genId()
  type: 'asset' | 'consumable' | 'replace' | 'redpacket',
  name: '手機',             // 紅包的 name = 親友名字
  category: '3C',
  tags: ['老公', '主臥'],
  note: '型號、序號…',
  photos: ['data:image/jpeg;base64,...'],  // 最多 3 張，壓到 1000px、JPEG 0.6
  remindDays: 30,           // 提前幾天提醒，空白用預設值
  createdAt, updatedAt,     // Date.now()
  createdBy, updatedBy,     // 設定裡的「我是誰」
  deleted: true, deletedAt, // 軟刪除 → 垃圾桶
  sample: true,             // 範例資料
}
```

### 各類型專屬欄位
```js
// asset
{ purchaseDate, price, store, lifeValue: 5, lifeUnit: 'year'|'month', warrantyUntil, retired, retiredDate }

// consumable
{ unit: '箱', stock: 1, price, estValue: 6, estUnit: 'month',
  logs: [{ id, kind: 'buy'|'start'|'finish', date, qty?, price? }] }
// 平均用完天數 = 最近 3 次「start → finish」的平均；沒有完整週期時用 estValue/estUnit 預估

// replace
{ intervalValue: 3, intervalUnit: 'day'|'week'|'month'|'year', lastDate, history: ['2026-05-01', ...] }

// redpacket
{ year: 2026, direction: 'in'|'out', child: '小寶', amount: 2000, relation: '媽媽那邊' }
```

### Firestore 結構
```
households/{familyCode}            { name, createdAt, createdBy }
households/{familyCode}/members/{uid}  { name, joinedAt }
households/{familyCode}/records/{id}   ← 上面的紀錄物件
```
- 家庭代碼格式 `XXXX-XXXX-XXXX`（去掉易混淆字元，約 60 bits），**代碼本身就是鑰匙**
- 規則禁止 list `households`，所以無法列舉別人的家庭
- 照片以 base64 存在紀錄文件裡（Firestore 單一文件上限 1 MiB，所以限制 3 張並壓縮）
- 衝突處理：整筆紀錄 last-write-wins

## 6. 程式架構

### 渲染
- 沒有框架，用 template literal 產生 HTML 字串後塞進 `innerHTML`；**使用者輸入一定要經過 `esc()`**
- `VIEWS` 物件：每個分頁有 `shell()`，有搜尋框的分頁另有 `body()`。打字時只重畫 `#body`，搜尋框才不會失去焦點
- 資料變動 → `store.onChange` → `scheduleRender()`（setTimeout 去抖動）→ `render()`；若詳細頁開著也會刷新
- 底部彈出視窗（sheet）：`openSheet(html, state)`／`closeSheet()`；`state.modal = true` 時點背景不會關閉（表單用）

### 事件
- 全部用事件委派：元素加 `data-act="動作名"`，對應 `actions` 物件裡的函式
- 表單 submit、input、change 也在 `bindChrome()` 集中處理

### 提醒
- `logic.js` 的 `alertsOf(rec)` 回傳該紀錄所有提醒 `{ kind, date, daysLeft, level: 'overdue'|'soon'|'ok', title, text }`
- 「今天」頁把所有提醒依 level 分組，再依 daysLeft 排序
- App 圖示徽章：`navigator.setAppBadge(已到期 + 快到了)`
- 系統通知目前靠匯出 `.ics` 到 iPhone 行事曆（`ics.js`）

### 搜尋
- `haystack(rec)` 把名稱、分類、標籤、備註、通路、親友、小孩、年份、生肖、金額等串成一個字串，NFKC 正規化 + 小寫
- 查詢字串用空白切開，**全部都要符合（AND）**

## 7. 部署與更新

```powershell
git add -A
git commit -m "說明"
git push
```
推上 `main` 約 1 分鐘後 GitHub Pages 生效。

**每次發布前務必：**
1. `sw.js` 的 `CACHE = 'homebook-vN'` 加 1，讓手機丟掉舊快取
2. `js/app.js` 的 `VERSION` 改版本號（設定頁最下面會顯示，方便確認手機已更新）
3. 新增 JS／CSS 檔時，記得加進 `sw.js` 的 `SHELL` 清單

Service Worker 策略：自己的檔案「網路優先、4 秒逾時才用快取」；Firebase SDK「快取優先」（網址含版本號）。

## 8. 外觀主題

- `<html data-theme="light|dark">`：沒有這個屬性就跟隨系統（`prefers-color-scheme`）
- `<html data-accent="warm|rose|forest|ocean|lavender|ink">`：主題色
- 每個主題色定義 `--a-l`（淺色模式主色）、`--a-d`（深色模式主色）、`--bg-l`（淺色背景）、`--on-a-d`（深色模式按鈕文字色）
- 新增主題色：在 `css/app.css` 頂部加一行，再加進 `js/app.js` 的 `ACCENTS` 陣列
- `--accent-soft`、`--chip`、`--line` 用 `color-mix()` 自動算出（需要 iOS 16.2 以上）

## 9. Firebase

- 專案 ID：`homebook-4c9a0`，擁有者是原作者的 Google 帳號
- 已啟用：Authentication（匿名）、Firestore（asia-east1、正式版模式）
- `firebase-config.js` 的值本來就會公開給瀏覽器，不是密碼；資料安全靠 `firestore.rules`
- **建議接手的人另外開一個自己的 Firebase 專案做開發測試**，把 `firebase-config.js` 換成自己的設定，就不會影響原作者家裡的正式資料
- 修改 `firestore.rules` 後，要到 Firebase 主控台 → Firestore → 規則貼上並發布，推上 GitHub 不會自動套用

## 10. 已知限制與注意事項

- **iOS PWA 推播**：目前沒有。要做的話需要 Web Push（iOS 16.4 以上、加到主畫面）+ 能定時發送的後端（例如 Cloud Functions，需 Firebase Blaze 方案）
- **「跟隨系統」深淺色**：瀏覽器測試正常，但使用者回報在 iPhone 上沒作用，**尚未確認原因**。v0.1.3 已加上 `<meta name="color-scheme">`、回到前景時重新偵測，以及設定頁顯示偵測結果，等使用者回報
- **消耗品紀錄同時編輯**：整筆覆蓋，兩人同時操作同一筆時，後寫入的會蓋掉前一個人的 log
- **離開家庭**：回到本機模式後，看到的是加入家庭前的本機資料（不會自動下載雲端資料到本機）
- **Windows 開發注意**：用 PowerShell 5.1 的 `Get-Content`／`Set-Content` 改檔案會弄壞中文編碼（預設不是 UTF-8），請用編輯器或 `git`／`sed` 處理
- 沒有自動化測試；`logic.js` 是純函式，最適合先補單元測試

## 11. 可以接著做的功能

依使用者需求排序：
1. 推播通知（見上方說明）
2. 包成 iOS App：Capacitor 包裝現有程式碼最省工；需要 Apple 開發者帳號（每年約 NT$3,300），沒有 Mac 可用 GitHub Actions 的 macOS runner 編譯
3. 主畫面小工具（需要原生 App）
4. 掃描發票／收據帶入價格
5. 匯出 Excel／CSV
6. 紅包「依親友」頁加上「回禮建議」（例如對方去年包多少）

## 12. 版本紀錄

| 版本 | 內容 |
|---|---|
| 0.1.0 | 第一版：四種紀錄、搜尋、今天頁、紅包簿、行事曆匯出、備份 |
| 0.1.1 | Service Worker 改成網路優先，修正手機卡在舊版 |
| 0.1.2 | 外觀設定：深淺色、6 種主題色 |
| 0.1.3 | 強化「跟隨系統」深淺色偵測 |
| 0.1.4 | 範例資料一鍵載入／清除 |
