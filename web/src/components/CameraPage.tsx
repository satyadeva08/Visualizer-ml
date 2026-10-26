// =============================================================
// VISUALISER — CameraPage
// Handles: permission request, live preview, recording, preview, submit
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCamera } from '../hooks/useCamera';
import { useRecorder } from '../hooks/useRecorder';
import type { RecognitionResponse } from '../types';
import { ApiError } from '../types';
import { submitVideo } from '../api/client';
import { ProcessingPage } from './ProcessingPage';

interface CameraPageProps {
  onResult: (result: RecognitionResponse) => void;
  onBack: () => void;
  /** 1 for the first sign, 2 for the second ... (sentence building) */
  signNumber?: number;
}

const MAX_RECORDING_SECONDS = 10;

export function CameraPage({ onResult, onBack, signNumber = 1 }: CameraPageProps) {
  const { videoRef, stream, state: camState, error: camError, requestCamera, stopCamera } = useCamera();
  const {
    isRecording,
    recordedBlob,
    recordedUrl,
    mimeInfo,
    durationMs,
    startRecording,
    stopRecording,
    clearRecording,
    recordingError,
  } = useRecorder();

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Start camera when component mounts
  useEffect(() => {
    requestCamera();
    return () => stopCamera();
  }, [requestCamera, stopCamera]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => {
          if (s + 1 >= MAX_RECORDING_SECONDS) {
            stopRecording();
            return s + 1;
          }
          return s + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, stopRecording]);

  // Load recorded blob into preview video element
  useEffect(() => {
    if (recordedUrl && previewVideoRef.current) {
      previewVideoRef.current.src = recordedUrl;
      previewVideoRef.current.load();
    }
  }, [recordedUrl, isSubmitting]);

  const handleStartRecording = useCallback(() => {
    if (!stream) return;
    startRecording(stream);
  }, [stream, startRecording]);

  const handleRetake = useCallback(() => {
    clearRecording();
    setSubmitError(null);
    setRecordingSeconds(0);
  }, [clearRecording]);

  const handleSubmit = useCallback(async () => {
    if (!recordedBlob || !mimeInfo) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await submitVideo(recordedBlob, mimeInfo.mimeType);
      stopCamera();
      onResult(result);
    } catch (err) {
      // No fake fallback: a failure is shown as a failure.
      setSubmitError(err instanceof ApiError ? err.message : 'Submission failed. Please try again.');
      setIsSubmitting(false);
    }
  }, [recordedBlob, mimeInfo, onResult, stopCamera]);

  // ---- Render states ----

  // While uploading, show the processing screen but KEEP this component mounted,
  // so a failed request returns to the preview with the recording intact (retry).
  if (isSubmitting) {
    return <ProcessingPage />;
  }

  if (camState === 'unsupported') {
    return <ErrorScreen title="Browser Not Supported" message={camError ?? ''} onBack={onBack} />;
  }

  if (camState === 'permission_denied') {
    return (
      <ErrorScreen
        title="Camera Permission Denied"
        message="Please allow camera access in your browser settings and reload this page."
        onBack={onBack}
        showReload
      />
    );
  }

  if (camState === 'no_camera') {
    return <ErrorScreen title="No Camera Found" message={camError ?? 'No camera was detected.'} onBack={onBack} />;
  }

  const hasRecording = !!recordedBlob;
  const showPreview = hasRecording;
  const showLive = !hasRecording;
  const progressPercent = (recordingSeconds / MAX_RECORDING_SECONDS) * 100;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        className="w-full max-w-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            id="btn-back"
            onClick={onBack}
            className="btn-secondary !px-4 !py-2 text-xs"
            aria-label="Go back to home"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {showPreview ? 'Review Your Recording' : signNumber > 1 ? `Record sign ${signNumber}` : 'Record ISL Sign'}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {showPreview
                ? 'Play it back, then submit or retake.'
                : camState === 'requesting_permission'
                  ? 'Requesting camera access...'
                  : `Record up to ${MAX_RECORDING_SECONDS} seconds`}
            </p>
          </div>
        </div>

        {/* Video container */}
        <div className="relative glass-card overflow-hidden mb-6" style={{ aspectRatio: '16/9' }}>
          {/* Live camera feed */}
          <AnimatePresence>
            {showLive && (
              <motion.video
                ref={videoRef}
                id="camera-preview"
                className="w-full h-full object-cover rounded-2xl"
                style={{ transform: 'scaleX(-1)' }} // mirror for natural feel
                autoPlay
                playsInline
                muted
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-label="Live camera preview"
              />
            )}
          </AnimatePresence>

          {/* Recorded video preview */}
          <AnimatePresence>
            {showPreview && (
              <motion.video
                ref={previewVideoRef}
                id="recorded-preview"
                className="w-full h-full object-cover rounded-2xl"
                controls
                playsInline
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-label="Recorded sign preview"
              />
            )}
          </AnimatePresence>

          {/* Loading overlay */}
          {(camState === 'requesting_permission' || camState === 'idle') && !showPreview && (
            <div className="absolute inset-0 flex items-center justify-center bg-brand-900/80 rounded-2xl">
              <div className="text-center">
                <motion.div
                  className="w-12 h-12 rounded-full border-2 border-accent border-t-transparent mx-auto mb-3"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <p className="text-text-muted text-sm">Starting camera…</p>
              </div>
            </div>
          )}

          {/* Camera error overlay */}
          {camState === 'error' && camError && !showPreview && (
            <div className="absolute inset-0 flex items-center justify-center bg-brand-900/90 rounded-2xl">
              <p className="text-error text-sm text-center px-4">{camError}</p>
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
              <span className="recording-dot w-3 h-3 rounded-full bg-red-500 block" aria-hidden="true" />
              <span className="text-white text-xs font-medium" aria-live="polite">
                REC {recordingSeconds}s
              </span>
            </div>
          )}

          {/* MIME type info (dev helper) */}
          {mimeInfo && !showPreview && (
            <div className="absolute bottom-4 right-4 bg-black/40 rounded-lg px-2 py-1">
              <span className="text-text-muted text-xs">{mimeInfo.extension.toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Recording progress bar */}
        {isRecording && (
          <div className="mb-4 h-1 bg-surface-elevated rounded-full overflow-hidden" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <motion.div
              className="h-full rounded-full bg-red-500"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}

        {/* Duration after recording */}
        {hasRecording && durationMs > 0 && (
          <p className="text-center text-text-muted text-xs mb-4">
            Clip length: {(durationMs / 1000).toFixed(1)}s · Format: {mimeInfo?.extension.toUpperCase()}
          </p>
        )}

        {/* Error messages */}
        <AnimatePresence>
          {(recordingError || submitError) && (
            <motion.div
              className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
            >
              {recordingError ?? submitError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-3 justify-center flex-wrap">
          {/* Before recording */}
          {!hasRecording && !isRecording && camState === 'ready' && (
            <motion.button
              id="btn-start-recording"
              className="btn-primary"
              onClick={handleStartRecording}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="w-3 h-3 rounded-full bg-red-400 block" aria-hidden="true" />
              Start Recording
            </motion.button>
          )}

          {/* While recording */}
          {isRecording && (
            <motion.button
              id="btn-stop-recording"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-sm uppercase tracking-widest bg-red-600 text-white hover:bg-red-500 active:scale-95 transition-all"
              onClick={stopRecording}
              whileTap={{ scale: 0.97 }}
            >
              <span className="w-3 h-3 rounded-sm bg-white block" aria-hidden="true" />
              Stop Recording
            </motion.button>
          )}

          {/* After recording */}
          {hasRecording && (
            <>
              <motion.button
                id="btn-retake"
                className="btn-secondary"
                onClick={handleRetake}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileTap={{ scale: 0.97 }}
              >
                ↩ Retake
              </motion.button>

              <motion.button
                id="btn-submit"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: isSubmitting ? 1 : 1.05 }}
                whileTap={{ scale: 0.97 }}
                style={{ opacity: isSubmitting ? 0.7 : 1 }}
              >
                {isSubmitting ? (
                  <>
                    <motion.span
                      className="w-4 h-4 rounded-full border-2 border-white border-t-transparent block"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    Submitting…
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <path d="M3 9l5 5 7-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Submit
                  </>
                )}
              </motion.button>
            </>
          )}
        </div>

        {/* Hint */}
        {!hasRecording && !isRecording && camState === 'ready' && (
          <p className="text-center text-text-muted text-xs mt-6">
            Sign clearly in frame · Good lighting · Max {MAX_RECORDING_SECONDS} seconds
          </p>
        )}
      </motion.div>
    </div>
  );
}

// ---- Internal error screen component ----
interface ErrorScreenProps {
  title: string;
  message: string;
  onBack: () => void;
  showReload?: boolean;
}

function ErrorScreen({ title, message, onBack, showReload }: ErrorScreenProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        className="glass-card p-8 max-w-md w-full text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="text-4xl mb-4" aria-hidden="true">📷</div>
        <h2 className="text-xl font-bold text-text-primary mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
          {title}
        </h2>
        <p className="text-text-secondary text-sm mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-center">
          <button id="btn-error-back" className="btn-secondary" onClick={onBack}>← Back</button>
          {showReload && (
            <button id="btn-reload" className="btn-primary" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
