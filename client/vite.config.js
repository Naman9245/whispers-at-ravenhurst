import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@shared": resolve(__dirname, "../shared") },
  },
  server: {
    port: 5173,
    open: true,
    fs: { allow: [resolve(__dirname, ".."), __dirname] },
  },
});
