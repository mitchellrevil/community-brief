import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "recording-drafts.spec.ts", reporter: "list",
  use: { baseURL: "http://localhost:3105" },
  webServer: { command: "node node_modules/vite/bin/vite.js --port 3105 --strictPort", url: "http://localhost:3105", reuseExistingServer: false },
});
