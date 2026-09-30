import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "offline-templates.spec.ts", reporter: "list", timeout: 60000,
  use: { baseURL: "http://localhost:3107" },
  webServer: { command: "node e2e/offline-server.mjs", url: "http://localhost:3107", reuseExistingServer: false },
});
