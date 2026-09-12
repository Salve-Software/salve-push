package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/salvesoftware/salve-push/server/internal/releases"
)

type updatesHandler struct {
	service *releases.Service
}

func (h *updatesHandler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter := releases.ListUpdatesFilter{
		Channel:        q.Get("channel"),
		Platform:       q.Get("platform"),
		RuntimeVersion: q.Get("runtime_version"),
	}
	if filter.Channel == "" || filter.Platform == "" || filter.RuntimeVersion == "" {
		http.Error(w, "channel, platform and runtime_version are required", http.StatusBadRequest)
		return
	}

	list, err := h.service.ListUpdates(r.Context(), filter)
	if err != nil {
		http.Error(w, "failed to list updates", http.StatusInternalServerError)
		return
	}
	out := make([]any, 0, len(list))
	for _, rel := range list {
		out = append(out, toReleaseMetadata(rel))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *updatesHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	rel, err := h.service.Get(r.Context(), r.PathValue("id"))
	if errors.Is(err, releases.ErrNotFound) {
		http.Error(w, "update not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "failed to get update", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, toReleaseMetadata(rel))
}

func (h *updatesHandler) handleBundle(w http.ResponseWriter, r *http.Request) {
	body, rel, err := h.service.OpenBundle(r.Context(), r.PathValue("id"))
	if errors.Is(err, releases.ErrNotFound) {
		http.Error(w, "update not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "failed to open bundle", http.StatusInternalServerError)
		return
	}
	defer body.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Salve-Push-Bundle-Hash", rel.BundleHash)
	_, _ = io.Copy(w, body)
}
