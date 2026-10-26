import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeText, fetchHealth, submitVideo } from './client';
import { ApiError } from '../types';

const blob = new Blob(['x'], { type: 'video/webm' });

function mockFetch(impl: (...a: unknown[]) => unknown) {
  vi.stubGlobal('fetch', vi.fn(impl));
}
afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('submitVideo', () => {
  it('returns the parsed response on success', async () => {
    mockFetch(() => jsonResponse(200, { job_id: 'j1', status: 'completed', result: { text: 'Hello', is_mock: false } }));
    const r = await submitVideo(blob, 'video/webm;codecs=vp9');
    expect(r.result.text).toBe('Hello');
  });

  it('sends the clip as multipart field "video" to /api/v1/recognize', async () => {
    mockFetch(() => jsonResponse(200, { job_id: 'j', status: 'completed', result: {} }));
    await submitVideo(blob, 'video/mp4');
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/recognize');
    expect((init.body as FormData).get('video')).toBeInstanceOf(File);
    expect(((init.body as FormData).get('video') as File).name).toBe('recording.mp4');
  });

  it('turns a server error body into an ApiError with the stable code', async () => {
    mockFetch(() => jsonResponse(422, { error: 'No movement detected.', code: 'NO_SIGN_DETECTED' }));
    await expect(submitVideo(blob, 'video/webm')).rejects.toMatchObject({
      name: 'ApiError', code: 'NO_SIGN_DETECTED', status: 422, message: 'No movement detected.',
    });
  });

  it('reports an unreachable server as NETWORK (no fake result)', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const err = await submitVideo(blob, 'video/webm').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('NETWORK');
  });

  it('reports an aborted request as TIMEOUT', async () => {
    mockFetch(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const err = await submitVideo(blob, 'video/webm').catch(e => e);
    expect(err.code).toBe('TIMEOUT');
  });

  it('handles a non-JSON error page', async () => {
    mockFetch(() => Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 })));
    const err = await submitVideo(blob, 'video/webm').catch(e => e);
    expect(err.code).toBe('HTTP_ERROR');
    expect(err.status).toBe(502);
  });
});

describe('composeText', () => {
  it('posts the labels as JSON', async () => {
    mockFetch(() => jsonResponse(200, { text: 'I want water.', text_method: 'template', emphasis: ['water'] }));
    const r = await composeText(['I', 'WANT', 'WATER']);
    expect(r.text).toBe('I want water.');
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ labels: ['I', 'WANT', 'WATER'] });
  });
});

describe('fetchHealth', () => {
  it('never throws when the backend is down', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const h = await fetchHealth();
    expect(h.backendReachable).toBe(false);
    expect(h.labels).toEqual([]);
  });

  it('reads model mode and labels from the health answer', async () => {
    mockFetch(() => jsonResponse(200, {
      status: 'ok', ml_service: { status: 'ok', model: { mode: 'real', labels: ['HELLO', 'YES'] } }, collect_enabled: true,
    }));
    const h = await fetchHealth();
    expect(h).toMatchObject({ backendReachable: true, mlReachable: true, mode: 'real', labels: ['HELLO', 'YES'], collectEnabled: true });
  });

  it('reports a degraded state when Python is down', async () => {
    mockFetch(() => jsonResponse(503, { status: 'degraded', ml_service: { status: 'unreachable' } }));
    const h = await fetchHealth();
    expect(h.backendReachable).toBe(true);
    expect(h.mlReachable).toBe(false);
  });
});
