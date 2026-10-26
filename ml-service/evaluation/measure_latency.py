"""
VISUALISER — measure REAL end-to-end latency of the running system.

Sends the same clip N times to the Go API and prints min / median / mean / p95 for
  - round trip seen by this script (upload + Go + Python + response)
  - time inside the ML service (decode / features / inference) as reported by Python
It writes evaluation/LATENCY.md. Nothing is estimated: every number is measured.

Usage (all services running):
  python evaluation/measure_latency.py path/to/clip.webm [--url http://127.0.0.1:8080] [-n 20]
Run it on the SAME machine that runs the demo and name that machine in your report.
Memory use is not measured here (see docs/EVALUATION.md).
"""
import argparse
import json
import statistics
import time
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path


def post_clip(url: str, path: Path):
    boundary = uuid.uuid4().hex
    ctype = {"webm": "video/webm", "mp4": "video/mp4", "mov": "video/quicktime"}.get(
        path.suffix.lstrip(".").lower(), "video/webm")
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"video\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(url + "/api/v1/recognize", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    t0 = time.perf_counter()
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read())
    return (time.perf_counter() - t0) * 1000, data["result"]


def pct(v, p):
    v = sorted(v)
    return v[min(len(v) - 1, int(round(p / 100 * (len(v) - 1))))]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("--url", default="http://127.0.0.1:8080")
    ap.add_argument("-n", type=int, default=20)
    ap.add_argument("--out", default=str(Path(__file__).parent / "LATENCY.md"))
    a = ap.parse_args()
    clip = Path(a.clip)

    post_clip(a.url, clip)  # warm-up, not counted
    rt, series = [], {"decode_ms": [], "features_ms": [], "inference_ms": [], "processing_time_ms": []}
    for _ in range(a.n):
        ms, res = post_clip(a.url, clip)
        rt.append(ms)
        for k in series:
            v = res.get("processing_time_ms") if k == "processing_time_ms" else res.get("timings", {}).get(k)
            if v is not None:
                series[k].append(v)

    def row(name, v):
        if not v:
            return f"| {name} | n/a | n/a | n/a | n/a |"
        return f"| {name} | {min(v):.1f} | {statistics.median(v):.1f} | {statistics.mean(v):.1f} | {pct(v, 95):.1f} |"

    lines = [
        "# Latency measurement (auto-generated)\n",
        f"- Measured: {datetime.now().isoformat(timespec='seconds')}",
        f"- Clip: `{clip.name}` ({clip.stat().st_size / 1024:.0f} KB), {a.n} timed requests after 1 warm-up",
        f"- Endpoint: {a.url}/api/v1/recognize\n",
        "| Stage (ms) | min | median | mean | p95 |", "|---|---|---|---|---|",
        row("Round trip (upload + Go + Python + response)", rt),
        row("ML service total", series["processing_time_ms"]),
        row("  decode (FFmpeg)", series["decode_ms"]),
        row("  feature extraction", series["features_ms"]),
        row("  classifier inference", series["inference_ms"]),
    ]
    Path(a.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWritten to {a.out}")


if __name__ == "__main__":
    main()
