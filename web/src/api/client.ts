// =============================================================
// VISUALISER — API client (talks to the Go backend through /api)
// In development Vite proxies /api -> Go, so the phone only ever talks to the
// Vite origin (HTTPS) and never directly to Go or Python.
// =============================================================

import { ApiError } from '../types';
import type {
  ApiErrorBody, ComposeResult, HealthInfo, ModelMode, RecognitionResponse,
} from '../types';

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';
const RECOGNIZE_TIMEOUT_MS = 60_000;

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogv';
  if (mimeType.includes('quicktime')) return 'mov';
  return 'video';
}

/** fetch + JSON + uniform error handling. Throws ApiError, never a raw TypeError. */
async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('The request timed out. The server took too long to answer.', 'TIMEOUT', 0);
    }
    throw new ApiError(
      'Cannot reach the VISUALISER server. Make sure the backend is running.', 'NETWORK', 0);
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON body: handled below */
  }

  if (!response.ok) {
    const e = body as Partial<ApiErrorBody> | null;
    throw new ApiError(
      e?.error ?? `Server error (${response.status})`, e?.code ?? 'HTTP_ERROR', response.status);
  }
  if (body === null) {
    throw new ApiError('The server returned an unreadable answer.', 'BAD_RESPONSE', response.status);
  }
  return body as T;
}

/** Submit a recorded clip for recognition. */
export function submitVideo(blob: Blob, mimeType: string): Promise<RecognitionResponse> {
  const form = new FormData();
  form.append('video', blob, `recording.${extensionFor(mimeType)}`);
  return request<RecognitionResponse>('/api/v1/recognize', { method: 'POST', body: form }, RECOGNIZE_TIMEOUT_MS);
}

/** Build a grounded sentence from several recognised labels. */
export function composeText(labels: string[]): Promise<ComposeResult> {
  return request<ComposeResult>('/api/v1/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels }),
  }, 10_000);
}

/** Health summary for the UI. Never throws. */
export async function fetchHealth(): Promise<HealthInfo> {
  const down: HealthInfo = {
    backendReachable: false, mlReachable: false, mode: null, labels: [], collectEnabled: false,
  };
  try {
    const res = await fetch(`${BASE_URL}/api/v1/health`, { signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    const model = j?.ml_service?.model ?? {};
    return {
      backendReachable: true,
      mlReachable: j?.ml_service?.status === 'ok',
      mode: (model.mode as ModelMode | undefined) ?? null,
      labels: Array.isArray(model.labels) ? model.labels : [],
      collectEnabled: j?.collect_enabled === true,
    };
  } catch {
    return down;
  }
}

// ---- data collection (development only; backend must run with ENABLE_COLLECT=1) ----

export interface CollectSaved {
  saved: boolean;
  label: string;
  session: string;
  count_for_label: number;
  motion_peak: number | null;
}

export function submitCollectClip(
  blob: Blob, mimeType: string, label: string, session: string,
): Promise<CollectSaved> {
  const form = new FormData();
  form.append('label', label);
  form.append('session', session);
  form.append('video', blob, `clip.${extensionFor(mimeType)}`);
  return request<CollectSaved>('/api/v1/collect', { method: 'POST', body: form }, 60_000);
}

export function fetchCollectStats(): Promise<{ counts: Record<string, number> }> {
  return request('/api/v1/collect/stats', { method: 'GET' }, 10_000);
}
