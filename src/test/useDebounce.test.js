import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../hooks/useDebounce.js';

// Phase 6.5 hardening (closes Prompt 11 audit finding 10.3, MEDIUM)
describe('useDebounce (Prompt 11 audit, 10.3)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('a', 250));
    expect(result.current).toBe('a');
  });

  it('does not update until the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 250), { initialProps: { value: 'a' } });
    rerender({ value: 'ab' });
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('a');
  });

  it('updates to the latest value once the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 250), { initialProps: { value: 'a' } });
    rerender({ value: 'ab' });
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe('ab');
  });

  it('resets the timer on each change, only settling on the final value (real keystroke behaviour)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 250), { initialProps: { value: '' } });
    rerender({ value: 'a' });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ value: 'ab' });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ value: 'abc' });
    act(() => { vi.advanceTimersByTime(100); });
    // 300ms of real elapsed time, but each keystroke reset the 250ms
    // window, so nothing has settled yet.
    expect(result.current).toBe('');
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe('abc');
  });
});
