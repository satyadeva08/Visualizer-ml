// =============================================================================
// VISUALISER — handlers/collect.go   (DEVELOPMENT / DATA-COLLECTION ONLY)
//
// POST /api/v1/collect        fields: video, label, session  -> saved by Python
// GET  /api/v1/collect/stats  -> clips per label
//
// Both return 404 unless ENABLE_COLLECT=1. They exist so the training data is
// recorded through the SAME camera path as the demo (same browser, codec and
// framing), which matters a lot for the quality of the model.
// =============================================================================

package handlers

import (
	"net/http"
	"regexp"
	"strings"
)

var (
	collectLabelRe   = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,31}$`)
	collectSessionRe = regexp.MustCompile(`^[a-z0-9]{1,16}$`)
)

func (h *Handler) Collect(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.CollectEnabled {
		http.NotFound(w, r)
		return
	}
	up, ok := h.readUpload(w, r)
	if !ok {
		return
	}
	defer up.Close()

	label := strings.ToUpper(strings.TrimSpace(r.FormValue("label")))
	session := strings.ToLower(strings.TrimSpace(r.FormValue("session")))
	if !collectLabelRe.MatchString(label) {
		writeError(w, http.StatusBadRequest, "label must be A-Z, 0-9 or _ (max 32)", "INVALID_LABEL")
		return
	}
	if !collectSessionRe.MatchString(session) {
		writeError(w, http.StatusBadRequest, "session must be a-z or 0-9 (max 16)", "INVALID_SESSION")
		return
	}

	rep, err := h.postFile(r.Context(), "/collect", up.Path, up.Name,
		map[string]string{"label": label, "session": session})
	if err != nil {
		mlTransportError(w, err)
		return
	}
	if rep.Status != http.StatusOK {
		forwardMLError(w, rep)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(rep.Body)
}

func (h *Handler) CollectStats(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.CollectEnabled {
		http.NotFound(w, r)
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, h.cfg.MLServiceURL+"/collect/stats", nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Could not build request", "INTERNAL_ERROR")
		return
	}
	rep, err := h.do(req)
	if err != nil {
		mlTransportError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(rep.Status)
	_, _ = w.Write(rep.Body)
}
