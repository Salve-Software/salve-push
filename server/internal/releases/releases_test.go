package releases

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"testing"

	"github.com/salvesoftware/salve-push/server/internal/database"
	"github.com/salvesoftware/salve-push/server/internal/storage"
	"github.com/salvesoftware/salve-push/server/migrations"
)

func testService(t *testing.T) *Service {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	db, err := database.Open(dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if err := database.Migrate(context.Background(), db, migrations.FS); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if _, err := db.Exec(`TRUNCATE releases`); err != nil {
		t.Fatalf("truncate releases: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	blobs, err := storage.NewLocal(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocal: %v", err)
	}
	return NewService(db, blobs)
}

func hashOf(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

func validInput(content []byte) CreateInput {
	return CreateInput{
		Version:           "1.5.0",
		Platform:          "ios",
		Channel:           "production",
		RuntimeVersion:    "1.5",
		BundleHash:        hashOf(content),
		Signature:         "sig",
		RolloutPercentage: 100,
		Bundle:            bytes.NewReader(content),
	}
}

func TestCreate_RejectsBundleHashMismatch(t *testing.T) {
	svc := testService(t)
	in := validInput([]byte("bundle-a"))
	in.BundleHash = hashOf([]byte("something-else"))

	_, err := svc.Create(context.Background(), in)
	if !errors.Is(err, ErrHashMismatch) {
		t.Fatalf("Create with mismatched hash = %v, want ErrHashMismatch", err)
	}
}

func TestCreate_PersistsMetadataAndBundleBytes(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	content := []byte("bundle-contents")

	rel, err := svc.Create(ctx, validInput(content))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := svc.Get(ctx, rel.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Version != "1.5.0" || got.BundleSize != int64(len(content)) {
		t.Fatalf("Get = %+v, want version 1.5.0 and size %d", got, len(content))
	}

	body, _, err := svc.OpenBundle(ctx, rel.ID)
	if err != nil {
		t.Fatalf("OpenBundle: %v", err)
	}
	defer body.Close()
	gotBytes, err := io.ReadAll(body)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if !bytes.Equal(gotBytes, content) {
		t.Fatalf("bundle bytes = %q, want %q", gotBytes, content)
	}
}

func TestGet_UnknownIDReturnsErrNotFound(t *testing.T) {
	svc := testService(t)
	_, err := svc.Get(context.Background(), "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get on unknown id = %v, want ErrNotFound", err)
	}
}

func TestListUpdates_ExcludesUnpublishedReleases(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()
	rel, err := svc.Create(ctx, validInput([]byte("v1")))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	updates, err := svc.ListUpdates(ctx, ListUpdatesFilter{
		Channel: "production", Platform: "ios", RuntimeVersion: "1.5",
	})
	if err != nil {
		t.Fatalf("ListUpdates: %v", err)
	}
	if len(updates) != 0 {
		t.Fatalf("ListUpdates before publish = %d releases, want 0", len(updates))
	}

	if _, err := svc.Publish(ctx, rel.ID); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	updates, err = svc.ListUpdates(ctx, ListUpdatesFilter{
		Channel: "production", Platform: "ios", RuntimeVersion: "1.5",
	})
	if err != nil {
		t.Fatalf("ListUpdates: %v", err)
	}
	if len(updates) != 1 || updates[0].ID != rel.ID {
		t.Fatalf("ListUpdates after publish = %+v, want [%s]", updates, rel.ID)
	}
}

func TestListUpdates_FiltersByChannelPlatformAndRuntimeVersion(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()

	rel, err := svc.Create(ctx, validInput([]byte("v1")))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := svc.Publish(ctx, rel.ID); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	cases := []struct {
		name   string
		filter ListUpdatesFilter
		want   int
	}{
		{"matching filter", ListUpdatesFilter{Channel: "production", Platform: "ios", RuntimeVersion: "1.5"}, 1},
		{"wrong channel", ListUpdatesFilter{Channel: "staging", Platform: "ios", RuntimeVersion: "1.5"}, 0},
		{"wrong platform", ListUpdatesFilter{Channel: "production", Platform: "android", RuntimeVersion: "1.5"}, 0},
		{"wrong runtime version", ListUpdatesFilter{Channel: "production", Platform: "ios", RuntimeVersion: "2.0"}, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			updates, err := svc.ListUpdates(ctx, tc.filter)
			if err != nil {
				t.Fatalf("ListUpdates: %v", err)
			}
			if len(updates) != tc.want {
				t.Fatalf("ListUpdates(%+v) = %d releases, want %d", tc.filter, len(updates), tc.want)
			}
		})
	}
}

func TestPublish_UnknownIDReturnsErrNotFound(t *testing.T) {
	svc := testService(t)
	_, err := svc.Publish(context.Background(), "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("Publish on unknown id = %v, want ErrNotFound", err)
	}
}

func TestList_ReturnsAllReleasesRegardlessOfPublishState(t *testing.T) {
	svc := testService(t)
	ctx := context.Background()

	if _, err := svc.Create(ctx, validInput([]byte("v1"))); err != nil {
		t.Fatalf("Create: %v", err)
	}
	rel2, err := svc.Create(ctx, validInput([]byte("v2")))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := svc.Publish(ctx, rel2.ID); err != nil {
		t.Fatalf("Publish: %v", err)
	}

	list, err := svc.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("List = %d releases, want 2", len(list))
	}
}
