NPM ?= npm

.DEFAULT_GOAL := help

.PHONY: help install dev build rebuild preview lint

help:
	@echo "Available targets:"
	@echo "  make install  - Install npm dependencies"
	@echo "  make dev      - Start Vite dev server"
	@echo "  make build    - Build production bundle"
	@echo "  make rebuild  - Install + build"
	@echo "  make preview  - Preview built app"
	@echo "  make lint     - Run ESLint"

install:
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
