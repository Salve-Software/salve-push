// Local implements Storage on the local filesystem.
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type Local struct {
	basePath string
}

func NewLocal(basePath string) (*Local, error) {
	if err := os.MkdirAll(basePath, 0o755); err != nil {
		return nil, fmt.Errorf("create storage root: %w", err)
	}
	return &Local{basePath: basePath}, nil
}

func (l *Local) resolve(key string) (string, error) {
	full := filepath.Join(l.basePath, filepath.FromSlash(key))
	if !filepath.IsLocal(filepath.FromSlash(key)) {
		return "", fmt.Errorf("invalid storage key %q", key)
	}
	return full, nil
}

func (l *Local) Put(_ context.Context, key string, r io.Reader) error {
	full, err := l.resolve(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return err
	}
	f, err := os.Create(full)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r)
	return err
}

func (l *Local) Get(_ context.Context, key string) (io.ReadCloser, error) {
	full, err := l.resolve(key)
	if err != nil {
		return nil, err
	}
	return os.Open(full)
}

func (l *Local) Delete(_ context.Context, key string) error {
	full, err := l.resolve(key)
	if err != nil {
		return err
	}
	err = os.Remove(full)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (l *Local) Exists(_ context.Context, key string) (bool, error) {
	full, err := l.resolve(key)
	if err != nil {
		return false, err
	}
	_, err = os.Stat(full)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}
