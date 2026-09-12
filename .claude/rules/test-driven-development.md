# Test-driven development

Applies to `server/` (Go) and `packages/*` (TypeScript) in this repo.

## Rule

- No production code without a failing test written first. Write the test,
  watch it fail for the right reason, then write the minimum code to pass
  it, then refactor.
- Every exported function/method with a decision branch, error path, or
  edge case gets a test case for each branch — not just the happy path.
  Table-driven tests (Go) / `describe`+`it` tables (TS) are the default
  shape once there are 2+ cases for the same function.
- A bug fix always starts with a regression test that reproduces the bug
  and fails before the fix.
- No PR/commit adds a new package or service method without a
  corresponding `_test.go` (Go) or `*.test.ts` (TS) landing in the same
  change. New or changed HTTP routes follow `api-integration-testing.md`
  instead — real black-box tests against the running stack, not unit
  tests of the handler function.
- Integration tests that need real infrastructure (Postgres, S3) MUST be
  gated behind an environment variable (e.g. `TEST_DATABASE_URL`) and
  `t.Skip()` cleanly when it's unset, so `go test ./...` stays runnable
  without external services. CI provides the real services and unsets
  nothing — integration tests MUST actually run there.
- Tests are the place for comments explaining *why* a behavior exists or
  *why* an edge case matters (see `go-comments.md`) — write the test name
  and body to carry that explanation, not a comment beside the
  implementation.

## Non-negotiables

- Never mark a task done with untested new logic to "come back to it
  later" — the test is part of the task, not a follow-up.
- Never delete or weaken a test to make a change pass; fix the code or
  prove the test was wrong and replace it with a correct one.
- Flaky or environment-dependent tests get fixed or removed, never
  silenced with retries/sleeps as a first resort.
