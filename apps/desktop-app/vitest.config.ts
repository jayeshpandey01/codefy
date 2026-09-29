import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so tests don't load the wasm/static-copy
// build plugins. Tauri plugins are mocked per test with vi.mock.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
