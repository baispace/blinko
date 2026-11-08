import { defineConfig, mergeConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  ssr: { noExternal: true },
  build: {
    ssr: "src/blog-article.server.tsx",
    outDir: "../dist/blog-server",
    emptyOutDir: true,
  },
});
