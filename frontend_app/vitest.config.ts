import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [viteReact()],
  test: {
    server: {
      deps: {
        inline: ["msw", "@mswjs/interceptors"],
      },
    },
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["json", "text", "html"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
      exclude: [
        "node_modules/**",
        "dist/**",
        "e2e/**",
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/tests/**",
        "src/routeTree.gen.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
