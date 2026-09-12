// Package api wires HTTP routes for salve-push-server.
package api

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/salvesoftware/salve-push/server/internal/config"
	"github.com/salvesoftware/salve-push/server/internal/releases"
	"github.com/salvesoftware/salve-push/server/internal/storage"
)

func NewRouter(cfg *config.Config, db *sql.DB, blobs storage.Storage, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	svc := releases.NewService(db, blobs)

	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /.well-known/salve-push", handleServerIdentity)
	mux.HandleFunc("POST /.well-known/salve-push/challenge", handleChallenge)

	registerPublicRoutes(mux, svc)
	registerAdminRoutes(mux, svc)

	return mux
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"version": "0.1.0",
	})
}

func handleServerIdentity(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service":          "salve-push",
		"version":          "0.1.0",
		"protocol_version": 1,
		"instance_id":      "unconfigured",
	})
}

func handleChallenge(w http.ResponseWriter, _ *http.Request) {
	http.Error(w, "not implemented", http.StatusNotImplemented)
}

func registerPublicRoutes(mux *http.ServeMux, svc *releases.Service) {
	h := &updatesHandler{service: svc}
	mux.HandleFunc("GET /v1/updates", h.handleList)
	mux.HandleFunc("GET /v1/updates/{id}", h.handleGet)
	mux.HandleFunc("GET /v1/updates/{id}/bundle", h.handleBundle)
	mux.HandleFunc("POST /v1/telemetry", notImplemented)
}

func registerAdminRoutes(mux *http.ServeMux, svc *releases.Service) {
	h := &releasesHandler{service: svc}
	mux.HandleFunc("GET /v1/releases", h.handleList)
	mux.HandleFunc("POST /v1/releases", h.handleCreate)
	mux.HandleFunc("GET /v1/releases/{id}", h.handleGet)
	mux.HandleFunc("POST /v1/releases/{id}/publish", h.handlePublish)
}

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	http.Error(w, "not implemented", http.StatusNotImplemented)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
