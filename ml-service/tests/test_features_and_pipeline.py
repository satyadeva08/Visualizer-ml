import numpy as np
import pytest

from conftest import needs_ffmpeg, blob_frames
from recognition.features import extract_features, FEATURE_CONFIG
from recognition.video import VideoError, decode_gray_frames


def test_feature_vector_has_fixed_length_regardless_of_clip_length():
    a, _ = extract_features((blob_frames("LEFT_RIGHT", 1)[:, ::2, ::2][:, :48, :64]))
    longer = np.concatenate([blob_frames("LEFT_RIGHT", 2)] * 2)[:, ::2, ::2][:, :48, :64]
    b, _ = extract_features(longer)
    assert a.shape == b.shape


def test_idle_clip_is_rejected_as_no_sign():
    frames = blob_frames("IDLE", 3)[:, ::2, ::2][:, :48, :64]
    with pytest.raises(VideoError) as e:
        extract_features(frames)
    assert e.value.code == "NO_SIGN_DETECTED"


def test_too_short_clip_is_rejected():
    with pytest.raises(VideoError) as e:
        extract_features(np.zeros((3, 48, 64), dtype=np.uint8))
    assert e.value.code == "CLIP_TOO_SHORT"


@needs_ffmpeg
def test_decode_returns_expected_shape(tmp_videos):
    f = decode_gray_frames(str(tmp_videos["LEFT_RIGHT"]))
    assert f.ndim == 3 and f.shape[1:] == (FEATURE_CONFIG["height"], FEATURE_CONFIG["width"])
    assert 20 <= f.shape[0] <= 40


@needs_ffmpeg
def test_decode_garbage_raises_video_error(tmp_path):
    bad = tmp_path / "bad.webm"
    bad.write_bytes(b"\x1a\x45\xdf\xa3" + b"not really a video" * 10)
    with pytest.raises(VideoError):
        decode_gray_frames(str(bad))
