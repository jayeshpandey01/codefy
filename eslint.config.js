// @ts-check
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: [
      "**/dist/**",
      "**/dist-node/**",
      "**/dist-wasm/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/src-tauri/target/**",
      "**/out/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Keeps the ast-grep napi/wasm dual-build boundary honest: nothing outside
    // packages/core/src/ast-grep/ may import an adapter file directly — everyone
    // else must go through the #ast-grep-adapter subpath import.
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/ast-grep/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/ast-grep-napi.adapter", "**/ast-grep-wasm.adapter"],
              message:
                "Import '#ast-grep-adapter' instead of a concrete adapter file directly — see packages/core/src/ast-grep/index.ts.",
            },
          ],
        },
      ],
    },
  },
];
