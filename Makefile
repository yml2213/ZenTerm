.PHONY: test test-version test-go test-frontend typecheck lint verify sync-version generate-bindings coverage-go prepare-frontend-assets

test: test-version test-go test-frontend

test-version:
	node --test scripts/sync-version.test.mjs
	node scripts/sync-version.mjs --check

test-go: prepare-frontend-assets
	go test . ./cmd ./internal/...

coverage-go: prepare-frontend-assets
	go test -coverprofile=coverage.out . ./cmd ./internal/...
	go tool cover -func=coverage.out

prepare-frontend-assets:
	@if [ ! -f frontend/dist/index.html ]; then \
		mkdir -p frontend/dist; \
		printf '<!doctype html><title>ZenTerm</title>' > frontend/dist/index.html; \
	fi

test-frontend:
	$(MAKE) generate-bindings
	cd frontend && npm test

typecheck:
	$(MAKE) generate-bindings
	cd frontend && npm run typecheck

lint:
	cd frontend && npm run lint

verify: test-version generate-bindings
	go test -race ./cmd ./internal/db ./internal/security ./internal/service ./internal/syncer ./internal/updater
	cd frontend && npm test && npm run typecheck && npm run lint && npm run build

generate-bindings:
	@tmp_dir=$$(mktemp -d); \
	trap 'rm -rf "$$tmp_dir"' EXIT; \
	rsync -a --exclude '.git' --exclude 'build' --exclude 'frontend/dist' --exclude 'frontend/node_modules' ./ "$$tmp_dir/"; \
	mkdir -p "$$tmp_dir/frontend/dist"; \
	printf '<!doctype html><title>ZenTerm</title>' > "$$tmp_dir/frontend/dist/index.html"; \
	wails_status=0; \
	(cd "$$tmp_dir" && GOCACHE="$$tmp_dir/.cache/go-build" wails build -s -skipembedcreate -nopackage) || wails_status=$$?; \
	if [ ! -f "$$tmp_dir/frontend/src/wailsjs/wailsjs/go/models.ts" ]; then \
		echo 'Wails 未生成前端模型绑定。' >&2; \
		exit $$wails_status; \
	fi; \
	rsync -a --delete "$$tmp_dir/frontend/src/wailsjs/" frontend/src/wailsjs/; \
	if [ $$wails_status -ne 0 ]; then \
		echo 'Wails 应用链接失败，但前端绑定已生成；请单独运行 wails build 检查本机打包工具链。' >&2; \
	fi

sync-version:
	@node scripts/sync-version.mjs
