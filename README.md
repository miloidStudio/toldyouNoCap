# NoCap — 話術推理派對遊戲（網頁版）

面對面聚會用的話術／推理派對遊戲。每位玩家用自己的手機連進同一個房間，
網頁只負責**發牌、身分同步、計時、投票、計分**——說話、質詢、互相唬爛全部口頭進行。

- 不做語音／視訊／文字聊天
- 「猜題者閉眼」在網頁版由「猜題者的裝置本身不顯示答案」取代
- 身分卡預設遮住，必須**按住才看得到**，放開立刻蓋回去
- 題目**不分類**，抽到什麼算什麼——分類本身就是提示，會破壞「完全不知道這是什麼」的樂趣

---

## 快速開始

需求：Node.js 20 以上。

```bash
npm install          # 安裝三個 workspace 的依賴
npm run dev          # 同時啟動後端 (:3001) 與前端 (:5173)
```

打開 <http://localhost:5173> 就能玩。

### 讓同一個區網的手機連進來（實際聚會的用法）

**你不需要自己查 IP。** 後端啟動時會把區網位址印出來，
房主 lobby 畫面上的分享連結與 QR code 也會自動用區網 IP 而不是 localhost：

```
[server] NoCap 後端已啟動：http://localhost:3001
[server] 同一個區網的裝置可用以下位址連進來：
         http://192.168.1.23:3001   (en0)
```

房主直接在自己電腦上開房，把 QR code 給大家掃就好。
如果你的電腦有多張網卡（VPN、Docker、虛擬機），lobby 會多出一個下拉選單讓你換一張。

### 正式模式（單一連接埠，最省事）

```bash
npm run build        # 建置前端到 client/dist
npm start            # 後端一併服務前端，只開 :3001
```

---

## 多人流程測試步驟

1. `npm run dev`
2. 瀏覽器開第一個分頁 → 輸入暱稱 → **建立房間**
3. 再開兩個**無痕視窗**（重點：不同的 localStorage 才算不同玩家）→ 輸入房號加入
4. 房主設定輪數與思考秒數後按「開始遊戲」
5. 三個視窗各自拿到不同身分。按住身分卡才看得到內容；猜題者的卡片上不會有定義
6. **猜題者**按下「開始觀察」→ 開始倒數思考時間
7. 倒數結束直接進入自由討論。猜題者的畫面上同時就有投票名單
8. 猜題者覺得聽夠了，直接點一位玩家並確定指認 → 公布身分與加分 → 進入下一輪

**斷線重連測試**：任一分頁在遊戲中直接重新整理，會自動接回原本的座位與分數
（localStorage 存房號 + 玩家 id，等待期 60 秒）。

---

## 遊戲流程

`LOBBY → ROLE_ASSIGN → THINKING → DISCUSSION → RESULT → …→ GAME_OVER`

| 階段 | 誰推進 | 有沒有計時 | 說明 |
| --- | --- | --- | --- |
| ROLE_ASSIGN | **猜題者**按「開始觀察」 | 無 | 各自按住看身分卡。猜題者確認大家都看完了再開始 |
| THINKING | 倒數自動／猜題者提前 | **有**，預設 20 秒（10–30） | 想好自己要怎麼講 |
| DISCUSSION | 只由猜題者投票結束 | 無 | 自由發言與質詢，主持權完全在猜題者身上。他的畫面同時就是投票名單 |
| RESULT | 猜題者或房主 | 無 | 公布身分、正解與加分 |

一輪只有一個計時器。誰先講、講多久都由猜題者當場決定，網頁不介入。

房主保有備援權限（猜題者斷線時可代為推進、可強制結束該輪或整場），
但正常遊玩時完全不需要房主操作。

### 為什麼老實人的定義會在討論階段消失

進入 DISCUSSION 的瞬間，伺服器就不再把定義送給老實人。
不然一定會有人對著螢幕逐字唸，語氣和用詞跟其他人差太多，一聽就穿幫。
到 RESULT 階段才對所有人公開正解。

### 提示關鍵字

題目字卡下方有三個關鍵字，**只有一個真的和題目相關**，另外兩個是從別的領域抓來的誘餌。
這樣瞎掰人不會完全一頭霧水地亂講（至少有個方向可以編），但也不會被直接告知答案的領域。
誘餌一律從不同分類的題目挑，避免不小心也扯得上關係。

### 角色分配

- **猜題者**：房主直接輸入這場要打幾輪，系統一圈一圈洗牌後接起來截斷。
  結果是每人擔任次數最多相差 1 次，且不會連續兩輪都是同一個人
- **老實人**：每輪從非猜題者中加權隨機挑選，權重 = `1 / (1 + 已當過老實人次數)`
- **瞎掰人**：該輪其餘所有人
- **題目**：從整副題庫隨機抽一筆未使用過的，**不做分類篩選**，同一場不重複

### 計分（`shared/types.ts` 的 `SCORE` 常數，可直接調整平衡）

| 結果 | 猜題者 | 老實人 | 被指到的瞎掰人 | 其他瞎掰人 |
| --- | --- | --- | --- | --- |
| 猜對（指到老實人） | **+2** | **+1** | — | 0 |
| 猜錯（指到瞎掰人） | 0 | 0 | **+2** | 0 |

贏家全拿、沒有部分得分。全部輪次結束後累計最高分獲勝，
平手則**並列顯示**贏家（v1 不做延長賽）。

### 人數與輪數

最少 3 人（1 猜題者 + 1 老實人 + 1 瞎掰人），上限 12 人，理想 4–10 人。
輪數由房主手動輸入，範圍 1–30 且不能超過題庫題數（示範題庫是 30 題）。

---

## 專案結構

```
nocap/
├── shared/types.ts        前後端共用的型別、Socket 事件、平衡性常數
├── server/                Node + TypeScript + Socket.io
│   ├── src/engine.ts      純函式遊戲邏輯（輪替、老實人挑選、提示、計分、排名、出題）
│   ├── src/game.ts        房間狀態機、計時器、權限、廣播
│   ├── src/store.ts       房間儲存層（in-memory，介面可換 Redis）
│   ├── src/network.ts     區網 IP 偵測（分享連結／QR code 用）
│   ├── src/deck.ts        題庫載入與驗證
│   ├── src/index.ts       Express + Socket.io 進入點
│   ├── data/deck.json     題庫（遊戲實際讀取的檔案）
│   └── tests/             39 個單元測試
├── client/                React 19 + TypeScript + Vite + Tailwind CSS 4
│   └── src/
│       ├── net/env.ts     執行環境抽象層（見下方「未來包成 App」）
│       ├── net/socket.ts  Socket.io 封裝
│       ├── useGame.ts     把 socket 事件轉成 React 狀態
│       ├── screens/       首頁／Lobby／遊戲中／最終排名
│       └── components/    身分卡、題目字卡、倒數計時器、計分板、QR code
└── deckbuilder/           題庫擴充工具：爬維基 DYK → LLM 整理 → 驗證 → 併進題庫
    └── tests/             64 個單元測試（與遊戲主程式完全分離）
```

### 技術選擇說明

| 項目 | 選擇 | 理由 |
| --- | --- | --- |
| 前端框架 | **Vite + React + TS**（而非 Next.js） | 這是純即時互動的 SPA，沒有 SEO 或伺服器渲染需求；Next.js 的 SSR／路由對此沒有幫助，反而讓之後用 Capacitor／Electron 包裝變麻煩。Vite 產出的是一包純靜態檔，兩種包裝方式都能直接吃 |
| 即時通訊 | **Socket.io** | 內建 room 機制與自動重連退避 |
| 遊戲狀態 | **in-memory** | 每局生命週期短。存取集中在 `RoomStore` 介面（全部非同步、以整包 Room JSON 為單位），要換 Redis 只需新增一個 `RedisRoomStore` 實作 |
| 題庫 | **純 JSON** | 不需要資料庫，手動擴充題目直接編輯 `server/data/deck.json` |
| 樣式 | **Tailwind CSS 4** | mobile-first、單手操作的按鈕尺寸容易統一 |

### 顏色規則

整個介面只用兩個強調色：**琥珀色**是系統本身（題目、倒數、分數），
**天藍色**代表**猜題者**。老實人與瞎掰人在視覺上完全一樣——
既然是按住才看得到內容，卡片外觀就不該洩漏任何身分線索。

### 未來包成手機／桌面 App

所有「跟執行環境有關」的判斷都集中在 `client/src/net/env.ts`：

- `getServerUrl()` — Socket.io 要連的位址
- `getShareOrigin()` / `buildJoinUrl()` — 分享連結網域（含 localhost → 區網 IP 的處理）
- `parseJoinCodeFromLocation()` — 深連結解析（App 版換成 Capacitor 的 App URL Open 事件）
- `loadSession()` / `saveSession()` — 本機儲存（App 版換成 Preferences API）

畫面元件與遊戲邏輯不直接碰 `location`、`localStorage`、`window`。
`index.html` 已附 `manifest.webmanifest`，補上 icon 就是可安裝的 PWA。

---

## 題庫

`server/data/deck.json` 是遊戲實際讀取的檔案。只有 `verified: true` 的項目會進入遊戲。

```jsonc
{
  "id": "q-0001",                      // 中性流水號，不帶分類前綴
  "term": "指猴",                       // 顯示給所有人看
  "definition": "馬達加斯加特有的…",     // 只給老實人，且只在看牌與思考階段
  "category": "動物冷知識",             // 不是遊戲內的篩選條件，只用於挑選跨領域的誘餌關鍵字
  "hintKeyword": "覓食",                // 與本題相關、但不會直接洩底的提示關鍵字（必填）
  "difficulty": 2,                     // 1–3，1 最簡單
  "sourceUrl": "https://zh.wikipedia.org/wiki/指猴",
  "pageviews": 31,                     // 日均瀏覽量，越低越冷門
  "dykHook": null,                     // 維基「新條目推薦」的原始 hook 句
  "verified": true                     // 是否已複核
}
```

`hintKeyword` 是必填的——伺服器啟動時會檢查，缺了會直接報錯並列出是哪幾題；
若提示與題目有共用字（會洩底），啟動時會警告。
`category` 雖然不出現在遊戲 UI，但請照樣填好：誘餌關鍵字靠它來確保「真的來自別的領域」。

附的示範題庫有 **30 筆**，分屬 5 個領域：動物冷知識、地理冷知識、科學術語、歷史、語言文化。

> 示範題庫的定義是人工撰寫、`sourceUrl` 指向對應的中文維基條目，
> 但其中的 `pageviews` 是為了示範欄位格式而填的代表值，並非實測數字。
> 用 `deckbuilder` 跑出來的題目才會帶回真實的瀏覽量。

### 擴充題庫

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run deck:build -- --from 2024-01 --to 2024-06 --limit 40
```

會去爬中文維基的「新條目推薦」存檔，過濾掉太熱門與不適合口述的條目，
交給 LLM 改寫成題目並產生提示關鍵字，通過驗證後自動配 id 併進 `deck.json`。
沒有金鑰時可以加 `--provider mock --dry-run` 先確認管線通不通。

也可以完全手動加題：`npm run deck:review -- --new`。

詳見 [`deckbuilder/README.md`](deckbuilder/README.md)。

---

## 指令一覽

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 同時啟動後端與前端（開發用） |
| `npm run build` | 建置前端到 `client/dist` |
| `npm start` | 只啟動後端；若 `client/dist` 存在會一併服務前端 |
| `npm test` | 執行單元測試（遊戲 39 個 + 題庫工具 64 個） |
| `npm run typecheck` | 全部 workspace 型別檢查 |
| `npm run deck:build -- --limit 40` | 擴充題庫（爬 DYK → LLM 整理 → 併入） |
| `npm run deck:review` | 人工處理被退回的候選；`-- --new` 手動加題 |
| `npm run deck:audit` | 題庫健檢（重複、缺欄位、提示洩底） |

### 環境變數

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `PORT` | `3001` | 後端連接埠 |
| `CLIENT_ORIGIN` | `*` | CORS 允許來源 |
| `DECK_PATH` | `server/data/deck.json` | 題庫路徑 |
| `VITE_SERVER_URL` | 同源 | 前端要連的後端位址（App 包裝時必填） |
| `VITE_PUBLIC_ORIGIN` | 自動偵測 | 正式部署有網域時指定它，會蓋過區網 IP 的自動處理 |
| `ANTHROPIC_API_KEY` | — | 擴充題庫時用（`deckbuilder`） |
| `GEMINI_API_KEY` | — | 改用 `--provider gemini` 時 |
| `OPENAI_API_KEY` | — | 改用 OpenAI 相容端點時 |
| `WIKI_CONTACT` | 範例值 | 大量爬維基時請填自己的聯絡方式（維基的 User-Agent 規範） |

### API

| 端點 | 說明 |
| --- | --- |
| `GET /api/health` | 健康檢查與題庫題數 |
| `GET /api/network` | 後端偵測到的區網 IPv4 清單與連接埠（前端用來組分享連結） |

---

## 非目標（v1 不做）

語音／視訊／文字聊天、帳號系統與跨裝置歷史紀錄、大螢幕投影分離顯示、
App 的實際打包、全自動 NLP 冷知識短語抽取、平手延長賽。

### 未來可加的功能

- **平手延長賽**：目前平手並列顯示贏家。要加的話可在 `GAME_OVER` 前插入一個
  sudden-death 輪次，只讓並列第一的玩家輪流當猜題者直到分出高下
- **大螢幕模式**：`PublicRoomState` 已經是「不含機密的公開狀態」，可直接拿來渲染唯讀投影畫面
- **Redis 儲存**：實作 `RoomStore` 介面即可
- **題目難度自適應**：`difficulty` 欄位已經備好，尚未用於出題邏輯
- **提示強度可調**：目前固定 1 個相關 + 2 個誘餌，常數在 `LIMITS.HINT_COUNT`
