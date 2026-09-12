//go:build integration

// Black-box HTTP tests against a real running salve-push-server (docker compose), per .claude/rules/api-integration-testing.md.
package api_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"testing"
)

func baseURL() string {
	if v := os.Getenv("SALVE_PUSH_TEST_SERVER_URL"); v != "" {
		return v
	}
	return "http://localhost:8080"
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

type multipartField struct {
	name  string
	value string
}

func doCreateRelease(t *testing.T, fields []multipartField, bundleFieldName string, bundle []byte) (*http.Response, []byte) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, f := range fields {
		if err := writer.WriteField(f.name, f.value); err != nil {
			t.Fatalf("WriteField(%s): %v", f.name, err)
		}
	}
	if bundleFieldName != "" {
		part, err := writer.CreateFormFile(bundleFieldName, "bundle.js")
		if err != nil {
			t.Fatalf("CreateFormFile: %v", err)
		}
		if _, err := part.Write(bundle); err != nil {
			t.Fatalf("write bundle: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, baseURL()+"/v1/releases", &body)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	return do(t, req)
}

func doRawPost(t *testing.T, path, contentType string, body []byte) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, baseURL()+path, bytes.NewReader(body))
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	return do(t, req)
}

func doGet(t *testing.T, path string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, baseURL()+path, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	return do(t, req)
}

func doPost(t *testing.T, path string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, baseURL()+path, nil)
	if err != nil {
		t.Fatalf("NewRequest: %v", err)
	}
	return do(t, req)
}

func do(t *testing.T, req *http.Request) (*http.Response, []byte) {
	t.Helper()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", req.Method, req.URL, err)
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}
	return resp, body
}

func validCreateFields(bundleHash string, overrides map[string]string) []multipartField {
	base := map[string]string{
		"version":            "1.0.0",
		"platform":           "ios",
		"channel":            "production",
		"runtime_version":    "1.0",
		"bundle_hash":        bundleHash,
		"signature":          "test-signature",
		"rollout_percentage": "100",
	}
	for k, v := range overrides {
		base[k] = v
	}
	fields := make([]multipartField, 0, len(base))
	for _, name := range []string{"version", "platform", "channel", "runtime_version", "bundle_hash", "signature", "rollout_percentage"} {
		if v, ok := base[name]; ok {
			fields = append(fields, multipartField{name: name, value: v})
		}
	}
	return fields
}
