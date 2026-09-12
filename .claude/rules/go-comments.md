# Go comment policy

Applies to every `.go` file in `server/`.

## Rule

- At most **one** comment per source file: a single-line (or short
  paragraph) comment at the very top explaining what the file is for.
  No `godoc`-style comments on every exported type/func, no inline
  narration, no `// TODO` sprinkled through logic.
- Code MUST be self-explanatory through naming and structure instead of
  comments explaining what it does. If a line needs a comment to be
  understood, rewrite the line/function, don't caption it.
- Exception: a `//go:generate`, `//go:embed`, or similar build directive
  is not a comment for this rule's purposes — keep those.
- Non-obvious business rules, edge cases, and *why* decisions (not *what*
  the code does) belong in the corresponding `_test.go` file as test
  names/table cases and short comments there — tests are the executable,
  checked documentation. If a behavior is subtle enough to deserve
  explanation, it's subtle enough to deserve a test proving it.

## Rationale

Comments in source drift from the code they describe and nobody notices
until it's wrong. A test that names the behavior (`TestCreate_RejectsBundleHashMismatch`)
can't drift silently — it fails the moment the described behavior breaks.

## Example

Bad:

```go
// Service implements the releases domain against a Postgres store and a
// pluggable bundle Storage backend.
type Service struct { ... }

// Create validates the uploaded bundle's hash, persists it to storage and
// records the release as unpublished.
func (s *Service) Create(ctx context.Context, in CreateInput) (*Release, error) {
	// MVP: buffer the bundle in memory to compute its hash and size before
	// handing it to storage.
	buf, err := io.ReadAll(in.Bundle)
	...
}
```

Good:

```go
// Package releases implements creation, publishing and lookup of OTA releases.
package releases

type Service struct { ... }

func (s *Service) Create(ctx context.Context, in CreateInput) (*Release, error) {
	buf, err := io.ReadAll(in.Bundle)
	...
}
```

with `releases_test.go` carrying:

```go
func TestCreate_RejectsBundleHashMismatch(t *testing.T) { ... }
func TestCreate_BuffersBundleInMemoryBeforeHashing(t *testing.T) { ... }
```
