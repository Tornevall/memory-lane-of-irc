# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Added `Makefile` for operator-friendly commands: `install`, `dev`, `build`, `rebuild`, `preview`, and `lint`.
- Added `AGENTS.md` guidance for IRCLogs React architecture, import/review expectations, and deployment constraints.

### Changed
- Updated Vite build configuration for `/irclogs-react/` subpath deployment.
- Updated production build output behavior to generate deployable files directly in the app directory.
