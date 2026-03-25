# 2026-03-25 移除 Paperclip 倉庫內 Docker 佈署檔

## 變更內容

- 刪除 `docker-compose.yml`、`docker-compose.dev.yml`、`Dockerfile.paperclip`、`Dockerfile.paperclip.dev`、`browser-use-service/Dockerfile`、`browser-use-service/Dockerfile.dev`、`.dockerignore`。
- 刪除僅供 Docker 開發使用的 `scripts/docker-entrypoint-paperclip-dev.sh` 與 `scripts/docker-onboard-smoke.sh`。
- README 改為說明本機 `pnpm dev` 與 [browser-use-service/README.md](../../browser-use-service/README.md) 啟動方式。
- 合併調整 `2026-03-24-browser-use-tool-gateway.markdown` 中與 Docker 佈署相關的段落；歷史變更紀錄檔 `2026-03-25-docker-dev-compose.markdown` 已刪除（內容已由本檔取代說明）。

OpenClaw 等 smoke 腳本若使用**外部** OpenClaw Docker 目錄者仍保留，與本倉庫 Paperclip 映像無關。
