package handlers

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var webmBytes = append([]byte{0x1A, 0x45, 0xDF, 0xA3}, bytes.Repeat([]byte{0}, 64)...)

// fakeML is a stand-in for the Python service.
func fakeML(t *testing.T, predict http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"status":"ok","model":{"mode":"real","labels":["HELLO"]}}`))
	})
	mux.HandleFunc("/predict", predict)
	mux.HandleFunc("/generate", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"text":"I want water.","text_method":"template","emphasis":["water"]}`))
	})
	mux.HandleFunc("/collect", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"saved":true}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func okPredict(w http.ResponseWriter, r *http.Request) {
	_, _ = w.Write([]byte(`{"signs":[{"label":"HELLO","confidence":0.9}],"text":"Hello",
	"text_method":"single_sign","emphasis":["hello"],"outcome":"recognized","reason":null,
	"alternatives":[],"timings":{"decode_ms":5},"processing_time_ms":12,"is_mock":false}`))
}

func newHandler(mlURL string, maxBytes int64, timeout time.Duration, collect bool) *Handler {
	return New(Config{MLServiceURL: mlURL, MaxUploadBytes: maxBytes, MLRequestTimeout: timeout, CollectEnabled: collect})
}

// multipartReq builds an upload request. mime "" omits the part Content-Type.
func multipartReq(t *testing.T, path, field, filename, mime string, content []byte, fields map[string]string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	hdr := textproto.MIMEHeader{}
	hdr.Set("Content-Disposition", `form-data; name="`+field+`"; filename="`+filename+`"`)
	if mime != "" {
		hdr.Set("Content-Type", mime)
	}
	part, _ := mw.CreatePart(hdr)
	_, _ = part.Write(content)
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	return req
}

func do(h http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func errCode(t *testing.T, rr *httptest.ResponseRecorder) string {
	t.Helper()
	var e errorResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &e); err != nil {
		t.Fatalf("not an error JSON: %s", rr.Body.String())
	}
	return e.Code
}

func TestHealthOKAndModelInfoPassThrough(t *testing.T) {
	ml := fakeML(t, okPredict)
	h := newHandler(ml.URL, 1<<20, time.Second, false).Routes()
	rr := do(h, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), `"mode":"real"`) {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestHealthDegradedWhenMLDown(t *testing.T) {
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	rr := do(h, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))
	if rr.Code != http.StatusServiceUnavailable || !strings.Contains(rr.Body.String(), "degraded") {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRecognizeSuccess(t *testing.T) {
	ml := fakeML(t, okPredict)
	h := newHandler(ml.URL, 1<<20, 2*time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm;codecs=vp9", webmBytes, nil))
	if rr.Code != 200 {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
	var out struct {
		Status string `json:"status"`
		Result struct {
			Text   string `json:"text"`
			IsMock bool   `json:"is_mock"`
			Signs  []struct {
				Label string `json:"label"`
			} `json:"signs"`
		} `json:"result"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	if out.Status != "completed" || out.Result.Text != "Hello" || out.Result.IsMock || out.Result.Signs[0].Label != "HELLO" {
		t.Fatalf("unexpected body: %s", rr.Body.String())
	}
}

func TestMockFlagIsPreserved(t *testing.T) {
	ml := fakeML(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"signs":[{"label":"HELLO","confidence":null}],"text":"Hello","is_mock":true}`))
	})
	h := newHandler(ml.URL, 1<<20, 2*time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", webmBytes, nil))
	if !strings.Contains(rr.Body.String(), `"is_mock":true`) {
		t.Fatalf("mock flag lost: %s", rr.Body.String())
	}
}

func TestRecognizeRejectsNonMultipart(t *testing.T) {
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/recognize", strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	rr := do(h, req)
	if rr.Code != 400 || errCode(t, rr) != "INVALID_REQUEST" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRecognizeMissingField(t *testing.T) {
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "wrongfield", "a.webm", "video/webm", webmBytes, nil))
	if rr.Code != 400 {
		t.Fatalf("got %d", rr.Code)
	}
}

func TestRecognizeRejectsUnsupportedMIME(t *testing.T) {
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.txt", "text/plain", []byte("hello"), nil))
	if rr.Code != 415 || errCode(t, rr) != "UNSUPPORTED_FORMAT" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRecognizeRejectsFakeVideoContent(t *testing.T) {
	// Declared as video/webm, but the bytes are plain text: content sniffing must catch it.
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", []byte("just text, not a video"), nil))
	if rr.Code != 415 {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRecognizeRejectsEmptyFile(t *testing.T) {
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", nil, nil))
	if rr.Code != 400 || errCode(t, rr) != "EMPTY_FILE" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestRecognizeRejectsOversizedFile(t *testing.T) {
	big := append(append([]byte{}, webmBytes...), bytes.Repeat([]byte{1}, 2<<20)...)
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes() // 1 MB cap
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", big, nil))
	if rr.Code != http.StatusRequestEntityTooLarge || errCode(t, rr) != "FILE_TOO_LARGE" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestPathTraversalFilenameIsIgnored(t *testing.T) {
	var seenName string
	ml := fakeML(t, func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseMultipartForm(1 << 20)
		_, hdr, _ := r.FormFile("video")
		seenName = hdr.Filename
		okPredict(w, r)
	})
	h := newHandler(ml.URL, 1<<20, 2*time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "../../etc/passwd", "video/webm", webmBytes, nil))
	if rr.Code != 200 {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(seenName, "..") || strings.Contains(seenName, "passwd") || !strings.HasPrefix(seenName, "visualiser-upload-") {
		t.Fatalf("client filename leaked to ML service: %q", seenName)
	}
}

func TestTempFileIsRemoved(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("TMPDIR", dir) // os.CreateTemp honours TMPDIR on Linux/macOS
	t.Setenv("TEMP", dir)   // ...and TEMP on Windows
	ml := fakeML(t, okPredict)
	h := newHandler(ml.URL, 1<<20, 2*time.Second, false).Routes()
	if rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", webmBytes, nil)); rr.Code != 200 {
		t.Fatalf("got %d", rr.Code)
	}
	left, _ := filepath.Glob(filepath.Join(dir, "visualiser-upload-*"))
	if len(left) != 0 {
		t.Fatalf("temp files left behind: %v", left)
	}
	_ = os.Remove(dir)
}

func TestMLTimeoutReturns504(t *testing.T) {
	ml := fakeML(t, func(w http.ResponseWriter, r *http.Request) { time.Sleep(600 * time.Millisecond) })
	h := newHandler(ml.URL, 1<<20, 150*time.Millisecond, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", webmBytes, nil))
	if rr.Code != http.StatusGatewayTimeout || errCode(t, rr) != "ML_TIMEOUT" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestMLUnreachableReturns503(t *testing.T) {
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", webmBytes, nil))
	if rr.Code != http.StatusServiceUnavailable || errCode(t, rr) != "ML_UNREACHABLE" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestMLUserErrorIsRelayed(t *testing.T) {
	ml := fakeML(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(422)
		_, _ = w.Write([]byte(`{"error":"No movement detected.","code":"NO_SIGN_DETECTED"}`))
	})
	h := newHandler(ml.URL, 1<<20, 2*time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", webmBytes, nil))
	if rr.Code != 422 || errCode(t, rr) != "NO_SIGN_DETECTED" {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
}

func TestMLInternalErrorIsHidden(t *testing.T) {
	ml := fakeML(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
		_, _ = w.Write([]byte(`{"error":"Traceback: secret path C:\\Users\\x","code":"INTERNAL_ERROR"}`))
	})
	h := newHandler(ml.URL, 1<<20, 2*time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/recognize", "video", "a.webm", "video/webm", webmBytes, nil))
	if rr.Code != http.StatusBadGateway || strings.Contains(rr.Body.String(), "secret") {
		t.Fatalf("internal detail leaked: %d %s", rr.Code, rr.Body.String())
	}
}

func TestComposeValidationAndSuccess(t *testing.T) {
	ml := fakeML(t, okPredict)
	h := newHandler(ml.URL, 1<<20, 2*time.Second, false).Routes()
	post := func(body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/compose", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		return do(h, req)
	}
	if rr := post(`{"labels":["I","WANT","WATER"]}`); rr.Code != 200 || !strings.Contains(rr.Body.String(), "I want water.") {
		t.Fatalf("got %d %s", rr.Code, rr.Body.String())
	}
	for _, bad := range []string{`{"labels":[]}`, `not json`, `{"labels":["../etc"]}`} {
		if rr := post(bad); rr.Code != 400 {
			t.Fatalf("%s -> %d", bad, rr.Code)
		}
	}
}

func TestCollectDisabledIs404(t *testing.T) {
	h := newHandler("http://127.0.0.1:1", 1<<20, time.Second, false).Routes()
	rr := do(h, multipartReq(t, "/api/v1/collect", "video", "a.webm", "video/webm", webmBytes,
		map[string]string{"label": "HELLO", "session": "s1"}))
	if rr.Code != 404 {
		t.Fatalf("got %d", rr.Code)
	}
}

func TestCollectValidatesLabelAndSession(t *testing.T) {
	ml := fakeML(t, okPredict)
	h := newHandler(ml.URL, 1<<20, 2*time.Second, true).Routes()
	send := func(label, session string) int {
		return do(h, multipartReq(t, "/api/v1/collect", "video", "a.webm", "video/webm", webmBytes,
			map[string]string{"label": label, "session": session})).Code
	}
	if send("HELLO", "s1") != 200 {
		t.Fatal("valid collect rejected")
	}
	if send("../x", "s1") != 400 || send("HELLO", "bad session!") != 400 {
		t.Fatal("invalid label/session accepted")
	}
}

func TestCORSAllowListOnly(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
	h := CORS([]string{"https://localhost:5173"}, inner)
	for origin, want := range map[string]string{"https://localhost:5173": "https://localhost:5173", "https://evil.example": ""} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Origin", origin)
		if got := do(h, req).Header().Get("Access-Control-Allow-Origin"); got != want {
			t.Fatalf("origin %s: got %q want %q", origin, got, want)
		}
	}
}
