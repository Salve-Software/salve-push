FROM golang:1.25-alpine AS build
WORKDIR /src
COPY server/go.mod server/go.sum* ./
RUN go mod download
COPY server/. .
COPY protocol/ /protocol/
RUN go generate ./...
RUN CGO_ENABLED=0 go build -o /out/salve-push-server ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/salve-push-server /usr/local/bin/salve-push-server
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/salve-push-server"]
