// End-to-end check of the built app, served by the real backend with the AI switched off.
// Run `npm run build` first. Uses the installed Chrome, so there's no browser download.

import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

if (!existsSync("dist/index.html")) throw new Error("No frontend build: run npm run build first.");

// Not 8000, so a server you already have running is never reused or disturbed.
const PORT = 8010;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: `http://127.0.0.1:${PORT}`, channel: "chrome" },
  webServer: {
    command: `${process.env.PYTHON ?? "python"} -m uvicorn app.main:app --port ${PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    // An empty key wins over .env, so the test never calls OpenAI.
    env: { OPENAI_API_KEY: "" },
  },
});
