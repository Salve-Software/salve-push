package storage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"testing"
)

func TestLocal_PutThenGetReturnsSameBytes(t *testing.T) {
	l, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocal: %v", err)
	}
	ctx := context.Background()
	want := []byte("bundle contents")

	if err := l.Put(ctx, "releases/1/bundle", bytes.NewReader(want)); err != nil {
		t.Fatalf("Put: %v", err)
	}

	r, err := l.Get(ctx, "releases/1/bundle")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	defer r.Close()

	got, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestLocal_ExistsReflectsPutAndDelete(t *testing.T) {
	l, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocal: %v", err)
	}
	ctx := context.Background()
	const key = "releases/2/bundle"

	if ok, err := l.Exists(ctx, key); err != nil || ok {
		t.Fatalf("Exists before Put = %v, %v; want false, nil", ok, err)
	}

	if err := l.Put(ctx, key, bytes.NewReader([]byte("x"))); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if ok, err := l.Exists(ctx, key); err != nil || !ok {
		t.Fatalf("Exists after Put = %v, %v; want true, nil", ok, err)
	}

	if err := l.Delete(ctx, key); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if ok, err := l.Exists(ctx, key); err != nil || ok {
		t.Fatalf("Exists after Delete = %v, %v; want false, nil", ok, err)
	}
}

func TestLocal_DeleteMissingKeyIsNotAnError(t *testing.T) {
	l, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocal: %v", err)
	}
	if err := l.Delete(context.Background(), "releases/missing/bundle"); err != nil {
		t.Fatalf("Delete on missing key returned error: %v", err)
	}
}

func TestLocal_GetMissingKeyReturnsNotExist(t *testing.T) {
	l, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocal: %v", err)
	}
	_, err = l.Get(context.Background(), "releases/missing/bundle")
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Get on missing key = %v, want os.ErrNotExist", err)
	}
}

func TestLocal_RejectsKeysEscapingBasePath(t *testing.T) {
	l, err := NewLocal(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocal: %v", err)
	}
	ctx := context.Background()

	if err := l.Put(ctx, "../escape", bytes.NewReader([]byte("x"))); err == nil {
		t.Fatal("Put with a path-traversing key succeeded, want error")
	}
	if _, err := l.Get(ctx, "../escape"); err == nil {
		t.Fatal("Get with a path-traversing key succeeded, want error")
	}
}
