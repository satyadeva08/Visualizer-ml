// =============================================================================
// VISUALISER — handlers/middleware.go
// CORS allow-list, security headers, request logging.
//
// For phone testing the browser talks to the Vite server (same origin as the
// page) and Vite proxies /api to Go on localhost, so CORS is not even involved.
// The allow-list below only matters if the frontend is served from another
// origin; unknown origins get NO CORS headers.
// =============================================================================

package handlers

import (
	"log"
	"net/http"
	"strings"
	"time"
)

func CORS(allowed []string, next http.Handler) http.Handler {
	set := map[string]bool{}
	for _, o := range allowed {
		if o = strings.TrimSpace(o); o != "" {
			set[o] = true
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Add("Vary", "Origin")
		if origin := r.Header.Get("Origin"); origin != "" && set[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
}

// Routes registers every endpoint on a new mux.
func (h *Handler) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", h.Health)
	mux.HandleFunc("POST /api/v1/recognize", h.Recognize)
	mux.HandleFunc("POST /api/v1/compose", h.Compose)
	mux.HandleFunc("POST /api/v1/collect", h.Collect)
	mux.HandleFunc("GET /api/v1/collect/stats", h.CollectStats)
	return mux
}
