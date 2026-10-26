"""
Shared test helpers.

IMPORTANT: the videos made here are SYNTHETIC (a white blob moving over a noisy
black background). They exist only to test the CODE PATHS (decode -> features ->
train -> predict -> API). Accuracy measured on them says nothing about real ISL
recognition and must never be quoted as a project result.
"""
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

HAS_FFMPEG = shutil.which("ffmpeg") is not None
needs_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg not installed")

W, H, FPS, N = 160, 120, 10, 30


def blob_frames(kind: str, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    frames = np.zeros((N, H, W), dtype=np.uint8)
    for t in range(N):
        f = rng.integers(0, 3, size=(H, W), dtype=np.uint8)  # mild sensor noise
        u = t / (N - 1)
        if kind == "LEFT_RIGHT":
            cx, cy = 20 + 120 * u, 60
        elif kind == "UP_DOWN":
            cx, cy = 80, 15 + 90 * u
        elif kind == "DIAGONAL":
            cx, cy = 20 + 120 * u, 15 + 90 * u
        elif kind == "IDLE":
            cx, cy = None, None
        else:
            raise ValueError(kind)
        if cx is not None:
            cx += rng.normal(0, 2); cy += rng.normal(0, 2)
            yy, xx = np.ogrid[:H, :W]
            f[((xx - cx) ** 2 + (yy - cy) ** 2) < 12 ** 2] = 255
        frames[t] = f
    return frames


def write_video(path: Path, kind: str, seed: int = 0) -> Path:
    frames = blob_frames(kind, seed)
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libvpx", "-b:v", "1M",
           "-pix_fmt", "yuv420p", str(path)]
    subprocess.run(cmd, input=frames.tobytes(), check=True)
    return path


@pytest.fixture(scope="session")
def tmp_videos(tmp_path_factory):
    d = tmp_path_factory.mktemp("videos")
    return {k: write_video(d / f"{k}.webm", k, seed=1) for k in ("LEFT_RIGHT", "UP_DOWN", "DIAGONAL", "IDLE")}
