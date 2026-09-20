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

// Issue C (Human UAT) — a prep pack cut off at max_tokens was being rendered
// as if it had finished, because the message_delta event carrying stop_reason
// was parsed and discarded. The provider's own end reason is now surfaced.
// These tests also pin the ADDITIVE contract: every existing caller passes no
// onComplete and must be completely unaffected.
describe('streamClaude — provider completion signal (Issue C1)', () => {
  beforeEach(() => { authedFetch.mockReset(); });

  const streamOf = (lines) => {
    const encoder = new TextEncoder();
    let i = 0;
    authedFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: () => Promise.resolve(i < lines.length ? { done: false, value: encoder.encode(lines[i++]) } : { done: true, value: undefined }) }) },
    });
  };
  const TEXT = 'data: {"type":"content_block_delta","delta":{"text":"body"}}\n\n';
  const endTurn = 'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n';
  const maxTokens = 'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n';

  it('C1a. reports truncated:true when the provider stopped at max_tokens', async () => {
    streamOf([TEXT, maxTokens]);
    const onComplete = vi.fn();
    await streamClaude('s', 'u', vi.fn(), 2048, onComplete);
    expect(onComplete).toHaveBeenCalledWith({ stopReason: 'max_tokens', truncated: true });
  });

  it('C1b. reports truncated:false for a clean end_turn completion', async () => {
    streamOf([TEXT, endTurn]);
    const onComplete = vi.fn();
    await streamClaude('s', 'u', vi.fn(), 2048, onComplete);
    expect(onComplete).toHaveBeenCalledWith({ stopReason: 'end_turn', truncated: false });
  });

  it('C1c. still returns the accumulated text (not an object) when truncated', async () => {
    streamOf([TEXT, maxTokens]);
    const result = await streamClaude('s', 'u', vi.fn(), 2048, vi.fn());
    expect(result).toBe('body');
  });

  it('C1d. truncation is taken from the provider signal, never inferred from length', async () => {
    // A very long body that completed cleanly must NOT be reported truncated.
    const long = `data: {"type":"content_block_delta","delta":{"text":"${'x'.repeat(4000)}"}}\n\n`;
    streamOf([long, endTurn]);
    const onComplete = vi.fn();
    await streamClaude('s', 'u', vi.fn(), 2048, onComplete);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ truncated: false }));
    // And a very short body that was cut off MUST be reported truncated.
    streamOf(['data: {"type":"content_block_delta","delta":{"text":"hi"}}\n\n', maxTokens]);
    const onComplete2 = vi.fn();
    await streamClaude('s', 'u', vi.fn(), 2048, onComplete2);
    expect(onComplete2).toHaveBeenCalledWith(expect.objectContaining({ truncated: true }));
  });

  it('C1e. reports stopReason:null when the provider sent no completion event', async () => {
    streamOf([TEXT]);
    const onComplete = vi.fn();
    await streamClaude('s', 'u', vi.fn(), 2048, onComplete);
    expect(onComplete).toHaveBeenCalledWith({ stopReason: null, truncated: false });
  });

  it('C1f. onComplete never fires when the request itself failed (FAILED stays an exception)', async () => {
    authedFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('{}') });
    const onComplete = vi.fn();
    await expect(streamClaude('s', 'u', vi.fn(), 2048, onComplete)).rejects.toThrow(/500/);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('C1g. ADDITIVE: existing three-argument callers are unaffected by the new event', async () => {
    streamOf([TEXT, maxTokens]);
    const onChunk = vi.fn();
    const result = await streamClaude('s', 'u', onChunk);
    expect(result).toBe('body');
    expect(onChunk).toHaveBeenCalledWith('body');
  });

  it('C1h. ADDITIVE: existing four-argument callers keep their custom maxTokens behaviour', async () => {
    streamOf([TEXT, endTurn]);
    const result = await streamClaude('s', 'u', vi.fn(), 3400);
    expect(result).toBe('body');
    expect(JSON.parse(authedFetch.mock.calls[0][1].body).max_tokens).toBe(3400);
  });

  it('C1i. the default output budget is still 2048', async () => {
    streamOf([TEXT, endTurn]);
    await streamClaude('s', 'u', vi.fn());
    expect(JSON.parse(authedFetch.mock.calls[0][1].body).max_tokens).toBe(2048);
  });

  it('C1j. a message_delta carrying no stop_reason does not disturb the text', async () => {
    streamOf([TEXT, 'data: {"type":"message_delta","delta":{"usage":{"output_tokens":12}}}\n\n']);
    const onComplete = vi.fn();
    const result = await streamClaude('s', 'u', vi.fn(), 2048, onComplete);
    expect(result).toBe('body');
    expect(onComplete).toHaveBeenCalledWith({ stopReason: null, truncated: false });
  });
});
