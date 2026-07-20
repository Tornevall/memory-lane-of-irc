# IRCLogs React Agent Notes

This document defines implementation rules for `public/irclogs-react` as a standalone IRC log viewer frontend.

## Core Rules

- AJAX/API-driven interaction is the default for search, filtering, pagination, highlights, review tools, and all other
  responsive in-app interactions.
- Deep-linkability is mandatory: all shareable states must have direct URL support (openable without prior navigation), even
  when data loading is AJAX-driven.
- Never assume destructive migration support from this frontend. Any backend migration-related implementation must preserve
  existing IRC log tables and data; no purge/drop/fresh/reset semantics.
- Auth mode should be backend-driven when possible: frontend may use host-based defaults, but should prefer explicit backend
  hints (for example response headers indicating whether API key is required) to avoid environment drift.

## Import/Review Workflow Contract (Backend-Assisted)

- Ingestions are two-phase: write to review/sandbox first, then explicit approval promotes to production.
- Review and production schemas should remain structurally aligned to avoid lossy approval transforms.
- Filtered/rejected rows must remain review-auditable.
- Bulk ingestion by folder/network context should be supported by backend APIs and reflected in frontend UX.

## Format Handling Expectations

- Manual format selection must always be available (eggdrop, znc, ircii, mirc, etc.).
- Optional AI analysis may suggest best-fit format and parser-regex strategy, but user/operator choice remains authoritative.
- Channel/network ambiguity should be surfaced to the user for explicit input.
- Frontend must be robust to mixed/noisy legacy formats (timestamp-less ircii lines, control text, multichannel patterns like
  `<nick:#channel>`, and desynced/netsplit-derived logs).

## Automation and Testing

- Keep API contracts compatible with script-driven review ingestion workflows (for repeatable shell-based testing).
- Preserve environment-driven API configuration (`VITE_API_URL`) so the app remains deployable as a standalone artifact.

## Build/Deploy Contract

- This app is served from `/irclogs-react/` (subdirectory), not domain root.
- Production builds must emit asset URLs compatible with that subpath.
- Keep a CLI-friendly build flow available for operators (`make install`, `make build`, `make rebuild`).
- If deployment artifacts are generated in-place, verify that `index.html` references built `/irclogs-react/assets/*` files (never `/src/*`) before considering deploy complete.

## Release Discipline (Mandatory)

- Every committed change in `public/irclogs-react` must be pushed to the configured GitHub remote as part of the same change flow.
- Do not leave local-only commits for this project unless explicitly requested by operator.
- `CHANGELOG.md` must be updated for every meaningful change set with concrete, operator-useful details (what changed, why it changed, and operational/deploy impact when relevant).
- Changelog entries must avoid vague placeholders; include affected surfaces (UI, API contract usage, build/deploy behavior, auth/read-write policy, etc.).
