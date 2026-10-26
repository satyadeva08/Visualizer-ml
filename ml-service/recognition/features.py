# =============================================================================
# VISUALISER — ml-service/recognition/features.py
#
# WHAT: Converts a clip (array of gray frames) into ONE fixed-length feature
#       vector that a classical classifier (scikit-learn) can consume.
# WHY:  Clips have different lengths and the signer starts/stops at different
#       times. The classifier needs the same number of features every time.
# HOW (5 steps):
#   1. Motion energy per frame  = mean |frame[t+1] - frame[t]|
#   2. Trim to the ACTIVE segment (where energy is high): removes idle time
#      before/after the sign.
#   3. Resample the segment to exactly T frames (time normalisation).
#   4. Subtract the temporal MEDIAN frame (the static background) -> keep only
#      what moves (hands/arms). Pool to a coarse 6x8 grid.
#   5. Concatenate: foreground maps, motion maps, centroid trajectory,
#      per-frame foreground mass and the sign duration.
#
# LIMITS (be honest in the viva): these are appearance/motion features, not
# hand-pose features. They work for a FIXED camera, one signer and a fairly
# stable background (signer-dependent recognition). They do NOT generalise to
# new signers or moving cameras. Landmark features (MediaPipe) would, but need
# a runtime that is not available on Windows-ARM Python.
#
# FEATURE_VERSION must be bumped whenever this file changes how features are
# computed, so an old model is never used with new features.
# =============================================================================

import numpy as np

from recognition.video import VideoError

FEATURE_VERSION = 1

# Must match what training used; stored inside the model bundle too.
FEATURE_CONFIG = {
    "fps": 10,
    "width": 64,
    "height": 48,
    "max_seconds": 10.0,
    "T": 12,            # frames after time normalisation
    "grid": (6, 8),     # pooled grid (rows, cols)
}

MIN_FRAMES = 6
# Default motion floor: mean |frame diff| below this => "no sign performed".
# Calibrate on your camera (train.py prints the energy statistics of your data).
DEFAULT_MIN_MOTION = 0.004


def _pool(arr: np.ndarray, grid: tuple[int, int]) -> np.ndarray:
    """Block-average (..., H, W) down to (..., grid_rows, grid_cols)."""
    h, w = arr.shape[-2:]
    gr, gc = grid
    bh, bw = h // gr, w // gc
    arr = arr[..., : gr * bh, : gc * bw]
    arr = arr.reshape(*arr.shape[:-2], gr, bh, gc, bw)
    return arr.mean(axis=(-3, -1))


def motion_energy(frames: np.ndarray) -> np.ndarray:
    """Mean absolute frame difference for each consecutive pair, in [0, 1]."""
    f = frames.astype(np.float32) / 255.0
    return np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))


def active_segment(energy: np.ndarray) -> tuple[int, int]:
    """Frame index range [start, end] where the motion energy is high."""
    k = np.ones(3, dtype=np.float32) / 3.0
    smooth = np.convolve(energy, k, mode="same")
    thr = 0.25 * float(smooth.max())
    idx = np.where(smooth >= thr)[0]
    if len(idx) < 3:
        return 0, len(energy)  # fall back to the whole clip
    start = max(int(idx[0]) - 1, 0)
    end = min(int(idx[-1]) + 2, len(energy))  # +1 because diff has N-1 entries
    return start, end


def extract_features(
    frames: np.ndarray,
    config: dict | None = None,
    min_motion: float = DEFAULT_MIN_MOTION,
) -> tuple[np.ndarray, dict]:
    """
    Returns (feature_vector, info). `info` holds diagnostics (energy, duration)
    that are useful for logging and for the evaluation document.

    Raises VideoError (code NO_SIGN_DETECTED) when the clip has no motion.
    """
    cfg = config or FEATURE_CONFIG
    if frames.ndim != 3 or len(frames) < MIN_FRAMES:
        raise VideoError("The clip is too short. Record at least one second.",
                         code="CLIP_TOO_SHORT")

    energy = motion_energy(frames)
    peak = float(energy.max())
    if peak < min_motion:
        raise VideoError(
            "No movement detected. Keep the camera still and perform the sign "
            "clearly in front of it.", code="NO_SIGN_DETECTED")

    start, end = active_segment(energy)
    seg = frames[start: end + 1].astype(np.float32) / 255.0
    if len(seg) < 3:
        seg = frames.astype(np.float32) / 255.0
    duration_s = len(seg) / cfg["fps"]

    # Time-normalise to T frames
    T = cfg["T"]
    idx = np.linspace(0, len(seg) - 1, T).round().astype(int)
    seg = seg[idx]

    # Foreground = |frame - median background|
    background = np.median(seg, axis=0)
    fg = np.abs(seg - background)                     # (T, H, W)
    fg_grid = _pool(fg, cfg["grid"])                  # (T, gr, gc)

    motion = np.abs(np.diff(seg, axis=0))             # (T-1, H, W)
    motion_grid = _pool(motion, cfg["grid"])          # (T-1, gr, gc)

    # Centroid of foreground mass and mass per frame
    gr, gc = cfg["grid"]
    ys, xs = np.mgrid[0:gr, 0:gc]
    mass = fg_grid.sum(axis=(1, 2)) + 1e-6
    cx = (fg_grid * xs).sum(axis=(1, 2)) / mass / (gc - 1)
    cy = (fg_grid * ys).sum(axis=(1, 2)) / mass / (gr - 1)

    vec = np.concatenate([
        fg_grid.ravel(),
        motion_grid.ravel(),
        cx, cy,
        mass / mass.max(),
        [duration_s],
    ]).astype(np.float32)

    info = {
        "motion_peak": peak,
        "active_frames": int(end - start + 1),
        "total_frames": int(len(frames)),
        "duration_s": float(duration_s),
    }
    return vec, info
