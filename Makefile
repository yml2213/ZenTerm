.PHONY: test test-go test-frontend typecheck lint

test: test-go test-frontend

test-go:
	go test . ./internal/...

test-frontend:
	cd frontend && npm test

typecheck:
	cd frontend && npm run typecheck

lint:
	cd frontend && npm run lint
