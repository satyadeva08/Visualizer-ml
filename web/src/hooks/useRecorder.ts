// =============================================================
// VISUALISER — useRecorder hook
// Manages MediaRecorder lifecycle on top of a camera stream
// =============================================================

import { useCallback, useRef, useState } from 'react';
import type { MimeTypeInfo } from '../types';

interface UseRecorderReturn {
  isRecording: boolean;
  recordedBlob: Blob | null;
  recordedUrl: string | null;
  mimeInfo: MimeTypeInfo | null;
  durationMs: number;
  startRecording: (stream: MediaStream) => boolean;
  stopRecording: () => void;
  clearRecording: () => void;
  recordingError: string | null;
}

/**
 * WHAT: Manages the MediaRecorder that captures video from the camera stream.
 * WHY:  MediaRecorder has browser-specific MIME type support. We must detect what
 *       the current browser actually supports instead of hardcoding "video/webm".
 *       On iOS Safari, only mp4/quicktime is supported. On Chrome, webm/vp9 works.
 * HOW:  We try a prioritized list of MIME types, take the first supported one,
 *       collect chunks into an array, and create a Blob when recording stops.
 */

/** Ordered list of MIME types to try — most compatible first */
const MIME_TYPE_PRIORITY = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/ogg;codecs=theora,opus',
  'video/ogg',
];

export function detectSupportedMimeType(): MimeTypeInfo | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mimeType of MIME_TYPE_PRIORITY) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      const ext = mimeType.startsWith('video/mp4') ? 'mp4'
        : mimeType.startsWith('video/webm') ? 'webm'
        : mimeType.startsWith('video/ogg') ? 'ogv'
        : 'video';
      return { mimeType, extension: ext, supported: true };
    }
  }
  return null;
}

export function useRecorder(): UseRecorderReturn {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const objectUrlRef = useRef<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [mimeInfo, setMimeInfo] = useState<MimeTypeInfo | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const startRecording = useCallback((stream: MediaStream): boolean => {
    setRecordingError(null);

    if (!window.MediaRecorder) {
      setRecordingError('MediaRecorder is not supported by this browser.');
      return false;
    }

    const detected = detectSupportedMimeType();
    if (!detected) {
      setRecordingError('No supported video recording format found in this browser.');
      return false;
    }

    setMimeInfo(detected);
    chunksRef.current = [];

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: detected.mimeType,
        videoBitsPerSecond: 2_000_000, // 2 Mbps — good quality, reasonable size
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const duration = Date.now() - startTimeRef.current;
        setDurationMs(duration);

        const blob = new Blob(chunksRef.current, { type: detected.mimeType });

        // Revoke previous URL if any
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        setRecordedBlob(blob);
        setRecordedUrl(url);
        setIsRecording(false);
      };

      recorder.onerror = (event) => {
        setRecordingError(`Recording error: ${(event as ErrorEvent).message ?? 'Unknown error'}`);
        setIsRecording(false);
      };

      // Request data every 250ms for smooth chunks
      recorder.start(250);
      startTimeRef.current = Date.now();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown recording error';
      setRecordingError(`Failed to start recording: ${msg}`);
      return false;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const clearRecording = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDurationMs(0);
    setMimeInfo(null);
    setRecordingError(null);
    chunksRef.current = [];
  }, []);

  return {
    isRecording,
    recordedBlob,
    recordedUrl,
    mimeInfo,
    durationMs,
    startRecording,
    stopRecording,
    clearRecording,
    recordingError,
  };
}
