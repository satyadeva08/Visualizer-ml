// =============================================================
// VISUALISER — useCamera hook
// Manages getUserMedia stream lifecycle
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingState } from '../types';

interface UseCameraReturn {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  state: RecordingState;
  error: string | null;
  requestCamera: () => Promise<void>;
  stopCamera: () => void;
}

/**
 * WHAT: Manages the camera stream via navigator.mediaDevices.getUserMedia.
 * WHY:  The camera must be started, kept alive during recording, and stopped when no longer needed.
 *       Managing this in a hook keeps the CameraPage component clean.
 * HOW:  Calls getUserMedia with video+audio constraints, attaches to a <video> ref,
 *       handles all error cases (denied, no camera, unsupported browser).
 */
export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);

  const requestCamera = useCallback(async () => {
    // Check browser support first
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('unsupported');
      // Browsers hide the camera API on plain-HTTP pages (except localhost).
      setError(
        window.isSecureContext === false
          ? 'The camera needs a secure (HTTPS) connection. Open this page with https:// — see docs/DEVELOPMENT_SETUP.md (phone testing).'
          : 'Your browser does not support camera access. Please use a recent Chrome, Edge, Firefox or Safari.'
      );
      return;
    }

    setState('requesting_permission');
    setError(null);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user', // front camera
        },
        audio: false, // ISL recognition does not need audio
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }

      setState('ready');
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setState('permission_denied');
          setError('Camera permission was denied. Please allow camera access and reload the page.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setState('no_camera');
          setError('No camera was found on this device.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setState('error');
          setError('Camera is in use by another application. Please close it and try again.');
        } else if (err.name === 'OverconstrainedError') {
          setState('error');
          setError('Camera does not support the requested resolution. Trying with lower constraints...');
          // Retry with minimal constraints
          try {
            const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            streamRef.current = fallback;
            setStream(fallback);
            if (videoRef.current) {
              videoRef.current.srcObject = fallback;
              await videoRef.current.play();
            }
            setState('ready');
            setError(null);
          } catch {
            setState('error');
            setError('Camera initialization failed even with minimal settings.');
          }
        } else {
          setState('error');
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setState('error');
        setError('An unexpected error occurred while accessing the camera.');
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState('idle');
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return { videoRef, stream, state, error, requestCamera, stopCamera };
}
