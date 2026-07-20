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
- Updated `make install` to ensure `npm` exists first, with automatic `apt-get` installation fallback when available.

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
