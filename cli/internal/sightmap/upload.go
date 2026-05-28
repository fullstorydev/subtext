package sightmap

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// Upload POSTs payload to the sightmap upload URL (which carries a single-use
// nonce in its token query param). Returns the component count the server
// acknowledged, or an error that includes the server's response body.
func Upload(ctx context.Context, uploadURL string, p Payload) (int, error) {
	body, err := json.Marshal(p)
	if err != nil {
		return 0, fmt.Errorf("sightmap: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("sightmap: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	c := httpClient(uploadURL)
	resp, err := c.Do(req)
	if err != nil {
		return 0, fmt.Errorf("sightmap: upload: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, fmt.Errorf("upload failed (%d): %s", resp.StatusCode, bytes.TrimSpace(respBody))
	}

	var result struct {
		Components int `json:"components"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return 0, fmt.Errorf("sightmap: parse response: %w", err)
	}
	return result.Components, nil
}

// httpClient returns an http.Client that relaxes TLS verification for local
// dev hostnames (.test, localhost, 127.0.0.1) to match the Python script's
// behaviour and the local dev server at api.fullstory.test.
func httpClient(rawURL string) *http.Client {
	c := &http.Client{Timeout: 30 * time.Second}
	if isLocalHost(rawURL) {
		c.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
		}
	}
	return c
}

func isLocalHost(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	h := u.Hostname()
	return h == "localhost" || h == "127.0.0.1" || len(h) > 5 && h[len(h)-5:] == ".test"
}
