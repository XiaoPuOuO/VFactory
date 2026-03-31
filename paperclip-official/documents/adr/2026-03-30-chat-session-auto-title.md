# ADR：Direct 聊天「快速新增對話」預設名稱與第一則訊息後自動標題

## 決策

- 使用者點「新增對話」時不再跳出命名 modal；前端以 i18n 預設字串（如「新對話」）建立具名 session，並帶 `autoSessionTitle: true`。
- DB `chat_rooms.awaiting_session_title` 標記此房間待自動命名。
- Board 送出**第一則**訊息且訊息總數為 1 時，原子清除旗標並**非同步**呼叫輕量標題生成（**不**建立 heartbeat run）。
- 生成優先順序：`CHAT_SESSION_TITLE_ADAPTER_URL`（HTTP POST）→ OpenAI Chat Completions（`CHAT_SESSION_TITLE_OPENAI_API_KEY` 或 `OPENAI_API_KEY`）。皆無則略過，房名維持預設。
- 標題寫入後發佈即時事件 `chat.room.updated`，前端 invalidate 房間列表與單房詳情。

## 環境變數

見根目錄 `.env.example` 區塊「聊天室快速新增對話自動標題」。

## API

`POST /companies/:companyId/chat/rooms` body 可選 `autoSessionTitle: boolean`（僅 `type: "direct"` 且須一併傳非空 `name`）。
