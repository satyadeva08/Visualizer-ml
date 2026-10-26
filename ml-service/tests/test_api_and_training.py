"""
End-to-end plumbing test on SYNTHETIC clips: collect -> train -> load -> predict via HTTP.
The accuracy of this toy problem is NOT a project result (see conftest.py).
"""
import io
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import needs_ffmpeg, write_video

ROOT = Path(__file__).resolve().parent.parent


def post_video(client, path, endpoint="/predict", **form):
    data = {"video": (io.BytesIO(Path(path).read_bytes()), Path(path).name), **form}
    return client.post(endpoint, data=data, content_type="multipart/form-data")


@pytest.fixture
def no_model_client(monkeypatch, tmp_path):
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "missing.pkl"))
    monkeypatch.delenv("ALLOW_MOCK", raising=False)
    from service.app import create_app
    return create_app().test_client()


def test_health_reports_unavailable_without_model(no_model_client):
    j = no_model_client.get("/health").get_json()
    assert j["status"] == "ok" and j["model"]["mode"] == "unavailable"


def test_predict_without_model_is_503_not_a_fake_result(no_model_client, tmp_path):
    p = tmp_path / "x.webm"; p.write_bytes(b"\x1a\x45\xdf\xa3" + b"0" * 64)
    r = post_video(no_model_client, p)
    assert r.status_code == 503 and r.get_json()["code"] == "MODEL_NOT_TRAINED"


def test_mock_mode_is_explicitly_flagged(monkeypatch, tmp_path):
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "missing.pkl"))
    monkeypatch.setenv("ALLOW_MOCK", "1")
    from service.app import create_app
    c = create_app().test_client()
    p = tmp_path / "x.webm"; p.write_bytes(b"\x1a\x45\xdf\xa3" + b"0" * 64)
    j = post_video(c, p).get_json()
    assert j["is_mock"] is True and j["signs"][0]["confidence"] is None


def test_missing_file_field(no_model_client):
    r = no_model_client.post("/predict", data={}, content_type="multipart/form-data")
    assert r.status_code == 400 and r.get_json()["code"] == "MISSING_FILE"


def test_unsupported_extension(no_model_client, tmp_path):
    p = tmp_path / "notes.txt"; p.write_text("hello")
    r = post_video(no_model_client, p)
    assert r.status_code == 415


def test_wrong_content_with_video_extension(no_model_client, tmp_path):
    p = tmp_path / "fake.webm"; p.write_text("this is plain text, not a video")
    r = post_video(no_model_client, p)
    assert r.status_code == 415 and r.get_json()["code"] == "UNSUPPORTED_FORMAT"


def test_empty_file(no_model_client, tmp_path):
    p = tmp_path / "empty.webm"; p.write_bytes(b"")
    assert post_video(no_model_client, p).status_code == 400


def test_generate_endpoint_validation_and_output(no_model_client):
    ok = no_model_client.post("/generate", json={"labels": ["I", "WANT", "WATER"]}).get_json()
    assert ok["text"] == "I want water."
    assert no_model_client.post("/generate", json={"labels": []}).status_code == 400
    assert no_model_client.post("/generate", json={"labels": "HELLO"}).status_code == 400


def test_collect_is_disabled_by_default(no_model_client):
    assert no_model_client.post("/collect").status_code in (404, 405)


@needs_ffmpeg
def test_full_plumbing_collect_train_predict(monkeypatch, tmp_path):
    data = tmp_path / "data"
    monkeypatch.setenv("ENABLE_COLLECT", "1")
    monkeypatch.setenv("DATA_DIR", str(data))
    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "m" / "classifier.pkl"))
    import importlib, service.app as appmod
    importlib.reload(appmod)   # DATA_DIR is read at import time
    client = appmod.create_app().test_client()

    kinds = ["LEFT_RIGHT", "UP_DOWN", "DIAGONAL"]
    for si, session in enumerate(["sa", "sb", "sc"]):
        for kind in kinds:
            for k in range(3):
                v = write_video(tmp_path / "t.webm", kind, seed=si * 10 + k)
                r = post_video(client, v, "/collect", label=kind, session=session)
                assert r.status_code == 200, r.get_json()
    # invalid label is refused, an idle clip is refused for a normal label
    v = write_video(tmp_path / "idle.webm", "IDLE", seed=1)
    assert post_video(client, v, "/collect", label="bad label", session="sa").status_code == 400
    assert post_video(client, v, "/collect", label="LEFT_RIGHT", session="sa").status_code == 422
    assert client.get("/collect/stats").get_json()["counts"]["UP_DOWN"] == 9

    out = subprocess.run([sys.executable, "training/train.py", "--data", str(data),
                          "--out", str(tmp_path / "m" / "classifier.pkl"),
                          "--report", str(tmp_path / "m" / "RESULTS.md"),
                          "--min-per-class", "3"], cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert out.returncode == 0, out.stdout + out.stderr
    assert "session-held-out" in out.stdout
    assert (tmp_path / "m" / "metrics.json").exists() and (tmp_path / "m" / "RESULTS.md").exists()

    c2 = appmod.create_app().test_client()           # now a model exists
    assert c2.get("/health").get_json()["model"]["mode"] == "real"
    fresh = write_video(tmp_path / "fresh.webm", "UP_DOWN", seed=999)
    j = post_video(c2, fresh).get_json()
    assert j["is_mock"] is False
    assert set(j["timings"]) == {"decode_ms", "features_ms", "inference_ms"}
    assert j["outcome"] in ("recognized", "unknown_sign")
    # idle clip -> clear 'no sign' error, never a made-up sign
    r = post_video(c2, write_video(tmp_path / "idle2.webm", "IDLE", seed=5))
    assert r.status_code == 422 and r.get_json()["code"] == "NO_SIGN_DETECTED"


@pytest.mark.parametrize("body", [["HELLO"], "HELLO", 42, True])
def test_generate_rejects_non_object_json(no_model_client, body):
    response = no_model_client.post("/generate", json=body)
    assert response.status_code == 400
    assert response.get_json()["code"] == "INVALID_REQUEST"


@needs_ffmpeg
def test_collect_preserves_existing_clip_after_deletion(monkeypatch, tmp_path):
    import service.app as appmod
    monkeypatch.setenv("ENABLE_COLLECT", "1")
    monkeypatch.setattr(appmod, "DATA_DIR", tmp_path / "data")
    client = appmod.create_app().test_client()
    label_dir = tmp_path / "data" / "LEFT_RIGHT"
    label_dir.mkdir(parents=True)
    existing = label_dir / "LEFT_RIGHT_sa_002.webm"
    existing.write_bytes(b"preserve this recording")
    video = write_video(tmp_path / "clip.webm", "LEFT_RIGHT")
    response = post_video(client, video, "/collect", label="LEFT_RIGHT", session="sa")
    assert response.status_code == 200
    assert existing.read_bytes() == b"preserve this recording"
    assert len(list(label_dir.glob("*.webm"))) == 2
