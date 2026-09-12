// Package config loads salve-push-server configuration from environment variables.
package config

import "os"

type Config struct {
	Addr             string
	DatabaseURL      string
	StorageEndpoint  string
	StorageBucket    string
	StorageAccessKey string
	StorageSecretKey string
	StorageLocalPath string
}

func Load() (*Config, error) {
	return &Config{
		Addr:             getEnv("ADDR", ":8080"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		StorageEndpoint:  os.Getenv("STORAGE_ENDPOINT"),
		StorageBucket:    os.Getenv("STORAGE_BUCKET"),
		StorageAccessKey: os.Getenv("STORAGE_ACCESS_KEY"),
		StorageSecretKey: os.Getenv("STORAGE_SECRET_KEY"),
		StorageLocalPath: os.Getenv("STORAGE_LOCAL_PATH"),
	}, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
