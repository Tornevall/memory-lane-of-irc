NPM ?= npm

.DEFAULT_GOAL := help

.PHONY: help install-npm install dev build deploy rebuild preview lint

help:
	@echo "Available targets:"
	@echo "  make install-npm - Ensure npm exists (apt-get/nodejs + NodeSource fallback)"
	@echo "  make install     - Bootstrap .env + install dependencies"
	@echo "  make dev      - Start Vite dev server"
	@echo "  make build    - Build production bundle to dist/"
	@echo "  make deploy   - Publish dist/ to webroot (index.html, assets, vite.svg)"
	@echo "  make rebuild  - Install + build + deploy"
	@echo "  make preview  - Preview built app"
	@echo "  make lint     - Run ESLint"

install-npm:
	@if command -v $(NPM) >/dev/null 2>&1; then \
		echo "Found npm: $$($(NPM) --version)"; \
	elif command -v apt-get >/dev/null 2>&1; then \
		echo "npm not found. Attempting bootstrap via apt-get..."; \
		ASROOT=""; \
		if [ "$$(id -u)" -ne 0 ]; then \
			if command -v sudo >/dev/null 2>&1; then ASROOT="sudo"; else \
				echo "ERROR: npm missing and sudo is unavailable. Run as root or install Node/npm manually."; \
				exit 1; \
			fi; \
		fi; \
		$$ASROOT apt-get update; \
		if ! $$ASROOT apt-get install -y nodejs; then \
			echo "WARN: apt-get nodejs install failed."; \
		fi; \
		if ! command -v $(NPM) >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then \
			echo "Attempting NodeSource fallback (node includes npm)..."; \
			curl -fsSL https://deb.nodesource.com/setup_20.x | $$ASROOT bash -; \
			$$ASROOT apt-get install -y nodejs; \
		fi; \
		if ! command -v $(NPM) >/dev/null 2>&1; then \
			echo "ERROR: npm still unavailable after bootstrap attempts (apt-get/nodejs + NodeSource fallback)."; \
			exit 1; \
		fi; \
	else \
		echo "ERROR: npm missing and apt-get unavailable. Install Node.js/npm manually."; \
		exit 1; \
	fi

install: install-npm
	@if [ ! -f .env ] && [ -f .env.example ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example (production bootstrap)."; \
		if ! grep -q '^VITE_APP_ENV=' .env; then \
			echo 'VITE_APP_ENV=production' >> .env; \
		fi; \
	fi
	$(NPM) install --no-audit --no-fund

dev:
	$(NPM) run dev

build:
	$(NPM) run build

deploy: build
	@if [ ! -f dist/index.html ]; then \
		echo "ERROR: dist/index.html missing; build failed or dist not generated."; \
		exit 1; \
	fi
	@cp -f dist/index.html index.html
	@rm -rf assets
	@mkdir -p assets
	@cp -a dist/assets/. assets/
	@if [ -f dist/vite.svg ]; then cp -f dist/vite.svg vite.svg; fi
	@echo "Deployed dist/ -> webroot."

rebuild: install deploy

preview:
	$(NPM) run preview

lint:
	$(NPM) run lint
