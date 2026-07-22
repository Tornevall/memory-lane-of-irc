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
- Added a third search mode tab, **Statistics**, powered by backend API aggregation (`aggregate=stats`) for totals, time range, event-type counts, and top nick summaries.

### Changed
- Default search result rendering now prefers raw IRC log lines (`raw_line`) to keep the classic log look while preserving the refined card layout.
- Added mIRC formatting support in result rows (colors + style control codes) instead of stripping control data from log text.
- Added per-row deep-link anchors (`#row-*`) with direct row-link actions and hash-based auto-scroll/highlight on page load.
- Added explicit event-type badges per row (`PRIVMSG`, `JOIN`, `QUIT`, etc.) so event semantics are visible at a glance.
- Fixed React IRC log search to keep the configured `VITE_API_URL` instead of silently swapping to the browser origin, which was sending requests to the wrong host.
- Fixed the React date-range helper so channel date bounds can populate the simple search inputs without a runtime scope error.
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
- Changed network/channel endpoint order to try `/irc/api/*` first (then `/api/irclog/*`, then `/irclog/*`) to avoid hard failures on hosts where only the IRC viewer routes exist.
- Added trusted-host CORS guard: when running on `tools.tornevall.com`/`.net`, a mismatched explicit `VITE_API_URL` pointing at the other trusted host is ignored in favor of same-origin API base to prevent preflight/CORS failures.
- Hardened network/channel dropdown parsing for API response variants (`array`, keyed maps, and nested `data.*`) so selectors populate even when backend payload envelope differs.
- Added environment-controlled read source (`VITE_IRCLOG_READ_SOURCE=production|sandbox`) and propagated `source` to networks/channels/log queries, so operators can browse sandbox data directly.
- Updated simple search UX: query is optional in simple mode (open channel directly), and date picker uses channel `first_date`/`last_date` limits when available.
- Fixed simple search/date-range wiring regressions so date range helper and read-source helper are callable at runtime (no undefined function errors).
- Upgraded simple-mode date control to a real date-range picker (`from` + `to`) with channel-scoped min/max constraints from `first_date`/`last_date`.
- Reworked date inputs to include explicit calendar buttons (`📅`) plus manual text entry parsing (`YYYY-MM-DD`, `YYYY/MM/DD`, `DD-MM-YYYY`), so both picker UI and free-typing are supported.
- Event-type multi-select is now scoped to **Advanced Search** only.
- Clicking the **Statistics** tab now immediately loads stats from the API using the current filter context (no extra submit click required).
- Direct entry URLs with `?mode=statistics` now auto-load statistics on page init, even without extra filters.
- Channel selection now uses a single select box (removed separate channel-filter input), and selecting a channel auto-refreshes results when a search context is active.
- Channel selection now renders as a visible listbox with fixed height (multiple visible rows) so channel lists can be seen directly without opening a one-line dropdown.
- Statistics now includes interactive chart rendering (Bar / Line / Pie) with user-selectable series for chat texts, channel events, and total activity per day.
- Event filtering is now interactive across search modes with clickable type toggles and quick presets, and defaults to chat-only (`PRIVMSG` + `ACTION`) so non-chat rows are hidden unless explicitly enabled.
- Nick WHOIS requests now tolerate installs where the IRC events table does not have a `target` column.
- Added a dedicated nick seen API integration (`/irc/api/nick-seen`) in the nick modal, showing first seen, last seen, total activity, active dates, and top event-type activity with direct viewer link.
- Statistics charts now render richer date axes (including years) and explicit date-range labels, and now include a selectable top-nicks chart with per-nick toggles.

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
