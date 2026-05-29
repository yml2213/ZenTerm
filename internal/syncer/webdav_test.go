package syncer

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWebDAVProviderPutGetAndConflict(t *testing.T) {
	var stored []byte
	etag := `"v0"`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username, password, ok := r.BasicAuth()
		if !ok || username != "user" || password != "app-password" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		switch r.Method {
		case "MKCOL":
			w.WriteHeader(http.StatusCreated)
		case http.MethodHead:
			if stored == nil {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("ETag", etag)
			w.Header().Set("Content-Length", "7")
			w.WriteHeader(http.StatusOK)
		case http.MethodPut:
			if match := r.Header.Get("If-Match"); match != "" && match != etag {
				w.WriteHeader(http.StatusPreconditionFailed)
				return
			}
			payload, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read request body error = %v", err)
			}
			stored = payload
			etag = `"v1"`
			w.Header().Set("ETag", etag)
			w.WriteHeader(http.StatusCreated)
		case http.MethodGet:
			if stored == nil {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Header().Set("ETag", etag)
			_, _ = w.Write(stored)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer server.Close()

	provider, err := NewWebDAVProvider(WebDAVConfig{
		URL:        server.URL + "/dav/",
		Username:   "user",
		RemotePath: "/ZenTerm/zenterm-sync-v1.json",
	}, "app-password")
	if err != nil {
		t.Fatalf("NewWebDAVProvider() error = %v", err)
	}

	meta, err := provider.Stat(context.Background(), "/ZenTerm/zenterm-sync-v1.json")
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if meta.Exists {
		t.Fatal("Stat().Exists = true, want false")
	}

	meta, err = provider.Put(context.Background(), "/ZenTerm/zenterm-sync-v1.json", []byte("payload"), "")
	if err != nil {
		t.Fatalf("Put() error = %v", err)
	}
	if meta.ETag != `"v1"` {
		t.Fatalf("Put().ETag = %q, want %q", meta.ETag, `"v1"`)
	}

	body, meta, err := provider.Get(context.Background(), "/ZenTerm/zenterm-sync-v1.json")
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if string(body) != "payload" || meta.ETag != `"v1"` {
		t.Fatalf("Get() body = %q etag = %q, want payload and v1", string(body), meta.ETag)
	}

	_, err = provider.Put(context.Background(), "/ZenTerm/zenterm-sync-v1.json", []byte("next"), `"stale"`)
	if !errors.Is(err, ErrSyncConflict) {
		t.Fatalf("Put(stale) error = %v, want %v", err, ErrSyncConflict)
	}
}
