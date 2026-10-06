# Changelog

## [0.4.0](https://github.com/jayeshpandey01/codefy/compare/v0.3.0...v0.4.0) (2026-10-06)


### Features

* add finding deduplication, prevent auto-scan on start, and support native report downloads ([23d82bf](https://github.com/jayeshpandey01/codefy/commit/23d82bf14010e5154f199d2f98c636bcaed52fed))
* complete E2E integration with SAST (25 tools) and DAST (30 tools) microservices via shared JWT ([fda2291](https://github.com/jayeshpandey01/codefy/commit/fda2291e202231efe614064273242a5a77a1b7e6))
* **core,extension:** Wire default zero-configuration credentials across core and extension host ([a29dab2](https://github.com/jayeshpandey01/codefy/commit/a29dab21ee04c91dfb575a71e8205f7191dc23c0))
* **extension:** Implement production credential resolution, Codefy settings, and OS Keychain integration ([97601c7](https://github.com/jayeshpandey01/codefy/commit/97601c749efb1020aab4a593b01a1b0764852bfe))
* **ui:** Apply Fix diff shows real code with scrollable multi-line changes ([0f46050](https://github.com/jayeshpandey01/codefy/commit/0f46050b716c2aa4cd0b91b035b66a9bd3d5935e))
* **vscode:** add activity bar sidebar view, fix command execution error, and clean README ([fa5c924](https://github.com/jayeshpandey01/codefy/commit/fa5c924610d0d14400f87168198c6963ec36c45a))


### Bug Fixes

* **branding:** complete transition to Codefy and fix desktop tauri scripts ([a694759](https://github.com/jayeshpandey01/codefy/commit/a694759851535d34469c62483fb0b3b07558b4de))
* **build:** enhance cross-platform Windows, Linux, and macOS packaging ([e4475d1](https://github.com/jayeshpandey01/codefy/commit/e4475d1b57f8fbbb42d8acaeb6ff28af398205e8))
* **ci:** fix lint error in finding-dedup and add alpine targets to prune-native ([b158f95](https://github.com/jayeshpandey01/codefy/commit/b158f95993210eb8082b41a01feadffcdfbb47aa))
* **extension,desktop:** reset cache, wire dynamic gateway auth client, and fix desktop tauri scripts ([9860f7b](https://github.com/jayeshpandey01/codefy/commit/9860f7b4800c04ccb29312500b66468e2f832daa))
* **extension:** bump version to 0.3.0, ensure buildPackages runs before packaging, route all 25 SAST tools, and install updated vsix ([2072ace](https://github.com/jayeshpandey01/codefy/commit/2072acea8c4dca8a7e8293239d5649c6dd78ef25))
* **extension:** Integrate UI build step into extension build and enhance file content loading ([606bb6c](https://github.com/jayeshpandey01/codefy/commit/606bb6c681fa099dfb365bee4662e3fdef75f510))
* **packaging:** restore monorepo workspace dependencies after extension deploy ([5c16d56](https://github.com/jayeshpandey01/codefy/commit/5c16d56f756d1ab93bd572a4965f8167b680afd3))
* **packaging:** Support pnpm v10 legacy deploy and strip dev scripts during packaging ([4f96563](https://github.com/jayeshpandey01/codefy/commit/4f9656374f4d94cc26ef5b8a44f2f1d225d65a84))
* **release:** support tag-based and workflow_dispatch releases, sync version 0.2.0, and configure updater keys ([9fe13e4](https://github.com/jayeshpandey01/codefy/commit/9fe13e46af6a9c455fb12dc1dbcc43e33fd31612))
* resolve orchestrator auth headers, configure direct desktop backend, and enable offline mode ([f6735c0](https://github.com/jayeshpandey01/codefy/commit/f6735c0c3d223e1b52e53b2c44f536bec6d8e1a5))
* **services:** point exclusively to cmd-d-llm auth, sast-dutn and dast-dutn microservices and purge legacy URLs ([a7d6f09](https://github.com/jayeshpandey01/codefy/commit/a7d6f09e8277c9b177cb673615052843b57bb55e))
* **vscode:** resolve invalid API key by suppressing offline dummy bearer token and rebuilding core bundles ([54bdc79](https://github.com/jayeshpandey01/codefy/commit/54bdc796d60f2a7d671ebefcea784c5a6dff8a05))

## [0.3.0](https://github.com/jayeshpandey01/codefy/compare/v0.2.0...v0.3.0) (2026-10-06)

### Features
* Unified E2E integration with SAST (25 tools) and DAST (30 tools) microservices via shared JWT from cmd-d-llm Gateway
* Automatic Render service fallback routing for high availability
* Full tool catalog support in scan header across static and dynamic security engines

## [0.2.0](https://github.com/jayeshpandey01/codefy/compare/v0.1.1...v0.2.0) (2026-10-01)


### Features

* add finding deduplication, prevent auto-scan on start, and support native report downloads ([23d82bf](https://github.com/jayeshpandey01/codefy/commit/23d82bf14010e5154f199d2f98c636bcaed52fed))
* **core,extension:** Wire default zero-configuration credentials across core and extension host ([a29dab2](https://github.com/jayeshpandey01/codefy/commit/a29dab21ee04c91dfb575a71e8205f7191dc23c0))
* **extension:** Implement production credential resolution, Codefy settings, and OS Keychain integration ([97601c7](https://github.com/jayeshpandey01/codefy/commit/97601c749efb1020aab4a593b01a1b0764852bfe))
* **ui:** Apply Fix diff shows real code with scrollable multi-line changes ([0f46050](https://github.com/jayeshpandey01/codefy/commit/0f46050b716c2aa4cd0b91b035b66a9bd3d5935e))
* **vscode:** add activity bar sidebar view, fix command execution error, and clean README ([fa5c924](https://github.com/jayeshpandey01/codefy/commit/fa5c924610d0d14400f87168198c6963ec36c45a))


### Bug Fixes

* **build:** enhance cross-platform Windows, Linux, and macOS packaging ([e4475d1](https://github.com/jayeshpandey01/codefy/commit/e4475d1b57f8fbbb42d8acaeb6ff28af398205e8))
* **ci:** fix lint error in finding-dedup and add alpine targets to prune-native ([b158f95](https://github.com/jayeshpandey01/codefy/commit/b158f95993210eb8082b41a01feadffcdfbb47aa))
* **extension:** Integrate UI build step into extension build and enhance file content loading ([606bb6c](https://github.com/jayeshpandey01/codefy/commit/606bb6c681fa099dfb365bee4662e3fdef75f510))
* **packaging:** Support pnpm v10 legacy deploy and strip dev scripts during packaging ([4f96563](https://github.com/jayeshpandey01/codefy/commit/4f9656374f4d94cc26ef5b8a44f2f1d225d65a84))
* resolve orchestrator auth headers, configure direct desktop backend, and enable offline mode ([f6735c0](https://github.com/jayeshpandey01/codefy/commit/f6735c0c3d223e1b52e53b2c44f536bec6d8e1a5))
* **vscode:** resolve invalid API key by suppressing offline dummy bearer token and rebuilding core bundles ([54bdc79](https://github.com/jayeshpandey01/codefy/commit/54bdc796d60f2a7d671ebefcea784c5a6dff8a05))
