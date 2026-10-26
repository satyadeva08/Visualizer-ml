// =============================================================================
// VISUALISER — models/models.go
// JSON shapes shared by the Go API. The Python ML service must return JSON that
// decodes into MLResult. Full specification: docs/API_CONTRACT.md
// =============================================================================

package models

// RecognizeResponse is what POST /api/v1/recognize returns to the frontend.
type RecognizeResponse struct {
	JobID  string    `json:"job_id"`
	Status string    `json:"status"` // always "completed" on HTTP 200 (synchronous API)
	Result *MLResult `json:"result,omitempty"`
}

// MLResult is the parsed response of the ML service's POST /predict.
type MLResult struct {
	// Signs is the recognised sign(s). EMPTY when the sign is unknown.
	Signs []Sign `json:"signs"`

	// Text is the grounded text built from Signs ("" when nothing recognised).
	Text string `json:"text"`

	// TextMethod says how Text was made: single_sign | template | fallback_list | none.
	TextMethod string `json:"text_method"`

	// Emphasis lists words that come from recognised signs (used by the typography).
	Emphasis []string `json:"emphasis"`

	// Outcome is "recognized" or "unknown_sign".
	Outcome string `json:"outcome"`

	// Reason explains an unknown_sign outcome: LOW_CONFIDENCE | NO_KNOWN_SIGN.
	Reason *string `json:"reason"`

	// Alternatives are the model's top candidates (scores are model probabilities,
	// not accuracy).
	Alternatives []Sign `json:"alternatives"`

	// Timings are real measurements taken inside the ML service (milliseconds).
	Timings map[string]float64 `json:"timings"`

	// ProcessingTimeMS is the total time spent inside the ML service.
	ProcessingTimeMS *int64 `json:"processing_time_ms,omitempty"`

	// BackendTotalMS is the time Go spent on the whole request (upload + ML call).
	BackendTotalMS int64 `json:"backend_total_ms"`

	// IsMock is true ONLY when the ML service ran in explicit mock mode. The
	// frontend must then show "MOCK / DEMO RESULT".
	IsMock bool `json:"is_mock"`
}

// Sign is one recognised (or candidate) sign.
type Sign struct {
	Label string `json:"label"`
	// Confidence is the classifier's probability for this label, or null when no
	// meaningful score exists. It is a model score, NOT a measured accuracy.
	Confidence *float64 `json:"confidence"`
}

// ComposeRequest / ComposeResponse: POST /api/v1/compose (sign sequence -> text).
type ComposeRequest struct {
	Labels []string `json:"labels"`
}

type ComposeResponse struct {
	Text       string   `json:"text"`
	TextMethod string   `json:"text_method"`
	Emphasis   []string `json:"emphasis"`
}
