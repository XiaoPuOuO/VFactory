import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    /** 避免多份 @tanstack/react-query 導致 QueryClientProvider 與 hooks 使用不同 React Context */
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        ws: true,
      },
    },
  },
});
