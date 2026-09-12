.PHONY: run build test generate

run:
	go run ./cmd/server

build:
	CGO_ENABLED=0 go build -o bin/salve-push-server ./cmd/server

test:
	go test ./...

generate:
	go generate ./...
