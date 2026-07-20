NPM ?= npm

.DEFAULT_GOAL := help

.PHONY: help install dev build rebuild preview lint

help:
	@echo "Available targets:"
	@echo "  make install  - Ensure npm exists (apt-get fallback) + install dependencies"
	@echo "  make dev      - Start Vite dev server"
	@echo "  make build    - Build production bundle"
	@echo "  make rebuild  - Install + build"
	@echo "  make preview  - Preview built app"
	@echo "  make lint     - Run ESLint"

install:
	@if command -v $(NPM) >/dev/null 2>&1; then \
		echo "Found npm: $$($(NPM) --version)"; \
	elif command -v apt-get >/dev/null 2>&1; then \
		echo "npm not found. Attempting install via apt-get..."; \
		if [ "$$(id -u)" -eq 0 ]; then \
			apt-get update && apt-get install -y nodejs npm; \
		elif command -v sudo >/dev/null 2>&1; then \
			sudo apt-get update && sudo apt-get install -y nodejs npm; \
		else \
			echo "ERROR: npm missing and sudo is unavailable. Run as root or install Node/npm manually."; \
			exit 1; \
		fi; \
		if ! command -v $(NPM) >/dev/null 2>&1; then \
			echo "ERROR: npm still unavailable after apt-get install."; \
			exit 1; \
		fi; \
	else \
		echo "ERROR: npm missing and apt-get unavailable. Install Node.js/npm manually."; \
		exit 1; \
	fi
	$(NPM) install --no-audit --no-fund

dev:
	$(NPM) run dev

build:
	$(NPM) run build

rebuild: install build

preview:
	$(NPM) run preview

lint:
	$(NPM) run lint
