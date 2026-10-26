// =============================================================================
// VISUALISER — handlers/upload.go
// Shared, security-sensitive upload handling used by /recognize and /collect.
//
//   1. Content-Type must be multipart/form-data
//   2. Body size is capped with http.MaxBytesReader
//   3. The declared MIME type must be on an allow-list
//   4. The FILE CONTENT (magic bytes) must look like that kind of video:
//      the client-declared type alone is never trusted
//   5. The client's file name is IGNORED (no path traversal): we create our own
//      random temp name with os.CreateTemp and only a fixed extension
//   6. The temp file is always removed, and multipart temp files too
// =============================================================================

package handlers

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

var mimeToExtension = map[string]string{
	"video/webm":       ".webm",
	"video/mp4":        ".mp4",
	"video/quicktime":  ".mov",
	"video/x-matroska": ".mkv",
	"video/ogg":        ".ogv",
}

// looksLikeVideo checks container signatures in the first bytes.
func looksLikeVideo(head []byte) bool {
	if bytes.HasPrefix(head, []byte{0x1A, 0x45, 0xDF, 0xA3}) { // WebM / Matroska
		return true
	}
	if bytes.HasPrefix(head, []byte("OggS")) {
		return true
	}
	if len(head) >= 8 {
		switch string(head[4:8]) { // MP4 / MOV
		case "ftyp", "moov", "mdat", "free", "wide":
			return true
		}
	}
	return false
}

type upload struct {
	Path string
	Name string // random base name, safe to forward
	MIME string
	done func()
}

func (u *upload) Close() { u.done() }

// readUpload validates the request and stores the video. On any problem it has
// already written the HTTP error and returns ok=false.
func (h *Handler) readUpload(w http.ResponseWriter, r *http.Request) (*upload, bool) {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
		writeError(w, http.StatusBadRequest, "Request must be multipart/form-data", "INVALID_REQUEST")
		return nil, false
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.cfg.MaxUploadBytes+1<<20) // + form overhead
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			writeError(w, http.StatusRequestEntityTooLarge,
				fmt.Sprintf("Video exceeds the %d MB limit", h.cfg.MaxUploadBytes>>20), "FILE_TOO_LARGE")
			return nil, false
		}
		writeError(w, http.StatusBadRequest, "Could not read the upload", "INVALID_REQUEST")
		return nil, false
	}
	cleanupForm := func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}

	file, header, err := r.FormFile("video")
	if err != nil {
		cleanupForm()
		writeError(w, http.StatusBadRequest, "Missing 'video' file field", "INVALID_REQUEST")
		return nil, false
	}

	fail := func(status int, msg, code string) (*upload, bool) {
		file.Close()
		cleanupForm()
		writeError(w, status, msg, code)
		return nil, false
	}

	if header.Size > h.cfg.MaxUploadBytes {
		return fail(http.StatusRequestEntityTooLarge,
			fmt.Sprintf("Video exceeds the %d MB limit", h.cfg.MaxUploadBytes>>20), "FILE_TOO_LARGE")
	}
	if header.Size == 0 {
		return fail(http.StatusBadRequest, "The video file is empty", "EMPTY_FILE")
	}

	mime := header.Header.Get("Content-Type")
	if i := strings.Index(mime, ";"); i != -1 { // drop "; codecs=..."
		mime = mime[:i]
	}
	mime = strings.ToLower(strings.TrimSpace(mime))
	ext, ok := mimeToExtension[mime]
	if !ok {
		return fail(http.StatusUnsupportedMediaType,
			"Unsupported video format. Supported: video/webm, video/mp4, video/quicktime",
			"UNSUPPORTED_FORMAT")
	}

	head := make([]byte, 16)
	n, _ := io.ReadFull(file, head)
	if !looksLikeVideo(head[:n]) {
		return fail(http.StatusUnsupportedMediaType,
			"The file content is not a recognised video", "UNSUPPORTED_FORMAT")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fail(http.StatusInternalServerError, "Could not process the upload", "INTERNAL_ERROR")
	}

	tmp, err := os.CreateTemp("", "visualiser-upload-*"+ext) // random name; client name ignored
	if err != nil {
		return fail(http.StatusInternalServerError, "Could not store the upload", "INTERNAL_ERROR")
	}
	if _, err := io.Copy(tmp, file); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return fail(http.StatusInternalServerError, "Could not store the upload", "INTERNAL_ERROR")
	}
	tmp.Close()
	file.Close()

	path := tmp.Name()
	return &upload{
		Path: path, Name: filepath.Base(path), MIME: mime,
		done: func() { _ = os.Remove(path); cleanupForm() },
	}, true
}
