//go:build integration

package api_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
)

func publishedRelease(t *testing.T, channel, platform, runtimeVersion, version string, bundle []byte) string {
	t.Helper()
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel":         channel,
		"platform":        platform,
		"runtime_version": runtimeVersion,
		"version":         version,
	})
	createResp, createBody := doCreateRelease(t, fields, "bundle", bundle)
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup: create failed: %d %s", createResp.StatusCode, createBody)
	}
	var created map[string]any
	if err := json.Unmarshal(createBody, &created); err != nil {
		t.Fatalf("setup: invalid JSON: %v", err)
	}
	id := created["id"].(string)

	publishResp, publishBody := doPost(t, "/v1/releases/"+id+"/publish")
	if publishResp.StatusCode != http.StatusOK {
		t.Fatalf("setup: publish failed: %d %s", publishResp.StatusCode, publishBody)
	}
	return id
}

func TestListUpdates_ReturnsPublishedReleaseMatchingFilters(t *testing.T) {
	channel := channelFor(t)
	bundle := []byte("update bundle")
	id := publishedRelease(t, channel, "ios", "2.0", "3.0.0", bundle)

	resp, body := doGet(t, "/v1/updates?"+url.Values{
		"channel": {channel}, "platform": {"ios"}, "runtime_version": {"2.0"},
	}.Encode())
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.StatusCode, body)
	}
	var list []map[string]any
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatalf("invalid JSON: %v; body = %s", err, body)
	}
	if len(list) != 1 || list[0]["id"] != id {
		t.Fatalf("updates = %v, want exactly [%s]", list, id)
	}
}

func TestListUpdates_ExcludesReleasesForOtherPlatformsOrRuntimeVersions(t *testing.T) {
	channel := channelFor(t)
	bundle := []byte("update bundle")
	publishedRelease(t, channel, "ios", "2.0", "3.0.0", bundle)

	cases := []struct {
		name     string
		platform string
		runtime  string
	}{
		{"wrong platform", "android", "2.0"},
		{"wrong runtime", "ios", "9.9"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := doGet(t, "/v1/updates?"+url.Values{
				"channel": {channel}, "platform": {tc.platform}, "runtime_version": {tc.runtime},
			}.Encode())
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("status = %d, want 200; body = %s", resp.StatusCode, body)
			}
			var list []map[string]any
			json.Unmarshal(body, &list)
			if len(list) != 0 {
				t.Fatalf("updates = %v, want empty", list)
			}
		})
	}
}

func TestListUpdates_MissingRequiredQueryParamsReturns400(t *testing.T) {
	cases := []string{
		"?platform=ios&runtime_version=1.0",
		"?channel=production&runtime_version=1.0",
		"?channel=production&platform=ios",
		"",
	}
	for _, qs := range cases {
		t.Run(qs, func(t *testing.T) {
			resp, body := doGet(t, "/v1/updates"+qs)
			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("query=%q: status = %d, want 400; body = %s", qs, resp.StatusCode, body)
			}
			assertNoInternalLeakage(t, body)
		})
	}
}

func TestListUpdates_UnpublishedReleaseIsNeverOffered(t *testing.T) {
	channel := channelFor(t)
	bundle := []byte("never published")
	fields := validCreateFields(sha256Hex(bundle), map[string]string{
		"channel": channel, "platform": "ios", "runtime_version": "5.0",
	})
	createResp, createBody := doCreateRelease(t, fields, "bundle", bundle)
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("setup: create failed: %d %s", createResp.StatusCode, createBody)
	}

	resp, body := doGet(t, "/v1/updates?"+url.Values{
		"channel": {channel}, "platform": {"ios"}, "runtime_version": {"5.0"},
	}.Encode())
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.StatusCode, body)
	}
	var list []map[string]any
	json.Unmarshal(body, &list)
	if len(list) != 0 {
		t.Fatalf("unpublished release was offered as an update: %v", list)
	}
}

func TestGetUpdate_UnknownIdReturns404(t *testing.T) {
	resp, body := doGet(t, "/v1/updates/00000000-0000-0000-0000-000000000000")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body = %s", resp.StatusCode, body)
	}
	assertNoInternalLeakage(t, body)
}

func TestDownloadBundle_ReturnsExactBytesWithMatchingHashHeader(t *testing.T) {
	channel := channelFor(t)
	bundle := []byte("exact bytes please")
	id := publishedRelease(t, channel, "android", "3.0", "4.4.4", bundle)

	resp, body := doGet(t, "/v1/updates/"+id+"/bundle")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", resp.StatusCode, body)
	}
	if string(body) != string(bundle) {
		t.Fatalf("downloaded bytes = %q, want %q", body, bundle)
	}
	if got, want := resp.Header.Get("X-Salve-Push-Bundle-Hash"), sha256Hex(bundle); got != want {
		t.Fatalf("X-Salve-Push-Bundle-Hash = %q, want %q", got, want)
	}
}

func TestDownloadBundle_UnknownIdReturns404(t *testing.T) {
	resp, body := doGet(t, "/v1/updates/00000000-0000-0000-0000-000000000000/bundle")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body = %s", resp.StatusCode, body)
	}
	assertNoInternalLeakage(t, body)
}

func TestTelemetry_RespondsNotImplementedWithoutCrashing(t *testing.T) {
	resp, body := doRawPost(t, "/v1/telemetry", "application/json", []byte(`{"type":"update_check"}`))
	if resp.StatusCode != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501 (telemetry not implemented yet); body = %s", resp.StatusCode, body)
	}
	assertNoInternalLeakage(t, body)
}
