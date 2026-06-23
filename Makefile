.PHONY: test test-go test-frontend typecheck lint sync-version

test: test-go test-frontend

test-go:
	go test . ./cmd ./internal/...

test-frontend:
	cd frontend && npm test

typecheck:
	cd frontend && npm run typecheck

lint:
	cd frontend && npm run lint

sync-version:
	@node -e "\
	  const fs = require('fs'); \
	  const wails = JSON.parse(fs.readFileSync('wails.json', 'utf8')); \
	  const pkg = JSON.parse(fs.readFileSync('frontend/package.json', 'utf8')); \
	  pkg.version = wails.info.productVersion; \
	  fs.writeFileSync('frontend/package.json', JSON.stringify(pkg, null, 2) + '\n'); \
	  console.log('frontend/package.json 版本已同步为 ' + wails.info.productVersion); \
	"
