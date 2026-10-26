// =============================================================================
// VISUALISER — handlers/handlers.go
// Handler factory, shared config, JSON helpers, and the ML-service client.
// =============================================================================

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// Config holds all tunable parameters. main.go fills it from environment variables.
type Config struct {
	MLServiceURL     string        // e.g. http://127.0.0.1:5000
	MaxUploadBytes   int64         // maximum accepted video size
	MLRequestTimeout time.Duration // how long we wait for Python
	CollectEnabled   bool          // dev-only dataset collection endpoints
}

type Handler struct {
	cfg        Config
	httpClient *http.Client
}

func New(cfg Config) *Handler {
	return &Handler{cfg: cfg, httpClient: &http.Client{Timeout: cfg.MLRequestTimeout}}
}

// --- JSON helpers -----------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// errorResponse is the one error shape used by every endpoint.
type errorResponse struct {
	Error string `json:"error"` // human-readable, safe to show to the user
	Code  string `json:"code"`  // stable machine-readable code
}

func writeError(w http.ResponseWriter, status int, message, code string) {
	writeJSON(w, status, errorResponse{Error: message, Code: code})
}

// --- ML service client ------------------------------------------------------

// mlReply is a raw answer from the Python service.
type mlReply struct {
	Status int
	Body   []byte
}

// mlError converts a transport-level failure into an HTTP answer for the client.
// Internal details (addresses, stack traces) are logged, never returned.
func mlTransportError(w http.ResponseWriter, err error) {
	var ne net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &ne) && ne.Timeout()) {
		writeError(w, http.StatusGatewayTimeout,
			"The recognition service took too long. Try a shorter clip.", "ML_TIMEOUT")
		return
	}
	var op *net.OpError
	msg := strings.ToLower(err.Error())
	if (errors.As(err, &op) && op.Op == "dial") ||
		strings.Contains(msg, "connection refused") || strings.Contains(msg, "actively refused") {
		writeError(w, http.StatusServiceUnavailable,
			"The recognition service is not running.", "ML_UNREACHABLE")
		return
	}
	writeError(w, http.StatusBadGateway, "The recognition service failed.", "ML_ERROR")
}

// forwardMLError relays a non-200 answer from Python. Its 4xx/503 messages are
// written to be user-safe; any 5xx is replaced by a generic message.
func forwardMLError(w http.ResponseWriter, rep *mlReply) {
	var e errorResponse
	_ = json.Unmarshal(rep.Body, &e)
	if rep.Status >= 400 && rep.Status < 500 || rep.Status == http.StatusServiceUnavailable {
		if e.Error == "" {
			e.Error = "The recognition service rejected the request."
		}
		if e.Code == "" {
			e.Code = "ML_REJECTED"
		}
		writeError(w, rep.Status, e.Error, e.Code)
		return
	}
	writeError(w, http.StatusBadGateway, "The recognition service failed.", "ML_ERROR")
}

// postFile sends the saved file (plus optional text fields) to Python as multipart.
func (h *Handler) postFile(ctx context.Context, endpoint, filePath, fileName string, fields map[string]string) (*mlReply, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open temp file: %w", err)
	}
	defer f.Close()

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		if err := mw.WriteField(k, v); err != nil {
			return nil, err
		}
	}
	fw, err := mw.CreateFormFile("video", fileName)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(fw, f); err != nil {
		return nil, err
	}
	mw.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.cfg.MLServiceURL+endpoint, &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return h.do(req)
}

func (h *Handler) do(req *http.Request) (*mlReply, error) {
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // at most 1 MB back
	if err != nil {
		return nil, err
	}
	return &mlReply{Status: resp.StatusCode, Body: b}, nil
}
