# 系統介紹（一頁）

## 專案目標

本系統由 HW01 升級為 HW02 v2 聊天機器人，目標是在原有聊天能力上加入：

- 長期記憶（跨對話保存）
- 多模態輸入（文字 + 多張圖片 URL / data URL）
- 模型自動路由（快 / 推理 / 視覺）
- 模型原生工具呼叫與正式 MCP(JSON-RPC) 介面

## 使用流程

1. 使用者在前端輸入文字，或加上圖片 URL。
2. 前端傳送聊天請求到 `/api/chat`，並附上設定（autoRoute / useTools / useLongTermMemory）。
3. 後端先做三件事：
   - 依任務特徵做模型路由
   - 查詢長期記憶並注入 context
   - 先嘗試模型原生 tool calling；若沒有工具呼叫，再退回本地 heuristic tool fallback
4. 後端呼叫 LLM 串流回傳結果（SSE），前端即時渲染。
5. 回合結束後，後端更新短期記憶與長期記憶。

## 核心模組

- 前端 UI 模組：設定區、歷史對話、聊天串流、v2 控制開關。
- 路由模組：根據圖片/複雜度挑選模型。
- 記憶模組：
  - 短期記憶：Map（RAM）
  - 長期記憶：`backend/data/long_term_memory.json`
- 工具模組：`get_time`、`calculate`、`memory_recall`。
- 正式 MCP(JSON-RPC) 端點：`POST /mcp`
- Legacy MCP helper：`/api/mcp/tools` 與 `/api/mcp/call`

## 特色與價值

- 能根據任務型態自動切換模型，兼顧速度與品質。
- 記住使用者偏好，對話更連續。
- 工具輔助降低幻覺（例如數學計算與時間查詢）。
- 支援正式 MCP 工具與資源存取，展示更接近標準協定的整合能力。
- 支援多模態互動，能處理圖文任務。
