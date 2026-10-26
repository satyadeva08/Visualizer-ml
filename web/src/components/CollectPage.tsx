// =============================================================
// VISUALISER — CollectPage  (DEVELOPMENT TOOL: record your own training data)
// Only reachable when the backend reports collect_enabled (ENABLE_COLLECT=1).
//
// WHY: no public ISL dataset is small, licensed for this use AND recorded the way
//      the demo camera records. Clips recorded here go through the SAME browser,
//      codec and framing as the demo, which is what makes the model work.
// HOW: pick a label -> Record (3-2-1 countdown, fixed length) -> review ->
//      Save. The server stores data/<LABEL>/<LABEL>_<session>_<NNN>.webm.
// SESSIONS: a session = one sitting. train.py keeps the NEWEST sessions out of
//      training to test on them, so record in at least 3 separate sittings.
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useRecorder } from '../hooks/useRecorder';
import { ApiError } from '../types';
import { fetchCollectStats, submitCollectClip } from '../api/client';

const TARGET_PER_CLASS = 25;

function defaultSession(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `s${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}t${p(d.getHours())}${p(d.getMinutes())}`;
}

export function CollectPage({ onBack }: { onBack: () => void }) {
  const { videoRef, stream, state: camState, error: camError, requestCamera, stopCamera } = useCamera();
  const rec = useRecorder();
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const timers = useRef<number[]>([]);

  const [label, setLabel] = useState('');
  const [session, setSession] = useState(defaultSession());
  const [clipSeconds, setClipSeconds] = useState(3);
  const [autoSave, setAutoSave] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const cleanLabel = label.trim().toUpperCase().replace(/\s+/g, '_');
  const labelValid = /^[A-Z][A-Z0-9_]{0,31}$/.test(cleanLabel);
  const sessionValid = /^[a-z0-9]{1,16}$/.test(session);

  const clearTimers = () => { timers.current.forEach(id => window.clearTimeout(id)); timers.current = []; };

  const refreshStats = useCallback(async () => {
    try { setCounts((await fetchCollectStats()).counts); } catch { /* shown on save */ }
  }, []);

  useEffect(() => {
    requestCamera();
    refreshStats();
    return () => { clearTimers(); stopCamera(); };
  }, [requestCamera, stopCamera, refreshStats]);

  useEffect(() => {
    if (rec.recordedUrl && previewRef.current) {
      previewRef.current.src = rec.recordedUrl;
      previewRef.current.load();
    }
  }, [rec.recordedUrl]);

  const save = useCallback(async () => {
    if (!rec.recordedBlob || !rec.mimeInfo || !labelValid || !sessionValid) return;
    setSaving(true);
    try {
      const r = await submitCollectClip(rec.recordedBlob, rec.mimeInfo.mimeType, cleanLabel, session);
      setStatus({ ok: true, msg: `Saved ${r.label} — ${r.count_for_label} clips for this label` });
      rec.clearRecording();
      refreshStats();
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof ApiError ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }, [rec, cleanLabel, session, labelValid, sessionValid, refreshStats]);

  // optional auto-save as soon as a clip is ready
  useEffect(() => {
    if (autoSave && rec.recordedBlob && !saving) save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.recordedBlob]);

  const begin = () => {
    if (!stream || !labelValid) return;
    setStatus(null);
    rec.clearRecording();
    let n = 3;
    setCountdown(n);
    const tick = () => {
      n -= 1;
      if (n > 0) {
        setCountdown(n);
        timers.current.push(window.setTimeout(tick, 1000));
      } else {
        setCountdown(null);
        if (rec.startRecording(stream)) {
          timers.current.push(window.setTimeout(() => rec.stopRecording(), clipSeconds * 1000));
        }
      }
    };
    timers.current.push(window.setTimeout(tick, 1000));
  };

  const busy = countdown !== null || rec.isRecording || saving;
  const hasClip = !!rec.recordedBlob;
  const labels = Object.keys(counts);

  return (
    <div className="min-h-screen px-4 py-24 flex justify-center">
      <div className="w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-4">
          <button className="btn-secondary !px-4 !py-2 text-xs" onClick={onBack}>← Back</button>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Collect training clips</h1>
            <p className="text-xs text-text-muted">Development tool — records data for training your own model.</p>
          </div>
        </div>

        <div className="glass-card p-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-text-muted">Sign label
            <input id="collect-label" list="collect-labels" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. HELLO  (use NONE for idle / random movement)" disabled={busy}
              className="mt-1 w-full rounded-lg bg-surface-elevated border border-surface-border px-3 py-2 text-sm text-text-primary" />
            <datalist id="collect-labels">{labels.map(l => <option key={l} value={l} />)}</datalist>
          </label>
          <label className="text-xs text-text-muted">Session (one sitting)
            <input id="collect-session" value={session} onChange={e => setSession(e.target.value.toLowerCase())} disabled={busy}
              className="mt-1 w-full rounded-lg bg-surface-elevated border border-surface-border px-3 py-2 text-sm text-text-primary" />
          </label>
          <label className="text-xs text-text-muted">Clip length: {clipSeconds}s
            <input type="range" min={2} max={6} value={clipSeconds} onChange={e => setClipSeconds(Number(e.target.value))} disabled={busy} className="w-full" />
          </label>
          <label className="text-xs text-text-muted flex items-center gap-2">
            <input type="checkbox" checked={autoSave} onChange={e => setAutoSave(e.target.checked)} />
            Auto-save every clip (skip review)
          </label>
        </div>
        {!labelValid && label !== '' && <p className="text-xs text-error">Label: letters, digits and _ only, starting with a letter.</p>}
        {!sessionValid && <p className="text-xs text-error">Session: lowercase letters and digits only (max 16).</p>}

        <div className="relative glass-card overflow-hidden" style={{ aspectRatio: '16/9' }}>
          {!hasClip && (
            <video ref={videoRef} className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} autoPlay playsInline muted aria-label="Live camera preview" />
          )}
          {hasClip && <video ref={previewRef} className="w-full h-full object-cover" controls playsInline aria-label="Recorded clip" />}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-8xl font-black" aria-live="assertive">{countdown}</div>
          )}
          {rec.isRecording && <div className="absolute top-3 left-3 bg-black/60 rounded-full px-3 py-1 text-xs">● REC — sign now</div>}
          {camState !== 'ready' && !hasClip && camState !== 'recording' && (
            <div className="absolute inset-0 flex items-center justify-center bg-brand-900/80 text-sm text-text-muted px-4 text-center">
              {camError ?? 'Starting camera…'}
            </div>
          )}
        </div>

        {(rec.recordingError || status) && (
          <p role="alert" className={`text-sm text-center ${status?.ok ? 'text-success' : 'text-error'}`}>{rec.recordingError ?? status?.msg}</p>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          {!hasClip && (
            <button id="btn-collect-record" className="btn-primary" onClick={begin} disabled={busy || camState !== 'ready' || !labelValid}>
              ● Record {cleanLabel || 'clip'}
            </button>
          )}
          {hasClip && !autoSave && (
            <>
              <button className="btn-secondary" onClick={() => rec.clearRecording()} disabled={saving}>Discard</button>
              <button id="btn-collect-save" className="btn-primary" onClick={save} disabled={saving || !labelValid || !sessionValid}>
                {saving ? 'Saving…' : 'Save clip'}
              </button>
            </>
          )}
        </div>

        <div className="glass-card p-4">
          <p className="text-xs font-medium tracking-widest text-text-muted uppercase mb-3">
            Clips collected (aim for ≥ {TARGET_PER_CLASS} per sign, across ≥ 3 sessions)
          </p>
          {labels.length === 0 ? <p className="text-sm text-text-muted">Nothing recorded yet.</p> : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {labels.map(l => (
                <li key={l} className="flex justify-between rounded-lg px-3 py-2 bg-surface-elevated">
                  <span>{l}</span>
                  <span className={counts[l] >= TARGET_PER_CLASS ? 'text-success' : 'text-warning'}>{counts[l]}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-muted mt-3">
            Tips: same camera position and lighting as the demo · hands fully in frame · start with hands down ·
            record a <strong>NONE</strong> class (idle, scratching your face, random gestures) so the model can say "no sign".
          </p>
        </div>
      </div>
    </div>
  );
}
