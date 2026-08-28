import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePopoverPosition } from '../hooks/usePopoverPosition';

// Phase 7.5C — root cause of the notification/org-switcher popover overflow
// was a hard-coded top:"calc(100% + 6px)", left:0 with no awareness of
// where the trigger actually sits in the viewport. This tests the
// replacement positioning logic directly against real viewport geometry
// (mocked here), independent of any one component that consumes it.
describe('usePopoverPosition', () => {
  const setViewport = (width, height) => {
    window.innerWidth = width;
    window.innerHeight = height;
  };
  const triggerRefAt = (rect) => ({ current: { getBoundingClientRect: () => rect } });

  afterEach(() => {
    setViewport(1024, 768);
  });

  it('returns null while closed or before a trigger is mounted', () => {
    const ref = triggerRefAt({ top: 100, bottom: 120, left: 100, right: 140 });
    const { result } = renderHook(() => usePopoverPosition(ref, false));
    expect(result.current).toBeNull();
  });

  it('opens downward and left-aligned when there is ample room below and to the right (the common case)', () => {
    setViewport(1400, 900);
    const ref = triggerRefAt({ top: 100, bottom: 130, left: 100, right: 160 });
    const { result } = renderHook(() => usePopoverPosition(ref, true));
    expect(result.current.position).toBe('fixed');
    expect(result.current.top).toBe(136); // bottom(130) + gap(6)
    expect(result.current.left).toBe(100);
    expect(result.current.bottom).toBeUndefined();
    expect(result.current.right).toBeUndefined();
  });

  it('flips upward when the trigger sits near the bottom of the viewport (the sidebar footer bug)', () => {
    // Trigger 40px from the bottom of a 768-tall viewport, mirroring the
    // ActivityBell/OrgSwitcher footer position inside a height:100vh sidebar.
    setViewport(1024, 768);
    const ref = triggerRefAt({ top: 728, bottom: 748, left: 20, right: 60 });
    const { result } = renderHook(() => usePopoverPosition(ref, true));
    expect(result.current.bottom).toBeDefined();
    expect(result.current.top).toBeUndefined();
    // Anchored to the trigger's own top edge, opening upward.
    expect(result.current.bottom).toBe(768 - 728 + 6);
    expect(result.current.maxHeight).toBeGreaterThanOrEqual(160);
  });

  it('flips to right-aligned when the trigger sits near the right edge of the viewport', () => {
    setViewport(1024, 768);
    const ref = triggerRefAt({ top: 10, bottom: 40, left: 990, right: 1010 });
    const { result } = renderHook(() => usePopoverPosition(ref, true));
    expect(result.current.right).toBeDefined();
    expect(result.current.left).toBeUndefined();
    expect(result.current.right).toBe(1024 - 1010);
  });

  it('never returns a maxHeight below the configured floor, even in a very short viewport', () => {
    setViewport(1024, 300);
    const ref = triggerRefAt({ top: 260, bottom: 290, left: 20, right: 60 });
    const { result } = renderHook(() => usePopoverPosition(ref, true, { minHeight: 160 }));
    expect(result.current.maxHeight).toBeGreaterThanOrEqual(160);
  });

  it('recomputes when the window resizes (covers browser zoom, which changes window.innerWidth/innerHeight)', () => {
    setViewport(1400, 900);
    const ref = triggerRefAt({ top: 100, bottom: 130, left: 100, right: 160 });
    const { result } = renderHook(() => usePopoverPosition(ref, true));
    expect(result.current.top).toBeDefined();
    expect(result.current.bottom).toBeUndefined();

    // Simulate zooming in enough that the trigger is now effectively near
    // the bottom of a much smaller viewport (innerHeight shrinks as CSS-px
    // zoom increases).
    setViewport(1400, 160);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(result.current.bottom).toBeDefined();
  });
});
