import { useLayoutEffect, useState } from 'react';

// Phase 7.5C — root cause of the notification/org-switcher popovers
// rendering off-screen: both were unconditionally anchored
// top:"calc(100% + 6px)", left:0 with a fixed maxHeight, on triggers that
// live in the sidebar's own bottom-left footer (a few px above the
// viewport's bottom edge by construction) or a mobile header's top-right
// corner. There was never enough room below/to the right for that fixed
// assumption to hold — no zoom level or screen size "breaks" it, it was
// always going to overflow from that position. Rather than a hard-coded
// offset for one trigger, this computes real available space against the
// viewport on open (and on resize/scroll, which also fires on browser zoom
// changes since window.innerWidth/innerHeight are already zoom-aware) and
// flips direction/alignment only when the default side is tighter than the
// opposite one — most popovers on most screens still open exactly as
// before, this only engages near an edge.
export function usePopoverPosition(triggerRef, open, { gap = 6, margin = 12, minHeight = 160 } = {}) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) { setStyle(null); return; }
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const spaceBelow = vh - rect.bottom - gap - margin;
      const spaceAbove = rect.top - gap - margin;
      const openUp = spaceBelow < minHeight && spaceAbove > spaceBelow;
      const spaceRight = vw - rect.left - margin;
      const spaceLeft = rect.right - margin;
      const alignRight = spaceRight < minHeight && spaceLeft > spaceRight;
      setStyle({
        position: "fixed",
        ...(openUp ? { bottom: vh - rect.top + gap } : { top: rect.bottom + gap }),
        ...(alignRight ? { right: vw - rect.right } : { left: rect.left }),
        maxHeight: Math.max(minHeight, openUp ? spaceAbove : spaceBelow),
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open, triggerRef, gap, margin, minHeight]);

  return style;
}
