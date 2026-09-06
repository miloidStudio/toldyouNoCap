# NoCap — 題庫生成與維護工具 (Deckbuilder)

這個套件提供《NoCap》的題目批量生成與題庫健檢功能。
透過呼叫 Google Gemini API（支援 Structured JSON 格式），嚴格遵循遊戲的出題與防洩底規則自動化產出高規格題目。

---

## 快速開始

### 1. 設定 Gemini API Key
前往 [Google AI Studio](https://aistudio.google.com/) 取得免費 API Key：

```bash
export GEMINI_API_KEY="你的_GEMINI_API_KEY"
```

> **離線測試**：如果你手邊暫時沒有 API Key，可加上 `--mock` 參數使用內建模擬題庫進行測試。

---

## 常用指令

### 1. 批量產題並寫入題庫 (`deck:build`)

```bash
# 透過 Gemini 生成 5 題（預設寫入 server/data/deck.json）
npm run deck:build -- -n 5

# 指定領域分類（例如：科學術語、動物冷知識、歷史文化、地理冷知識）
npm run deck:build -- -n 10 -c "科學術語"

# 指定主題或風格傾向
npm run deck:build -- -n 8 -t "台灣夜市文化與生活冷知識"

# 預覽生成結果，不寫入檔案 (--dry-run)
npm run deck:build -- -n 5 --dry-run

# 使用內建模擬題庫測試流程（不呼叫 API）
npm run deck:build -- -n 3 --mock --dry-run
```

#### 支援的參數選項：
| 參數 | 縮寫 | 說明 | 預設值 |
| --- | --- | --- | --- |
| `--count` | `-n` | 要生成的題目數量 | `5` |
| `--category` | `-c` | 限定題目領域分類（如「地理冷知識」） | 均勻分佈 |
| `--topic` | `-t` | 自訂題目主題風格傾向 | 百科冷知識 |
| `--model` | `-m` | 指定 Gemini 模型 | `gemini-3.6-flash` |
| `--mock` | — | 使用內建模擬資料（不需 API Key） | `false` |
| `--dry-run` | — | 僅在終端機印出驗證結果，不寫入檔案 | `false` |
| `--output` | `-o` | 自訂寫入題庫的路徑 | `server/data/deck.json` |

---

### 2. 題庫健康度健檢 (`deck:audit`)

全面檢查 `server/data/deck.json` 中的所有題目：
* 檢查是否有重複的題目 ID 或詞彙
* **檢查 `hintKeyword` 是否有字元與 `term` 重疊（防止直接洩底）**
* 檢查定義字數是否合適（建議 60~130 字，避免老實人 20 秒讀不完）
* 統計各領域分類題數分佈（確保誘餌關鍵字挑選池均衡）

```bash
npm run deck:audit
```

---

### 3. 執行單元測試與型別檢查

```bash
# 執行題庫工具的單元測試
npm test --workspace deckbuilder

# 全專案型別檢查
npm run typecheck
```
