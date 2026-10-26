// =============================================================================
// VISUALISER — handlers/health.go
// GET /api/v1/health
//   200 — backend and ML service reachable (model info included)
//   503 — backend up, ML service unreachable ("degraded")
// =============================================================================

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

type healthResponse struct {
	Status         string          `json:"status"`  // "ok" | "degraded"
	Backend        string          `json:"backend"` // always "ok" if this code runs
	MLService      mlServiceStatus `json:"ml_service"`
	CollectEnabled bool            `json:"collect_enabled"`
	Timestamp      string          `json:"timestamp"`
}

type mlServiceStatus struct {
	Status  string          `json:"status"` // "ok" | "unreachable"
	Message string          `json:"message,omitempty"`
	Model   json.RawMessage `json:"model,omitempty"` // mode, labels, ... straight from Python
}

func bytesReader(b []byte) io.Reader { return bytes.NewReader(b) }

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	ml := h.checkMLService(r.Context())
	overall, code := "ok", http.StatusOK
	if ml.Status != "ok" {
		overall, code = "degraded", http.StatusServiceUnavailable
	}
	writeJSON(w, code, healthResponse{
		Status: overall, Backend: "ok", MLService: ml,
		CollectEnabled: h.cfg.CollectEnabled,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *Handler) checkMLService(ctx context.Context) mlServiceStatus {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.cfg.MLServiceURL+"/health", nil)
	if err != nil {
		return mlServiceStatus{Status: "unreachable", Message: "could not build request"}
	}
	rep, err := h.do(req)
	if err != nil {
		return mlServiceStatus{Status: "unreachable", Message: "ML service is not reachable"}
	}
	if rep.Status != http.StatusOK {
		return mlServiceStatus{Status: "unreachable", Message: "ML service is unhealthy"}
	}
	var body struct {
		Model json.RawMessage `json:"model"`
	}
	_ = json.Unmarshal(rep.Body, &body)
	return mlServiceStatus{Status: "ok", Model: body.Model}
}
