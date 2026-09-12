package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/salvesoftware/salve-push/server/internal/releases"
	"github.com/salvesoftware/salve-push/server/pkg/protocol"
)

const maxBundleUploadBytes = 200 << 20

type releasesHandler struct {
	service *releases.Service
}

func (h *releasesHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxBundleUploadBytes); err != nil {
		http.Error(w, "invalid multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("bundle")
	if err != nil {
		http.Error(w, "missing bundle file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	rollout := 100
	if v := r.FormValue("rollout_percentage"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 || n > 100 {
			http.Error(w, "invalid rollout_percentage", http.StatusBadRequest)
			return
		}
		rollout = n
	}

	in := releases.CreateInput{
		Version:           r.FormValue("version"),
		Platform:          r.FormValue("platform"),
		Channel:           r.FormValue("channel"),
		RuntimeVersion:    r.FormValue("runtime_version"),
		BundleHash:        r.FormValue("bundle_hash"),
		Signature:         r.FormValue("signature"),
		RolloutPercentage: rollout,
		Bundle:            file,
	}
	if in.Version == "" || in.Platform == "" || in.Channel == "" ||
		in.RuntimeVersion == "" || in.BundleHash == "" || in.Signature == "" {
		http.Error(w, "version, platform, channel, runtime_version, bundle_hash and signature are required", http.StatusBadRequest)
		return
	}

	rel, err := h.service.Create(r.Context(), in)
	switch {
	case errors.Is(err, releases.ErrHashMismatch):
		http.Error(w, "bundle_hash does not match uploaded bundle content", http.StatusBadRequest)
		return
	case err != nil:
		http.Error(w, "failed to create release", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, toReleaseMetadata(rel))
}

func (h *releasesHandler) handleList(w http.ResponseWriter, r *http.Request) {
	list, err := h.service.List(r.Context())
	if err != nil {
		http.Error(w, "failed to list releases", http.StatusInternalServerError)
		return
	}
	out := make([]protocol.ReleaseMetadata, 0, len(list))
	for _, rel := range list {
		out = append(out, toReleaseMetadata(rel))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *releasesHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	rel, err := h.service.Get(r.Context(), r.PathValue("id"))
	switch {
	case errors.Is(err, releases.ErrInvalidID):
		http.Error(w, "invalid release id", http.StatusBadRequest)
		return
	case errors.Is(err, releases.ErrNotFound):
		http.Error(w, "release not found", http.StatusNotFound)
		return
	case err != nil:
		http.Error(w, "failed to get release", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, toReleaseMetadata(rel))
}

func (h *releasesHandler) handlePublish(w http.ResponseWriter, r *http.Request) {
	rel, err := h.service.Publish(r.Context(), r.PathValue("id"))
	switch {
	case errors.Is(err, releases.ErrInvalidID):
		http.Error(w, "invalid release id", http.StatusBadRequest)
		return
	case errors.Is(err, releases.ErrNotFound):
		http.Error(w, "release not found", http.StatusNotFound)
		return
	case err != nil:
		http.Error(w, "failed to publish release", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, toReleaseMetadata(rel))
}

func toReleaseMetadata(rel *releases.Release) protocol.ReleaseMetadata {
	rollout := rel.RolloutPercentage
	sig := rel.Signature
	return protocol.ReleaseMetadata{
		Id:                rel.ID,
		Version:           rel.Version,
		Platform:          protocol.ReleaseMetadataPlatform(rel.Platform),
		Channel:           rel.Channel,
		RuntimeVersion:    rel.RuntimeVersion,
		BundleHash:        rel.BundleHash,
		Signature:         &sig,
		RolloutPercentage: &rollout,
		Size:              int(rel.BundleSize),
		CreatedAt:         rel.CreatedAt,
	}
}
