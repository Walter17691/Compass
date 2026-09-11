import { describe, it, expect } from 'vitest';
import { safeJson } from '../lib/safeJson.js';

// Production incident (2026-09-11) — a stale client called a route that
// no longer existed after an API consolidation deploy; Vercel's own
// text/plain 404 page ("The page could not be found...") reached
// response.json() directly and threw a raw parser error straight to the
// user. safeJson() is the one-line guard that turns any non-JSON
// response into a message a user can act on, regardless of why the
// response wasn't JSON (404 page, proxy error, deploy-timing 502, etc).
function fakeResponse(contentType, body) {
  return { headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) }, json: () => Promise.resolve(body) };
}

describe('safeJson', () => {
  it('parses a genuine application/json response normally', async () => {
    const r = fakeResponse('application/json; charset=utf-8', { success: true });
    await expect(safeJson(r)).resolves.toEqual({ success: true });
  });

  it('throws a safe, actionable message for a text/plain response instead of a raw parser error', async () => {
    const r = fakeResponse('text/plain; charset=utf-8', undefined);
    await expect(safeJson(r)).rejects.toThrow('Unexpected response from the server — please try again.');
  });

  it('falls back to parsing when a real fetch() response has a headers object but no Content-Type header (cannot positively confirm non-JSON, so does not guess)', async () => {
    const r = fakeResponse(null, { success: true });
    await expect(safeJson(r)).resolves.toEqual({ success: true });
  });

  it('falls back to parsing when the response has no headers object at all (this codebase\'s common test-mock shape)', async () => {
    const r = { json: () => Promise.resolve({ success: true }) };
    await expect(safeJson(r)).resolves.toEqual({ success: true });
  });
});
