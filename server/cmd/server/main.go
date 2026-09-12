// Command server runs the salve-push-server HTTP API.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/salvesoftware/salve-push/server/internal/api"
	"github.com/salvesoftware/salve-push/server/internal/config"
	"github.com/salvesoftware/salve-push/server/internal/database"
	"github.com/salvesoftware/salve-push/server/internal/storage"
	"github.com/salvesoftware/salve-push/server/migrations"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	db, err := database.Open(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := database.Migrate(context.Background(), db, migrations.FS); err != nil {
		logger.Error("failed to run migrations", "error", err)
		os.Exit(1)
	}

	blobs, err := newStorage(context.Background(), cfg)
	if err != nil {
		logger.Error("failed to initialize storage", "error", err)
		os.Exit(1)
	}

	router := api.NewRouter(cfg, db, blobs, logger)

	logger.Info("starting salve-push-server", "addr", cfg.Addr)
	if err := http.ListenAndServe(cfg.Addr, router); err != nil {
		logger.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func newStorage(ctx context.Context, cfg *config.Config) (storage.Storage, error) {
	switch {
	case cfg.StorageEndpoint != "":
		return storage.NewS3(ctx, storage.S3Config{
			Endpoint:  cfg.StorageEndpoint,
			Bucket:    cfg.StorageBucket,
			AccessKey: cfg.StorageAccessKey,
			SecretKey: cfg.StorageSecretKey,
		})
	case cfg.StorageLocalPath != "":
		return storage.NewLocal(cfg.StorageLocalPath)
	default:
		return nil, fmt.Errorf("no storage backend configured: set STORAGE_ENDPOINT (S3) or STORAGE_LOCAL_PATH")
	}
}
