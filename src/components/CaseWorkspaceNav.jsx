import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { splitForWidth, WORKSPACE_MORE_LABEL } from '../lib/caseWorkspace';
import { COLOR, TYPE, RADIUS, FONT } from '../styles/tokens';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 corrective — horizontal case navigation.
//
// The vertical accordion read as a settings screen: opening and closing tall
// rows, scrolling past what you did not want. This is the workspace bar that
// replaces it — a human product decision, with the DESTINATIONS derived from the
// classification in lib/caseWorkspace.js rather than from the old row list.
//
// ┌─ RESPONSIVE BEHAVIOUR IS THE HARD PART ─────────────────────────────────┐
// │ The bar must never wrap into an unusable stack of half-labels, and must  │
// │ never quietly become the accordion again when the window narrows. It     │
// │ measures itself and moves the rightmost destinations into "More", which  │
// │ already holds the genuinely secondary ones. Order never reshuffles, so   │
// │ a destination does not jump position as the window resizes.              │
// │                                                                          │
// │ Measurement happens in a layout effect against the real rendered widths, │
// │ so it does not depend on a guessed character count. With no layout       │
// │ information at all (jsdom, first paint) everything stays visible, which  │
// │ is the honest default: show the navigation, never hide it speculatively. │
// └─────────────────────────────────────────────────────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────

const MORE_RESERVE = 96;   // px kept clear for the "More" control itself

export function CaseWorkspaceNav({ destinations, active, onSelect }) {
  const barRef = useRef(null);
  const [maxVisible, setMaxVisible] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // Full-width measurements, kept so a narrowed bar can widen back out again.
  const widthsRef = useRef([]);
  const moreRef = useRef(null);

  const primaryCount = destinations?.primary?.length || 0;

  // Measure against real widths. A ResizeObserver keeps it correct when the
  // window changes without a re-render of this component.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const measure = () => {
      // The More control now lives OUTSIDE the measured strip, so once it is on
      // screen its width is already excluded from el.clientWidth. Reserving for it
      // again would subtract it twice and could cascade demotions on every pass.
      const reserve = moreRef.current ? 0 : MORE_RESERVE;
      const available = el.clientWidth - reserve;
      if (!available || available <= 0) return;
      const rendered = Array.from(el.querySelectorAll("[data-dest]"))
        .map(n => n.getBoundingClientRect().width);
      if (!rendered.length || rendered.every(w => w === 0)) return;   // not laid out yet

      // Measure against EVERY destination's width, not just the ones currently
      // rendered. Without this the bar is one-way: once narrowing has demoted
      // two of five, only three remain to measure, three always "fit", and
      // widening the window never brings them back. Caught on production — it
      // demoted correctly and then would not restore.
      if (rendered.length >= primaryCount) widthsRef.current = rendered;
      const widths = widthsRef.current.length >= primaryCount ? widthsRef.current : rendered;

      let used = 0, fit = 0;
      for (const w of widths) {
        if (used + w > available) break;
        used += w; fit += 1;
      }
      setMaxVisible(fit >= primaryCount ? null : fit);
    };
    widthsRef.current = [];   // a different destination set means different widths
    measure();
    // Two signals, not one. ResizeObserver is the precise one — it catches the bar
    // changing width without the window changing at all — but it is not available
    // or deliverable everywhere (it never fires under some automation contexts,
    // which is how I nearly shipped this unverified). The window resize listener
    // is the coarse backstop, so the navigation degrades to "measures on window
    // resize" rather than to "never re-measures".
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener("resize", measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [primaryCount, destinations]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = e => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    const esc = e => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [moreOpen]);

  const { visible, overflow } = splitForWidth(destinations, maxVisible);
  const activeInOverflow = overflow.some(d => d.id === active);

  const tabStyle = isActive => ({
    ...TYPE.rowContext,
    background: "none",
    border: "none",
    borderBottom: `2px solid ${isActive ? COLOR.purple : "transparent"}`,
    color: isActive ? COLOR.ink : COLOR.inkQuiet,
    fontWeight: isActive ? 700 : 500,
    padding: "10px 2px",
    marginRight: 22,
    cursor: "pointer",
    fontFamily: FONT.sans,
    whiteSpace: "nowrap",
    flexShrink: 0,
  });

  return (
    // ┌─ WHY THIS IS TWO ELEMENTS AND NOT ONE ─────────────────────────────────┐
    // │ The tab strip needs overflow:hidden so a tab that no longer fits is    │
    // │ clipped rather than spilling. The dropdown is absolutely positioned at │
    // │ top:100% — i.e. OUTSIDE that box — so when both lived on the same      │
    // │ element the menu was clipped away entirely: present in the DOM,        │
    // │ invisible on screen, and not hit-testable. Human UAT found it; my own  │
    // │ verification missed it because jsdom does not implement clipping and   │
    // │ because I asserted the menu's presence rather than its visibility.     │
    // │                                                                        │
    // │ So: the outer row is NOT clipped and owns the dropdown; only the inner │
    // │ strip clips.                                                           │
    // └────────────────────────────────────────────────────────────────────────┘
    <div style={{display:"flex",alignItems:"center",gap:0,
                 borderBottom:`1px solid ${COLOR.borderFaint}`,position:"relative"}}>
      <div ref={barRef} role="tablist" aria-label="Case workspace"
        style={{display:"flex",alignItems:"center",gap:0,overflow:"hidden",flex:"1 1 auto",minWidth:0}}>
        {visible.map(d => (
          <button key={d.id} data-dest={d.id} type="button" role="tab"
            aria-selected={active === d.id}
            onClick={() => onSelect(d.id)}
            style={tabStyle(active === d.id)}>
            {d.label}{typeof d.count === "number" && d.count > 0 ? ` (${d.count})` : ""}
          </button>
        ))}
      </div>

      {overflow.length > 0 && (
        <div ref={moreRef} style={{marginLeft:"auto",position:"relative",flexShrink:0}}>
          <button type="button" aria-haspopup="menu" aria-expanded={moreOpen}
            onClick={() => setMoreOpen(v => !v)}
            style={{...tabStyle(activeInOverflow), marginRight: 0}}>
            {WORKSPACE_MORE_LABEL} ▾
          </button>
          {moreOpen && (
            <div role="menu" aria-label="More case destinations"
              style={{position:"absolute",right:0,top:"100%",zIndex:40,minWidth:220,
                      background:COLOR.surface,border:`1px solid ${COLOR.border}`,
                      borderRadius:RADIUS.surface,boxShadow:"0 8px 24px rgba(26,21,53,0.10)",padding:6}}>
              {overflow.map(d => (
                <button key={d.id} type="button" role="menuitem"
                  onClick={() => { onSelect(d.id); setMoreOpen(false); }}
                  style={{...TYPE.rowContext,display:"block",width:"100%",textAlign:"left",
                          background: active === d.id ? COLOR.paper : "none",
                          border:"none",borderRadius:6,padding:"8px 10px",
                          color: active === d.id ? COLOR.ink : COLOR.inkQuiet,
                          fontWeight: active === d.id ? 700 : 500,
                          cursor:"pointer",fontFamily:FONT.sans,whiteSpace:"nowrap"}}>
                  {d.label}{typeof d.count === "number" && d.count > 0 ? ` (${d.count})` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
