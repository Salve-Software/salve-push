//go:build integration

package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func channelFor(t *testing.T) string {
	t.Helper()
	return "test-" + strings.ToLower(strings.Map(func(r rune) rune {
		if r == '/' || r == ' ' {
			return '-'
		}
		return r
	}, t.Name()))
}

func TestCreateRelease_ReturnsCreatedReleaseWithBundleStored(t *testing.T) {
	bundle := []byte("console.log('happy path');")
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel": channelFor(t),
		"version": "1.0.0",
	})

	resp, body := doCreateRelease(t, fields, "bundle", bundle)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body = %s", resp.StatusCode, body)
	}

	var created map[string]any
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("response is not valid JSON: %v; body = %s", err, body)
	}
	if created["id"] == "" || created["id"] == nil {
		t.Fatalf("response has no id: %s", body)
	}
	if created["version"] != "1.0.0" {
		t.Fatalf("version = %v, want 1.0.0", created["version"])
	}
	if _, leaked := created["bundle"]; leaked {
		t.Fatalf("response echoes the raw bundle field back: %s", body)
	}
}

func TestCreateRelease_RejectsBundleHashMismatch(t *testing.T) {
	bundle := []byte("console.log('tampered');")
	fields := validCreateFields(sha256Hex([]byte("not the real bundle")), map[string]string{
		"channel": channelFor(t),
	})

	resp, body := doCreateRelease(t, fields, "bundle", bundle)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body = %s", resp.StatusCode, body)
	}
	assertNoInternalLeakage(t, body)
}

func TestCreateRelease_MissingRequiredFields(t *testing.T) {
	bundle := []byte("x")
	requiredFields := []string{"version", "platform", "channel", "runtime_version", "bundle_hash", "signature"}

	for _, missing := range requiredFields {
		t.Run("missing_"+missing, func(t *testing.T) {
			overrides := map[string]string{"channel": channelFor(t)}
			fields := validCreateFields(sha256Hex(bundle), overrides)
			filtered := fields[:0]
			for _, f := range fields {
				if f.name != missing {
					filtered = append(filtered, f)
				}
			}
			resp, body := doCreateRelease(t, filtered, "bundle", bundle)
			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 when %q is missing; body = %s", resp.StatusCode, missing, body)
			}
			assertNoInternalLeakage(t, body)
		})
	}
}

func TestCreateRelease_MissingBundleFile(t *testing.T) {
	fields := validCreateFields(sha256Hex([]byte("x")), map[string]string{"channel": channelFor(t)})
	resp, body := doCreateRelease(t, fields, "", nil)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 when bundle file is missing; body = %s", resp.StatusCode, body)
	}
}

func TestCreateRelease_EmptyStringFieldsAreRejectedLikeMissingOnes(t *testing.T) {
	bundle := []byte("x")
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel": "",
	})
	resp, body := doCreateRelease(t, fields, "bundle", bundle)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for empty channel; body = %s", resp.StatusCode, body)
	}
}

func TestCreateRelease_RolloutPercentageOutOfRange(t *testing.T) {
	bundle := []byte("x")
	cases := []string{"-1", "101", "not-a-number", "1e10", "100.5"}
	for _, rollout := range cases {
		t.Run(rollout, func(t *testing.T) {
			fields := validCreateFields(sha256Hex(bundle), map[string]string{
				"channel":            channelFor(t),
				"rollout_percentage": rollout,
			})
			resp, body := doCreateRelease(t, fields, "bundle", bundle)
			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("rollout_percentage=%q: status = %d, want 400; body = %s", rollout, resp.StatusCode, body)
			}
		})
	}
}

func TestCreateRelease_AcceptsUnicodeAndSpecialCharactersInVersion(t *testing.T) {
	bundle := []byte("x")
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel": channelFor(t),
		"version": "1.0.0-héllo-🚀-<script>alert(1)</script>",
	})
	resp, body := doCreateRelease(t, fields, "bundle", bundle)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201 for unicode version; body = %s", resp.StatusCode, body)
	}
}

func TestCreateRelease_SqlLikeChannelIsStoredLiterallyNotExecuted(t *testing.T) {
	bundle := []byte("x")
	maliciousChannel := "production'; DROP TABLE releases; --"
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel": maliciousChannel,
	})
	resp, body := doCreateRelease(t, fields, "bundle", bundle)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body = %s", resp.StatusCode, body)
	}

	// If the table had actually been dropped, every subsequent request in this
	// suite would start failing with 500s. Confirm the server is still healthy.
	healthResp, healthBody := doGet(t, "/health")
	if healthResp.StatusCode != http.StatusOK {
		t.Fatalf("server unhealthy after SQL-like channel input: %d %s", healthResp.StatusCode, healthBody)
	}
}

func TestCreateRelease_IgnoresClientSuppliedIdAndTimestampFields(t *testing.T) {
	bundle := []byte("x")
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel": channelFor(t),
	})
	fields = append(fields,
		multipartField{name: "id", value: "attacker-chosen-id"},
		multipartField{name: "created_at", value: "1970-01-01T00:00:00Z"},
	)

	resp, body := doCreateRelease(t, fields, "bundle", bundle)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body = %s", resp.StatusCode, body)
	}
	var created map[string]any
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if created["id"] == "attacker-chosen-id" {
		t.Fatalf("server accepted client-supplied id: %s", body)
	}
}

func TestGetRelease_UnknownIdReturns404(t *testing.T) {
	resp, body := doGet(t, "/v1/releases/00000000-0000-0000-0000-000000000000")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body = %s", resp.StatusCode, body)
	}
	assertNoInternalLeakage(t, body)
}

func TestGetRelease_MalformedIdDoesNotCrashTheServer(t *testing.T) {
	ids := []string{
		"not-a-uuid",
		"' OR '1'='1",
		strings.Repeat("a", 5000),
		"../../etc/passwd",
	}
	for _, id := range ids {
		t.Run(id[:min(20, len(id))], func(t *testing.T) {
			resp, body := doGet(t, "/v1/releases/"+id)
			if resp.StatusCode >= 500 {
				t.Fatalf("id=%q crashed the server: %d %s", id, resp.StatusCode, body)
			}
			assertNoInternalLeakage(t, body)
		})
	}
}

func TestPublishRelease_UnknownIdReturns404(t *testing.T) {
	resp, body := doPost(t, "/v1/releases/00000000-0000-0000-0000-000000000000/publish")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body = %s", resp.StatusCode, body)
	}
}

func TestPublishRelease_IsIdempotentWhenCalledTwice(t *testing.T) {
	bundle := []byte("idempotent bundle")
	fields := validCreateFields(sha256Hex(bundle), map[string]string{"channel": channelFor(t)})
	createResp, createBody := doCreateRelease(t, fields, "bundle", bundle)
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup: create failed: %d %s", createResp.StatusCode, createBody)
	}
	var created map[string]any
	json.Unmarshal(createBody, &created)
	id := created["id"].(string)

	first, firstBody := doPost(t, "/v1/releases/"+id+"/publish")
	if first.StatusCode != http.StatusOK {
		t.Fatalf("first publish: %d %s", first.StatusCode, firstBody)
	}
	second, secondBody := doPost(t, "/v1/releases/"+id+"/publish")
	if second.StatusCode != http.StatusOK {
		t.Fatalf("second publish: %d %s", second.StatusCode, secondBody)
	}
}

func TestListReleases_IncludesACreatedRelease(t *testing.T) {
	bundle := []byte("list me")
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel": channelFor(t),
		"version": "7.7.7",
	})
	createResp, createBody := doCreateRelease(t, fields, "bundle", bundle)
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup: create failed: %d %s", createResp.StatusCode, createBody)
	}
	var created map[string]any
	json.Unmarshal(createBody, &created)
	id := created["id"].(string)

	resp, body := doGet(t, "/v1/releases")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.StatusCode, body)
	}
	var list []map[string]any
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatalf("invalid JSON array: %v; body = %s", err, body)
	}
	found := false
	for _, rel := range list {
		if rel["id"] == id {
			found = true
		}
	}
	if !found {
		t.Fatalf("created release %s not present in GET /v1/releases", id)
	}
}

func assertNoInternalLeakage(t *testing.T, body []byte) {
	t.Helper()
	text := strings.ToLower(string(body))
	forbidden := []string{"goroutine", ".go:", "panic", "sql:", "pq:", "postgres://", "/users/", "/home/", "/root/"}
	for _, marker := range forbidden {
		if strings.Contains(text, marker) {
			t.Fatalf("error response leaks internal details (found %q): %s", marker, body)
		}
	}
}
