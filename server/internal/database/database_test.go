package database

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"testing/fstest"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	db, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestMigrate_CreatesTablesFromEmbeddedSQL(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	fs := fstest.MapFS{
		"0001_test_table.sql": {Data: []byte(`CREATE TABLE IF NOT EXISTS migrate_test_table (id INT PRIMARY KEY)`)},
	}

	if err := Migrate(ctx, db, fs); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	defer db.ExecContext(ctx, `DROP TABLE IF EXISTS migrate_test_table`)

	if _, err := db.ExecContext(ctx, `INSERT INTO migrate_test_table (id) VALUES (1)`); err != nil {
		t.Fatalf("table from migration is not usable: %v", err)
	}
}

func TestMigrate_IsIdempotent(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	fs := fstest.MapFS{
		"0001_idempotent.sql": {Data: []byte(`CREATE TABLE IF NOT EXISTS migrate_idempotent_table (id INT PRIMARY KEY)`)},
	}
	defer db.ExecContext(ctx, `DROP TABLE IF EXISTS migrate_idempotent_table`)

	if err := Migrate(ctx, db, fs); err != nil {
		t.Fatalf("first Migrate: %v", err)
	}
	if err := Migrate(ctx, db, fs); err != nil {
		t.Fatalf("second Migrate: %v", err)
	}
}
