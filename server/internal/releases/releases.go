// Package releases implements creation, publishing and lookup of OTA releases.
package releases

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
	"github.com/salvesoftware/salve-push/server/internal/storage"
)

var ErrHashMismatch = errors.New("bundle hash mismatch")
var ErrNotFound = errors.New("release not found")
var ErrInvalidID = errors.New("invalid release id")

type Release struct {
	ID                string
	Version           string
	Platform          string
	Channel           string
	RuntimeVersion    string
	BundleHash        string
	Signature         string
	BundleSize        int64
	BundleStorageKey  string
	RolloutPercentage int
	PublishedAt       *time.Time
	CreatedAt         time.Time
}

type CreateInput struct {
	Version           string
	Platform          string
	Channel           string
	RuntimeVersion    string
	BundleHash        string
	Signature         string
	RolloutPercentage int
	Bundle            io.Reader
}

type ListUpdatesFilter struct {
	Channel        string
	Platform       string
	RuntimeVersion string
}

type Service struct {
	db      *sql.DB
	storage storage.Storage
}

func NewService(db *sql.DB, blobs storage.Storage) *Service {
	return &Service{db: db, storage: blobs}
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*Release, error) {
	buf, err := io.ReadAll(in.Bundle)
	if err != nil {
		return nil, fmt.Errorf("read bundle: %w", err)
	}
	sum := sha256.Sum256(buf)
	computedHash := hex.EncodeToString(sum[:])
	if computedHash != in.BundleHash {
		return nil, ErrHashMismatch
	}

	id := uuid.NewString()
	storageKey := fmt.Sprintf("releases/%s/bundle", id)
	if err := s.storage.Put(ctx, storageKey, bytes.NewReader(buf)); err != nil {
		return nil, fmt.Errorf("store bundle: %w", err)
	}

	rel := &Release{
		ID:                id,
		Version:           in.Version,
		Platform:          in.Platform,
		Channel:           in.Channel,
		RuntimeVersion:    in.RuntimeVersion,
		BundleHash:        in.BundleHash,
		Signature:         in.Signature,
		BundleSize:        int64(len(buf)),
		BundleStorageKey:  storageKey,
		RolloutPercentage: in.RolloutPercentage,
		CreatedAt:         time.Now().UTC(),
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO releases (
			id, version, platform, channel, runtime_version, bundle_hash,
			signature, bundle_size, bundle_storage_key, rollout_percentage,
			created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		rel.ID, rel.Version, rel.Platform, rel.Channel, rel.RuntimeVersion,
		rel.BundleHash, rel.Signature, rel.BundleSize, rel.BundleStorageKey,
		rel.RolloutPercentage, rel.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("insert release: %w", err)
	}
	return rel, nil
}

func (s *Service) Publish(ctx context.Context, id string) (*Release, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, ErrInvalidID
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE releases SET published_at = now() WHERE id = $1 AND published_at IS NULL`,
		id,
	)
	if err != nil {
		return nil, fmt.Errorf("publish release: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := s.Get(ctx, id); err != nil {
			return nil, err
		}
	}
	return s.Get(ctx, id)
}

func (s *Service) List(ctx context.Context) ([]*Release, error) {
	rows, err := s.db.QueryContext(ctx, selectColumns+` FROM releases ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list releases: %w", err)
	}
	defer rows.Close()
	return scanReleases(rows)
}

func (s *Service) Get(ctx context.Context, id string) (*Release, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, ErrInvalidID
	}
	row := s.db.QueryRowContext(ctx, selectColumns+` FROM releases WHERE id = $1`, id)
	rel, err := scanRelease(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get release: %w", err)
	}
	return rel, nil
}

func (s *Service) ListUpdates(ctx context.Context, f ListUpdatesFilter) ([]*Release, error) {
	rows, err := s.db.QueryContext(ctx, selectColumns+`
		FROM releases
		WHERE published_at IS NOT NULL
		  AND channel = $1 AND platform = $2 AND runtime_version = $3
		  AND rollout_percentage > 0
		ORDER BY created_at DESC`,
		f.Channel, f.Platform, f.RuntimeVersion,
	)
	if err != nil {
		return nil, fmt.Errorf("list updates: %w", err)
	}
	defer rows.Close()
	return scanReleases(rows)
}

func (s *Service) OpenBundle(ctx context.Context, id string) (io.ReadCloser, *Release, error) {
	rel, err := s.Get(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	r, err := s.storage.Get(ctx, rel.BundleStorageKey)
	if err != nil {
		return nil, nil, fmt.Errorf("open bundle: %w", err)
	}
	return r, rel, nil
}

const selectColumns = `
	SELECT id, version, platform, channel, runtime_version, bundle_hash,
	       signature, bundle_size, bundle_storage_key, rollout_percentage,
	       published_at, created_at`

type scanner interface {
	Scan(dest ...any) error
}

func scanRelease(row scanner) (*Release, error) {
	var rel Release
	err := row.Scan(
		&rel.ID, &rel.Version, &rel.Platform, &rel.Channel, &rel.RuntimeVersion,
		&rel.BundleHash, &rel.Signature, &rel.BundleSize, &rel.BundleStorageKey,
		&rel.RolloutPercentage, &rel.PublishedAt, &rel.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rel, nil
}

func scanReleases(rows *sql.Rows) ([]*Release, error) {
	var out []*Release
	for rows.Next() {
		rel, err := scanRelease(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, rel)
	}
	return out, rows.Err()
}
