import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
    },
  },
  resolve: {
    // Pin module resolution to the Node/extension-host build of the
    // "#ast-grep-adapter" internal subpath (see package.json#imports) so
    // this package's test suite always exercises AstGrepNapiAdapter. The
    // wasm adapter is exercised inside apps/desktop-app's own browser-like
    // Worker environment, not here.
    conditions: ["whoami-node"],
  },
});
