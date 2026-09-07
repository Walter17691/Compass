import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));

const { authedFetch } = await import('../lib/authedFetch');
const { streamClaude } = await import('../lib/streamClaude.js');

// Release 1.0 UAT remediation (Defects #4/#5) — streamClaude is the
// shared helper behind meeting record generation, prep packs, letter
// drafting, and most other AI features in App.jsx. This is the layer
// that first decides "did the provider actually succeed" — every caller
// relies on it never letting a failed response reach onChunk as if it
// were real content. PROVIDER ERROR != GENERATED CONTENT.
describe('streamClaude — safe failure contract', () => {
  beforeEach(() => { authedFetch.mockReset(); });

  it('throws before calling onChunk when the response is not ok (e.g. 401 invalid API key)', async () => {
    authedFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve('{"ok":false,"error":{"code":"AI_UNAVAILABLE","message":"Compass AI is temporarily unavailable. Please try again shortly."}}'),
    });
    const onChunk = vi.fn();
    await expect(streamClaude('system', 'user', onChunk)).rejects.toThrow(/502/);
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('throws on a 429/500 response the same way, never calling onChunk', async () => {
    for (const status of [429, 500]) {
      authedFetch.mockResolvedValue({ ok: false, status, text: () => Promise.resolve('{"ok":false}') });
      const onChunk = vi.fn();
      await expect(streamClaude('system', 'user', onChunk)).rejects.toThrow(new RegExp(String(status)));
      expect(onChunk).not.toHaveBeenCalled();
    }
  });

  it('streams real content chunk by chunk on success', async () => {
    const encoder = new TextEncoder();
    const lines = [
      'data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"text":" world"}}\n\n',
    ];
    let i = 0;
    authedFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: () => Promise.resolve(i < lines.length ? { done: false, value: encoder.encode(lines[i++]) } : { done: true, value: undefined }) }) },
    });
    const onChunk = vi.fn();
    const result = await streamClaude('system', 'user', onChunk);
    expect(result).toBe('Hello world');
    expect(onChunk).toHaveBeenCalledWith('Hello');
    expect(onChunk).toHaveBeenCalledWith('Hello world');
  });

  it('does not crash on a malformed/partial SSE line mid-stream', async () => {
    const encoder = new TextEncoder();
    const lines = [
      'data: {"type":"content_block_delta","delta":{"text":"ok"}}\n\n',
      'data: not-valid-json\n\n',
    ];
    let i = 0;
    authedFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: () => Promise.resolve(i < lines.length ? { done: false, value: encoder.encode(lines[i++]) } : { done: true, value: undefined }) }) },
    });
    const onChunk = vi.fn();
    const result = await streamClaude('system', 'user', onChunk);
    expect(result).toBe('ok');
  });

  it('resolves to an empty string for a stream that completes with no content deltas at all', async () => {
    authedFetch.mockResolvedValue({ ok: true, body: { getReader: () => ({ read: () => Promise.resolve({ done: true, value: undefined }) }) } });
    const onChunk = vi.fn();
    const result = await streamClaude('system', 'user', onChunk);
    expect(result).toBe('');
    expect(onChunk).not.toHaveBeenCalled();
  });
});
