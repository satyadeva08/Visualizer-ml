// =============================================================================
// VISUALISER — handlers/recognize.go
// POST /api/v1/recognize   (synchronous: upload -> Python -> JSON)
//
// A job queue was deliberately NOT built: with short clips Python answers in
// about a second, so one request/response is simpler and easier to explain.
//
// Error codes: INVALID_REQUEST, EMPTY_FILE, FILE_TOO_LARGE, UNSUPPORTED_FORMAT,
// ML_TIMEOUT, ML_UNREACHABLE, ML_ERROR, INTERNAL_ERROR, plus the codes relayed
// from Python (NO_SIGN_DETECTED, CLIP_TOO_SHORT, INVALID_VIDEO,
// MODEL_NOT_TRAINED, FFMPEG_MISSING ...).
// =============================================================================

package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"visualiser/backend/models"
)

func (h *Handler) Recognize(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	up, ok := h.readUpload(w, r)
	if !ok {
		return
	}
	defer up.Close()

	rep, err := h.postFile(r.Context(), "/predict", up.Path, up.Name, nil)
	if err != nil {
		mlTransportError(w, err)
		return
	}
	if rep.Status != http.StatusOK {
		forwardMLError(w, rep)
		return
	}

	var result models.MLResult
	if err := json.Unmarshal(rep.Body, &result); err != nil {
		writeError(w, http.StatusBadGateway, "The recognition service returned an invalid answer.", "ML_ERROR")
		return
	}
	result.BackendTotalMS = time.Since(start).Milliseconds()

	writeJSON(w, http.StatusOK, models.RecognizeResponse{
		JobID:  fmt.Sprintf("job-%d", time.Now().UnixNano()),
		Status: "completed",
		Result: &result,
	})
}
