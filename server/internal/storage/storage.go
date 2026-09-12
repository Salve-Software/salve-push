// Package storage abstracts bundle byte storage behind local filesystem and S3-compatible backends.
package storage

import (
	"context"
	"io"
)

type Storage interface {
	Put(ctx context.Context, key string, r io.Reader) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	Exists(ctx context.Context, key string) (bool, error)
}
