import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import dts from "vite-plugin-dts";

// Dual-purpose config: `vite` (serve) runs the dev/ playground harness against
// packages/ui/src directly; `vite build` produces the published library bundle.
// See dev/ (local-only, not part of the published package) vs src/ (the library).
export default defineConfig(({ command }) => ({
  root: command === "serve" ? "dev" : undefined,
  plugins: [
    react(),
    tailwindcss(),
    // Only needed for the library build -- running it during `vite serve` is
    // wasted work and not all versions tolerate it gracefully in dev mode.
    ...(command === "build" ? [dts({ tsconfigPath: "./tsconfig.json" })] : []),
  ],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "whoami-ui.js",
    },
    // Ship one precompiled CSS file (dist/whoami-ui.css) so consuming apps
    // just `import '@whoami/ui/styles.css'` with zero Tailwind config of
    // their own -- see CLAUDE.md's "single design system" principle.
    cssCodeSplit: false,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        // Vite otherwise derives the merged CSS asset's name from the
        // package name ("ui.css"), not from build.lib.fileName -- pin it so
        // it matches the "./styles.css" export in package.json.
        assetFileNames: "whoami-ui[extname]",
      },
    },
  },
}));
