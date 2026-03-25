# my-paperclip-custom

本倉庫為 [Paperclip](https://github.com/paperclipai/paperclip) 的自訂 fork，在官方版本基礎上加入自用功能與調整，並推送至自己的遠端以維護。

---

## 我的說明

- 基於上游 Paperclip 進行客製，保留並延伸所需功能（例如：InstanceSidebar / Instance 設定、IssueRow、executionLabel、側邊欄可調寬度、Agent 樹狀/模型篩選、Cost 圖表、Issue 更新/子任務完成 wake 等）。
- 開發與部署方式與上游一致，詳見上游 [doc/DEVELOPING.md](doc/DEVELOPING.md) 與 [doc/SPEC-implementation.md](doc/SPEC-implementation.md)。

---

## 本機開發（Browser-Use + Paperclip）

1. **Browser-Use 微服務**（埠 `3001`）：依 [browser-use-service/README.md](browser-use-service/README.md) 以 `uvicorn` 本機啟動。
2. **Paperclip**：在 `paperclip-official` 根目錄執行 `pnpm dev`；`.env` 需設定 `PAPERCLIP_BROWSER_USE_SERVICE_URL=http://127.0.0.1:3001` 及與微服務相同的 secret／token。
3. **可見瀏覽器除錯**：在 Paperclip `.env` 與啟動 browser-use 的 shell 都設定 `PAPERCLIP_BROWSER_USE_DEBUG=true`（或 `1` / `yes`），AI 透過工具啟動瀏覽器時會以 **非 headless** 顯示視窗；未開則預設 **headless** 背景執行。詳見 [browser-use-service/README.md](browser-use-service/README.md)。

---

## 來源說明

- **上游專案：** [paperclipai/paperclip](https://github.com/paperclipai/paperclip)
- **授權：** MIT © 2026 Paperclip
- 本 fork 僅供自用與學習，功能與文件以官方倉庫為準。
