import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectSupportedMimeType, useRecorder } from './useRecorder';

/** Minimal MediaRecorder double that supports only the MIME types in `supported`. */
function installFakeRecorder(supported: string[]) {
  class FakeRecorder {
    static isTypeSupported = (t: string) => supported.includes(t);
    state: 'inactive' | 'recording' = 'inactive';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    constructor(public stream: unknown, public options: { mimeType: string }) {}
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['abc'], { type: this.options.mimeType }) });
      this.onstop?.();
    }
  }
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe('detectSupportedMimeType', () => {
  it('picks the first supported type in priority order', () => {
    installFakeRecorder(['video/mp4', 'video/webm']);
    expect(detectSupportedMimeType()).toMatchObject({ mimeType: 'video/webm', extension: 'webm' });
  });

  it('falls back to mp4 on browsers without webm (e.g. iOS Safari)', () => {
    installFakeRecorder(['video/mp4']);
    expect(detectSupportedMimeType()).toMatchObject({ mimeType: 'video/mp4', extension: 'mp4' });
  });

  it('returns null when nothing is supported', () => {
    installFakeRecorder([]);
    expect(detectSupportedMimeType()).toBeNull();
  });
});

describe('useRecorder state transitions', () => {
  it('idle -> recording -> recorded -> cleared', () => {
    installFakeRecorder(['video/webm']);
    const { result } = renderHook(() => useRecorder());
    expect(result.current.isRecording).toBe(false);

    let started = false;
    act(() => { started = result.current.startRecording({} as MediaStream); });
    expect(started).toBe(true);
    expect(result.current.isRecording).toBe(true);

    act(() => result.current.stopRecording());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.recordedBlob).toBeInstanceOf(Blob);
    expect(result.current.recordedUrl).toBe('blob:fake');

    act(() => result.current.clearRecording());
    expect(result.current.recordedBlob).toBeNull();
  });

  it('reports an error instead of crashing when no format is supported', () => {
    installFakeRecorder([]);
    const { result } = renderHook(() => useRecorder());
    let started = true;
    act(() => { started = result.current.startRecording({} as MediaStream); });
    expect(started).toBe(false);
    expect(result.current.recordingError).toMatch(/No supported video recording format/);
  });
});
