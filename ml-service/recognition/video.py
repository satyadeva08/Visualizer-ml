# =============================================================================
# VISUALISER — ml-service/recognition/video.py
#
# WHAT: Turns a recorded video file (webm / mp4 / mov ...) into a small NumPy
#       array of grayscale frames.
# WHY:  OpenCV and MediaPipe have no wheels for Windows-on-ARM (Snapdragon), so
#       we cannot rely on them for decoding. FFmpeg is a standalone program that
#       decodes everything MediaRecorder can produce, so we call it directly.
# HOW:  We run `ffmpeg` as a subprocess, ask it to resample to a fixed frame
#       rate and size, convert to 8-bit gray, and write RAW bytes to stdout.
#       NumPy then reshapes the bytes into (frames, height, width).
#
# Install FFmpeg:  winget install Gyan.FFmpeg   (then reopen the terminal)
# Or set FFMPEG_PATH to the full path of ffmpeg.exe.
# =============================================================================

import os
import shutil
import subprocess

import numpy as np


class VideoError(ValueError):
    """The video is unusable (corrupt, empty, too short...). Shown to the user."""

    def __init__(self, message: str, code: str = "INVALID_VIDEO"):
        super().__init__(message)
        self.code = code


class FFmpegMissing(RuntimeError):
    """FFmpeg is not installed / not on PATH. A server configuration problem."""


def find_ffmpeg() -> str | None:
    """Return the path to the ffmpeg executable, or None if not found."""
    explicit = os.environ.get("FFMPEG_PATH")
    if explicit and os.path.exists(explicit):
        return explicit
    return shutil.which("ffmpeg")


def decode_gray_frames(
    path: str,
    fps: int = 10,
    width: int = 64,
    height: int = 48,
    max_seconds: float = 10.0,
    timeout: float = 30.0,
) -> np.ndarray:
    """
    Decode `path` to a uint8 array of shape (n_frames, height, width).

    Raises:
        FFmpegMissing: ffmpeg is not available.
        VideoError:    the file could not be decoded or contains no frames.
    """
    ffmpeg = find_ffmpeg()
    if ffmpeg is None:
        raise FFmpegMissing(
            "FFmpeg was not found. Install it (winget install Gyan.FFmpeg) "
            "or set the FFMPEG_PATH environment variable."
        )

    cmd = [
        ffmpeg, "-v", "error", "-nostdin",
        "-i", path,
        "-t", str(max_seconds),
        "-vf", f"fps={fps},scale={width}:{height},format=gray",
        "-f", "rawvideo", "-pix_fmt", "gray",
        "-",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise VideoError("Decoding the video took too long.", code="DECODE_TIMEOUT")

    frame_bytes = width * height
    n_frames = len(proc.stdout) // frame_bytes
    if n_frames == 0:
        # ffmpeg writes the reason to stderr; we log it but do not expose internals.
        raise VideoError("Could not decode any frames. Is this a valid video?")

    data = np.frombuffer(proc.stdout[: n_frames * frame_bytes], dtype=np.uint8)
    return data.reshape(n_frames, height, width)
