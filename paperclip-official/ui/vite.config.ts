import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const uiDir = __dirname;
const reactRoot = path.resolve(uiDir, "node_modules/react");
const reactDomRoot = path.resolve(uiDir, "node_modules/react-dom");

/** Docker bind mount 下原生 fs watch 常失效，需輪詢（與 compose 的 CHOKIDAR_USEPOLLING 對齊） */
const useDockerFriendlyWatch =
  process.env.CHOKIDAR_USEPOLLING === "true" || process.env.VITE_USE_POLLING === "true";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(uiDir, "./src"),
      /**
       * 強制 monorepo / middlewareMode（由 server 內嵌 Vite）時只使用 ui 這一份 React，
       * 避免預打包與原始碼解析到不同實體，出現 Invalid hook call / resolveDispatcher is null。
       */
      react: reactRoot,
      "react-dom": reactDomRoot,
      "react/jsx-runtime": path.join(reactRoot, "jsx-runtime.js"),
      "react/jsx-dev-runtime": path.join(reactRoot, "jsx-dev-runtime.js"),
    },
    /** 避免多份 @tanstack/react-query 導致 QueryClientProvider 與 hooks 使用不同 React Context */
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/react-query-persist-client",
    ],
  },
  server: {
    ...(useDockerFriendlyWatch
      ? {
          watch: {
            usePolling: true,
            interval: 1000,
          },
        }
      : {}),
    /**
     * 勿在此寫死 port：內嵌 middleware（server 與 UI 同埠）時，若合併結果仍像「獨立 Vite 在 5173」，
     * 瀏覽器 HMR 會去連 ws://localhost:5173 而失敗。
     * 獨立跑 `pnpm --filter @paperclipai/ui dev` 時 Vite 預設仍為 5173。
     */
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        ws: true,
      },
    },
  },
});
