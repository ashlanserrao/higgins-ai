/// <reference types="vitest/config" />
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Radix's scroll lock injects a <style> the strict CSP blocks; see src/lib/style-singleton.ts.
      "react-style-singleton": path.resolve(import.meta.dirname, "src/lib/style-singleton.ts"),
    },
  },
  // In development the API runs separately: uvicorn app.main:app --port 8000
  server: { proxy: { "/api": "http://127.0.0.1:8000", "/health": "http://127.0.0.1:8000" } },
  build: { outDir: "dist", emptyOutDir: true },
  // Tests cover pure logic only; the few browser globals it touches are stubbed per test.
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
