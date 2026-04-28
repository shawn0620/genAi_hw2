# HW02 - My Very Powerful Chatbot (v2.2)

本專案由 `HW01` 升級為 `v2`，實作了 HW02 需求：

- Long-term memory（長期記憶）
- Multimodal（文字 + 多張圖片 URL / data URL）
- Auto routing between models（自動路由）
- Native tool use / Formal MCP（模型原生工具呼叫與正式 JSON-RPC MCP 端點）

## 專案結構

```text
genAi_hw2_v2/
├─ backend/
│  ├─ src/server.js
│  ├─ data/                       # 會自動產生 long_term_memory.json
│  ├─ .env.example
│  └─ package.json
├─ frontend/
│  ├─ index.html
│  ├─ app.js
│  └─ styles.css
├─ docs/
│  ├─ system-introduction.md
│  ├─ architecture-diagram.md
│  └─ demo-script.md
└─ README.md
```

## 快速啟動

1. 安裝套件

```bash
cd backend
npm install
```

2. 建立環境變數

```bash
cp .env.example .env
```

3. 編輯 `backend/.env`

```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key
GROQ_BASE_URL=https://api.groq.com/openai/v1

DEFAULT_MODEL=llama-3.1-8b-instant
MODEL_OPTIONS=llama-3.1-8b-instant,llama-3.3-70b-versatile,openai/gpt-oss-20b

ROUTER_FAST_MODEL=llama-3.1-8b-instant
ROUTER_REASONING_MODEL=llama-3.3-70b-versatile
ROUTER_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

LONG_MEMORY_MAX_FACTS=120
PORT=3000
```

4. 啟動

```bash
npm run dev
```

5. 開啟

- `http://localhost:3000`

## v2 功能說明

### 1) 長期記憶（Long-term Memory）

- 以 `sessionId` 為單位持久化儲存（`backend/data/long_term_memory.json`）
- 會從使用者訊息擷取可記憶 facts（例如「我叫...」「我喜歡...」「請記住...」）
- 回答前會檢索相關記憶並注入 system context
- 前端可查看/清除長期記憶
- 前端提供長期記憶管理視窗，可勾選指定項目後做部分刪除

### 2) 多模態（Multimodal）

- 前端支援一次貼多張圖片 URL（每行一張）或 `data:image/...` base64
- 送出時可同時帶文字與圖片
- 後端會把 user content 組為 text + image_url 形式
- 短期記憶會保留本輪圖片訊息，讓多輪圖文對話比較完整

### 3) 自動路由（Auto Routing）

- 可切換 `AUTO / MANUAL`
- 規則：
  - 有圖片 -> 優先 vision model
  - 問題較複雜 -> reasoning model
  - 其他 -> fast model
- `ROUTER_*` 模型可以是 route-only，不必出現在前端下拉選單
- SSE 會回傳 `route` 事件，前端顯示實際 routed model
- 前端會額外顯示 `Selected model`，明確告知這輪實際使用的模型

### 4) Tool / MCP

- 內建工具：
  - `get_time`
  - `calculate`
  - `memory_recall`
- 先走模型原生 tool calling；若模型不支援或未呼叫工具，再退回 heuristic fallback
- 前端可查看工具列表與目前 tool mode
- 後端保留 legacy helper 端點：
  - `GET /api/mcp/tools`
  - `POST /api/mcp/call`
- 後端另外提供正式 JSON-RPC MCP 端點：
  - `GET /mcp`
  - `POST /mcp`
  - 支援 `initialize`、`notifications/initialized`、`ping`
  - 支援 `tools/list`、`tools/call`
  - 支援 `resources/list`、`resources/read`

### 5) 既有 HW01 功能保留

- 模型切換
- system prompt
- 參數滑桿（temperature / top_p / max_tokens / penalties）
- Streaming SSE
- 短期記憶（RAM Map）
- 本機歷史對話（localStorage）

## 後端 API

- `GET /api/health`
- `GET /api/models`
- `GET /api/tools`
- `GET /api/mcp/tools`
- `POST /api/mcp/call`
- `GET /mcp`
- `POST /mcp`
- `GET /api/memory/long-term?sessionId=...`
- `POST /api/memory/long-term/clear`
- `POST /api/memory/long-term/delete`
- `POST /api/memory/clear`
- `POST /api/chat` (SSE: `route`, `memory`, `tool_mode`, `tool`, `delta`, `memory_update`, `done`, `error`)

## E3P 交付材料

- 一頁系統介紹：`docs/system-introduction.md`
- 系統架構圖：`docs/architecture-diagram.md`
- Demo 講稿建議：`docs/demo-script.md`

## 安全提醒

- `.env` 已被 `.gitignore` 忽略，請勿提交真實 key
- 若 key 有外流風險，請立即到供應商後台 rotate/revoke
