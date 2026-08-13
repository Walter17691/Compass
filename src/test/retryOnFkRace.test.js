import { describe, it, expect, vi } from 'vitest';
import { withFkRetry } from '../lib/retryOnFkRace';

describe('withFkRetry', () => {
  it('returns immediately on success, no retry', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const result = await withFkRetry(insertFn, { delayMs: 0 });
    expect(result.error).toBeNull();
    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it('retries once on a foreign key violation (23503)', async () => {
    const insertFn = vi.fn()
      .mockResolvedValueOnce({ error: { code: '23503', message: 'violates foreign key constraint' } })
      .mockResolvedValueOnce({ error: null });
    const result = await withFkRetry(insertFn, { delayMs: 0 });
    expect(result.error).toBeNull();
    expect(insertFn).toHaveBeenCalledTimes(2);
  });

  it('retries once on a row-level security violation (42501)', async () => {
    const insertFn = vi.fn()
      .mockResolvedValueOnce({ error: { code: '42501', message: 'new row violates row-level security policy' } })
      .mockResolvedValueOnce({ error: null });
    const result = await withFkRetry(insertFn, { delayMs: 0 });
    expect(result.error).toBeNull();
    expect(insertFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on a non-FK, non-RLS error', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });
    const result = await withFkRetry(insertFn, { delayMs: 0 });
    expect(result.error.code).toBe('23505');
    expect(insertFn).toHaveBeenCalledTimes(1);
  });

  it('surfaces the error if the retry also fails', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: { code: '23503', message: 'still missing' } });
    const result = await withFkRetry(insertFn, { delayMs: 0 });
    expect(result.error.code).toBe('23503');
    expect(insertFn).toHaveBeenCalledTimes(2);
  });
});
