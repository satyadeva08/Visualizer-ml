// =============================================================================
// VISUALISER — handlers/compose.go
// POST /api/v1/compose  {"labels": ["I","WANT","WATER"]} -> grounded text
// Lets the UI build a sentence from several single-sign clips.
// =============================================================================

package handlers

import (
	"encoding/json"
	"net/http"
	"regexp"

	"visualiser/backend/models"
)

var labelPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_ ]{0,39}$`)

func (h *Handler) Compose(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
	var req models.ComposeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Body must be JSON: {\"labels\": [...]}", "INVALID_REQUEST")
		return
	}
	if len(req.Labels) == 0 || len(req.Labels) > 12 {
		writeError(w, http.StatusBadRequest, "Provide between 1 and 12 labels", "INVALID_REQUEST")
		return
	}
	for _, l := range req.Labels {
		if !labelPattern.MatchString(l) {
			writeError(w, http.StatusBadRequest, "Invalid label: "+l, "INVALID_REQUEST")
			return
		}
	}

	payload, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(r.Context(), http.MethodPost,
		h.cfg.MLServiceURL+"/generate", bytesReader(payload))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not build request", "INTERNAL_ERROR")
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	rep, err := h.do(httpReq)
	if err != nil {
		mlTransportError(w, err)
		return
	}
	if rep.Status != http.StatusOK {
		forwardMLError(w, rep)
		return
	}
	var out models.ComposeResponse
	if err := json.Unmarshal(rep.Body, &out); err != nil {
		writeError(w, http.StatusBadGateway, "The recognition service returned an invalid answer.", "ML_ERROR")
		return
	}
	writeJSON(w, http.StatusOK, out)
}
