# Cross-platform release pipeline

This document describes how one approved release updates the WhoAmI website, VS Code extension, and desktop app on macOS, Windows, and Linux. A push should start validation and notify maintainers; production releases should happen after code is reviewed and a release is approved.

## Current repository state

- GitHub Actions already has CI, release-please, extension packaging/publication, and Tauri desktop build workflows under `.github/workflows/`.
- The extension has platform-specific VSIX packaging targets. VS Code checks and installs published extension updates when its auto-update setting is enabled. WhoAmI can show a notice after the extension update is activated.
- The desktop app uses `tauri-plugin-updater`, checks at startup and hourly, and can display an update prompt. The Tauri updater supports macOS, Windows, and Linux, but requires signed update artifacts and a correct platform manifest.
- The website is a separate repository at `../whoami_ui` (`jayeshpandey01/whoami_ui`). The homepage is `src/pages/index.astro`; Astro 7 SSR and `@astrojs/vercel` serve it. `SITE_URL` defaults to `https://codefy.ai`, and the package requires Node 22+. The local checkout has pre-existing uncommitted edits. I found generated `.vercel/output`, but no `.vercel/project.json`, so the build output does not prove the repo is linked to the production Vercel project.
- An initial website build workflow and `DEPLOYMENT.md` have been created locally in `whoami_ui`, but are untracked and have not run in GitHub. The build workflow checks PRs and pushes to `main`; it does not deploy. No production deployment or Vercel domain assignment has been verified.
- Website deploy path: link `whoami_ui` in Vercel to the project serving `codefy.ai`, set the production branch, and use Git integration for PR previews and production deploys. Protect the production branch so website CI passes before merge. This is a separate repo and release lifecycle from the desktop and extension. After successful deployment, the homepage changes for subsequent HTTP requests; already-open tabs need refresh. A live-update banner is optional product behavior, not required for deployment.
- Publishing is not operational until Marketplace/Open VSX credentials and desktop updater signing credentials are configured in GitHub.

## Desired flow

```text
Pull request / push
  -> lint, type-check, tests, build
  -> GitHub Actions reports pass/fail to maintainers

Merge to main
  -> Vercel production deployment from whoami_ui (when its production branch is updated)
  -> release-please opens or updates a Release PR from Conventional Commits

Merge Release PR
  -> version/tag and changelog are created
  -> publish extension packages to VS Code Marketplace and Open VSX
  -> build and sign desktop updates for macOS, Windows, and Linux
  -> publish the updater manifest and release assets
  -> users receive updates through each product's update mechanism
```

The Release PR is the production gate. Shipping every commit straight to users would remove the review point and could distribute unfinished work. If continuous deployment is later desired, use a separate preview/staging channel for every merge and retain an explicit production release decision.

## Implementation plan

### Phase 1: CI and maintainer feedback

1. Run CI on pull requests and pushes to `main` (add feature-branch pushes if direct push feedback is desired).
2. Keep the job order: frozen install, lint, type-check, tests, build.
3. Enable GitHub Actions email/web notifications for workflow completions in each maintainer's GitHub notification settings. These are maintainer alerts, not end-user update notices.
4. Use read-only default token permissions and grant write permissions only to jobs that create release PRs or upload assets.

### Phase 2: Website deploy

1. Confirm Vercel project linkage: repository `jayeshpandey01/whoami_ui`, project root `/`, Astro framework preset, Node 22+, build command `npm run build`, and install command `npm ci`. The repository's local `.vercel/output` is generated output and not proof of project linkage; `.vercel/project.json` is absent.
2. Set the Vercel Production Branch to `main` (or the branch chosen by the site owner), assign `codefy.ai` and `www` redirect/canonical behavior to that Production environment, and verify DNS/domain status.
3. Configure environment variables per environment. Production must use `SITE_URL=https://codefy.ai`; preview deployments should use a preview origin for absolute canonical/SEO URLs, or explicitly suppress indexing. Backend URLs and OAuth credentials should be set in Vercel, not GitHub Actions. Preview Google OAuth callback URLs must be configured if authentication is tested there.
4. Commit the local website CI workflow. Require its build status on pull requests and verify Vercel Preview deployments before merge. Protect `main` with branch rules. If using Vercel Deployment Checks, configure them to hold promotion until the required GitHub checks pass.
5. Use Vercel Git integration as the sole deploy publisher: PR/branch push creates preview, merge/push to the Production Branch creates production deployment and applies the production domain. Do not add a second Vercel deploy workflow with a long-lived token unless Git integration is intentionally unavailable.
6. Verify with a harmless homepage text change: check PR preview URL and CI status, merge after checks pass, confirm the new deployment's commit SHA, then request `https://codefy.ai/` and verify the changed page. Confirm rollback by promoting the previous deployment.
7. Keep website releases independent from desktop/extension releases unless there is a shared versioned API contract. SSR updates affect new requests automatically; do not add a browser polling banner unless an open interactive session must be hot-refreshed.

### Phase 3: Release orchestration

1. Standardize commits (`fix:`, `feat:`, `feat!:`, with optional scopes) so release-please can calculate version and changelog.
2. Make one product version source authoritative and verify the version sync script updates desktop, core, types, and UI manifests consistently.
3. On Release PR merge, build platform artifacts from the exact tag.
4. Publish platform packages and desktop assets; only publish the release as final when all required publishing jobs succeed.
5. Add a release summary with links and per-platform asset status. A failed publish should leave the release draft and alert maintainers.

### Phase 4: User updates by product

| Product/platform | Delivery | User experience |
| --- | --- | --- |
| Website, all browsers/OS | Host deploy/CDN | New visitors get the version on refresh; an open tab may offer a refresh banner if that feature is added. |
| VS Code on Windows/macOS/Linux | Marketplace/Open VSX version publication | VS Code's own extension updater downloads the update (subject to user settings); WhoAmI can announce the installed version after activation. |
| Desktop macOS Intel/Apple Silicon | Tauri signed updater artifact per architecture | Check for update, show available notice, download/verify, prompt restart. Sign and notarize for a smooth macOS install experience. |
| Desktop Windows x64/ARM64 | Tauri signed updater artifact per architecture | Check, download/verify, install with configured Windows mode, and restart. Code signing improves trust and reduces security prompts. |
| Desktop Linux x64/ARM64 | Tauri signed updater artifact per architecture | Check, download/verify, and install supported package formats. Document any distro/package-manager constraints and provide manual downloads. |

### Phase 5: Verification and rollout

1. Test a release candidate on clean machines/VMs for each OS and architecture before broad release.
2. Confirm updater manifest URLs, signatures, version comparison, release notes, and restart behavior.
3. Verify extension updates from both Marketplaces, including the post-update notice.
4. Verify website deploy preview and production URL, cache behavior, and rollback.
5. Start with a small/staged release if supported by the distribution channel; monitor workflow failures and user-reported update failures.

## Version and channel policy

`apps/vscode-extension/package.json` is currently documented as the product version source. `scripts/sync-version.mjs` copies it into shared packages and desktop manifests. Keep one release tag across website, extension, and desktop when they ship together. Use separate prerelease channels/tags for beta builds so users can opt in without replacing stable builds unexpectedly.

## Required GitHub setup

Create/protect a `release` environment and configure only the credentials needed by release jobs:

- `VSCE_PAT` for the Visual Studio Marketplace publisher and `OVSX_PAT` for Open VSX (or the providers' recommended automated publishing credentials).
- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; back up the private key securely. The matching public key is embedded in `tauri.conf.json`.
- Apple signing/notarization credentials for signed and notarized macOS distributions.
- Windows signing credentials if shipping a signed installer.
- Website provider credentials after host selection.

Use least-privilege `GITHUB_TOKEN` permissions, protected environments, and pin third-party Actions to full commit SHAs as part of hardening. Do not run release secrets in pull-request workflows from forks.

## Research references

- [Vercel Git deployments](https://vercel.com/docs/git): connected repositories create preview deployments and production deployments from the configured production branch.
- [Vercel project settings](https://vercel.com/docs/project-configuration/project-settings): root directory, Node version, build/deployment settings, environment variables, and ignored build steps are configured per project.
- [Vercel deployment checks](https://vercel.com/docs/deployment-checks): production promotion can wait for required checks when configured.
- [Astro Vercel adapter](https://v6.docs.astro.build/en/guides/integrations-guide/vercel/): the adapter builds Astro's on-demand routes for Vercel.
- [Astro on-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/): SSR pages are generated when requested, while static pages are generated at build time.

## Decisions still needed

- Confirm Vercel project and domain ownership/linkage, and confirm `main` is the actual production branch.
- Decide whether preview environments should be indexable and which OAuth callback URLs they may use.
- Decide whether the website CI build check and Vercel Preview status are required branch-protection checks.
- Decide whether website production deploys on every merge to `main` or only with a tagged website release (recommended: merge to protected `main`, with previews and required checks).
- Whether Windows ARM64 desktop builds are required at launch; the extension currently packages Windows ARM64, while the desktop matrix currently shows Windows without an ARM target.
- Whether to distribute Linux AppImage, deb/rpm, or multiple formats, and which architectures to support.
- Whether all users should get a stable release at once or whether a beta/staged channel is needed.
