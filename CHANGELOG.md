# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Added `Makefile` for operator-friendly commands: `install`, `dev`, `build`, `rebuild`, `preview`, and `lint`.
- Added Makefile `help` target (default) to list available build/dev commands.
- Added `AGENTS.md` guidance for IRCLogs React architecture, import/review expectations, and deployment constraints.
- Added mandatory release-governance rules in `AGENTS.md`: push every change to GitHub and keep changelog entries comprehensive.

### Changed
- Updated Vite build configuration for `/irclogs-react/` subpath deployment.
- Updated production build output behavior to generate deployable files directly in the app directory.
- Updated auth UX to allow readonly browsing without API key and gate write actions behind saved key.
- Updated API docs to reflect optional auth for read endpoints and required auth for write endpoints.
- Updated `make install` bootstrap flow: tries `apt-get install nodejs` first (avoids common Ubuntu `npm` package conflicts), then NodeSource fallback when `npm` is still missing.
- Added trusted-host auth detection (`tools.tornevall.com` / `tools.tornevall.net`) so frontend can treat API key as optional there, including write-access UI state.
- Updated installer bootstrap: if `.env` is missing, `make install` now copies `.env.example` and appends `VITE_APP_ENV=production`.
- Added backend-driven auth-mode hint support via response headers (`X-Irclog-Auth-Mode` / `X-Irclog-Api-Key-Required`) with hostname fallback.
- Split npm bootstrap into dedicated `make install-npm`; `make install` now depends on it and focuses on `.env` + dependency install.
- Fixed Vite build layout: source `index.html` restored to dev entry (`/src/main.jsx`) and production output moved back to `dist/` to avoid source overwrite/build recursion failures.
- Added explicit `make deploy` target and changed `make rebuild` to run install + build + deploy, so rebuilt artifacts are actually published to webroot.
- Fixed asset base-path handling: Vite base now comes from env (`BASE_URL` / `VITE_BASE_URL`) so root hosts and subdirectory hosts both resolve JS/CSS correctly without `/missing/` redirects.
- Added `make clean` target to remove build artifacts (`dist/`) and Vite cache (`node_modules/.vite`).
- Added `index.source.html` + `make ensure-source-index`; `make build` now restores source index before Vite build so deploy-generated index files do not break future builds.
- Switched default Vite base to relative (`./`) so JS/CSS always resolve from the deployed React root, preventing wrong absolute `/assets/*` requests on mixed hosts.
- Tightened base-path logic further: build now ignores legacy `BASE_URL` and only honors explicit `VITE_BASE_URL` override; default remains auto-resolving relative assets.
- Added router basename auto-detection for `/irclogs-react` so React routes resolve correctly in subdirectory deployments (`no routes matched location` fixed).
- Added network + channel selectors on the Search start page (loaded from `/api/irclog/networks` and `/api/irclog/networks/{id}/channels`) so filtering can start before first query.
- Added `make distclean` target: runs `clean` and also removes `.env`.
- Fixed network/channel selector API compatibility: frontend now falls back to `/irc/api/networks` and `/irc/api/networks/{id}/channels` when `/api/irclog/*` routes are missing, and normalizes object-shaped API errors into readable text (no `[object Object]`).
- Added explicit API target selection (`VITE_API_TARGET=prod|test`) as a shorthand when `VITE_API_URL` is not set, so operators can switch React between `tools.tornevall.net` and `tools.tornevall.com` without code edits.
- Updated docs/examples and permalink handling to use resolved runtime API base instead of hardcoded `.com` links, keeping test/prod behavior consistent.
- Added Makefile operator targets `build-test`, `build-prod`, `rebuild-test`, and `rebuild-prod` for one-command environment switching.

## [2026-07-20]

### Added
- Added project-level `CHANGELOG.md` using Keep a Changelog format.
- Added `Makefile` targets for repeatable local/operator workflows:
  - `make install`
  - `make dev`
  - `make build`
  - `make rebuild`
  - `make preview`
  - `make lint`
- Added `AGENTS.md` rules for:
  - AJAX/API-driven behavior and deep-link parity.
  - Two-phase import/review expectations.
  - Subdirectory deploy constraints under `/irclogs-react/`.

### Changed
- Changed Vite production base path to `/irclogs-react/` so assets resolve correctly when served from subdirectory.
- Changed Vite build output strategy to emit deploy-ready files in-place for this hosted setup.

## [2026-02-27]

### Changed
- General project update commit (`Update.`) to current app state.

## [2026-02-25]

### Added
- Added initial complete React application for IRC Memory Lane API integration.
- Added IRC logs API integration work (merged from `copilot/add-irc-logs-api`).
- Added repository bootstrapping (initial commit and planning scaffold).
