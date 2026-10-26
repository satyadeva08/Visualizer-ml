// =============================================================
// VISUALISER — shared TypeScript types (mirror docs/API_CONTRACT.md)
// =============================================================

export type AppPage = 'home' | 'camera' | 'processing' | 'result' | 'collect';

/** One recognised (or candidate) sign. */
export interface Sign {
  label: string;
  /** Classifier probability in [0,1] or null. A model score, NOT a measured accuracy. */
  confidence: number | null;
}

export type Outcome = 'recognized' | 'unknown_sign';

/** Result block returned by POST /api/v1/recognize */
export interface MLResult {
  signs: Sign[];                // EMPTY when outcome === 'unknown_sign'
  text: string;
  text_method: 'single_sign' | 'template' | 'fallback_list' | 'none' | string;
  emphasis: string[];           // words that come from recognised signs
  outcome: Outcome;
  reason: string | null;        // LOW_CONFIDENCE | NO_KNOWN_SIGN | null
  alternatives: Sign[];
  timings: Record<string, number>;
  processing_time_ms?: number;
  backend_total_ms?: number;
  /** true ONLY when the ML service runs in explicit mock mode. */
  is_mock: boolean;
}

export interface RecognitionResponse {
  job_id: string;
  status: 'completed';
  result: MLResult;
}

export interface ComposeResult {
  text: string;
  text_method: string;
  emphasis: string[];
}

/** Error body of every endpoint. */
export interface ApiErrorBody {
  error: string;
  code: string;
}

/** Thrown by the API client. `code` is stable and machine-readable. */
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export type ModelMode = 'real' | 'mock' | 'unavailable';

/** Summary of GET /api/v1/health used by the UI. Never throws. */
export interface HealthInfo {
  backendReachable: boolean;
  mlReachable: boolean;
  mode: ModelMode | null;
  labels: string[];
  collectEnabled: boolean;
}

export type RecordingState =
  | 'idle'
  | 'requesting_permission'
  | 'permission_denied'
  | 'no_camera'
  | 'unsupported'
  | 'ready'
  | 'recording'
  | 'recorded'
  | 'submitting'
  | 'error';

export interface MimeTypeInfo {
  mimeType: string;
  extension: string;
  supported: boolean;
}
