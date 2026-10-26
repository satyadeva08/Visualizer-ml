// =============================================================================
// VISUALISER — Go backend (main.go)
// Receives the recorded video, validates it, forwards it to the Python ML
// service and returns the result. All configuration comes from environment
// variables (see ../.env.example); nothing is hard-coded.
//
//   GET  /api/v1/health
//   POST /api/v1/recognize
//   POST /api/v1/compose
//   POST /api/v1/collect, GET /api/v1/collect/stats   (only if ENABLE_COLLECT=1)
// =============================================================================

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"visualiser/backend/handlers"
)

func main() {
	host := getEnv("HOST", "127.0.0.1") // loopback only: the phone reaches us via Vite's proxy
	port := getEnv("PORT", "8080")
	mlURL := getEnv("ML_SERVICE_URL", "http://127.0.0.1:5000")
	maxMB := getEnvInt("MAX_UPLOAD_MB", 50)
	mlTimeout := time.Duration(getEnvInt("ML_TIMEOUT_SECONDS", 60)) * time.Second
	origins := strings.Split(getEnv("ALLOWED_ORIGINS",
		"http://localhost:5173,https://localhost:5173,http://127.0.0.1:5173,https://127.0.0.1:5173"), ",")
	collect := getEnv("ENABLE_COLLECT", "0") == "1"

	h := handlers.New(handlers.Config{
		MLServiceURL:     mlURL,
		MaxUploadBytes:   int64(maxMB) << 20,
		MLRequestTimeout: mlTimeout,
		CollectEnabled:   collect,
	})

	srv := &http.Server{
		Addr:              host + ":" + port,
		Handler:           handlers.CORS(origins, handlers.Logging(h.Routes())),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Minute, // slow Wi-Fi uploads
		WriteTimeout:      mlTimeout + 30*time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("VISUALISER backend on http://%s (ML=%s, max upload=%d MB, collect=%v)", srv.Addr, mlURL, maxMB, collect)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil && v > 0 {
		return v
	}
	return fallback
}
