NPM ?= npm

.PHONY: install dev build rebuild preview lint

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
