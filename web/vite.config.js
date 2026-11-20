import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 相对路径：同一份构建既能挂在站点根路径，
  // 也能挂在作品集域名的 /demo/ 子路径下（同域嵌入用）
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 框架代码单独成块，升业务代码时浏览器可命中缓存
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router")) return "router";
          if (id.includes("react") || id.includes("scheduler")) return "react";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3031",
    },
  },
});
