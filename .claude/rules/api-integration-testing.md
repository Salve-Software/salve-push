# API integration testing (black box, real stack)

Applies to HTTP routes in `server/internal/api`.

## Rule

- Every route MUST have tests written using `.claude/skills/black-box-test/SKILL.md`
  as the checklist: treat the handler as a black box, assert only on the
  observable contract (HTTP status, response body, relevant headers), never
  on internal calls, mocks-as-spies, or implementation details.
- Unlike that skill's default (call the handler function directly,
  in-process), this project's API tests exercise the **real running stack**:
  `docker compose up` (server + Postgres + storage backend), driven by a
  real HTTP client, so the test simulates an actual user/client end to end
  — real JSON over the wire, real database, real storage — not a Go
  function call.
- Live under `server/test/api/` as a separate Go module-internal package
  built with the `integration` build tag (`//go:build integration`), so
  `go test ./...` stays Docker-free and fast; `go test -tags integration ./test/api/...`
  (run against `docker compose up -d`) is a distinct, explicit step, wired
  into CI as its own job.
- Cover the black-box skill's full checklist per route: happy path,
  missing/null/wrong-type/extra fields, boundary and malicious payloads,
  and confirm error responses never leak internals (stack traces, SQL,
  file paths, secrets) — see "Casos de Erro" and "Segurança" sections of
  the skill.
- Table-driven per route (one table entry per client profile from the
  skill: correto, incompleto, confuso, mal integrado, extremo,
  mal-intencionado), named after the observed behavior
  (`TestCreateRelease_Returns400WhenBundleHashIsMissing`), never after the
  internal call path.
