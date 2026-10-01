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
  const moreRef = useRef(null);

  const primaryCount = destinations?.primary?.length || 0;

  // Measure against real widths. A ResizeObserver keeps it correct when the
  // window changes without a re-render of this component.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const available = el.clientWidth - MORE_RESERVE;
      if (!available || available <= 0) return;
      const widths = Array.from(el.querySelectorAll("[data-dest]"))
        .map(n => n.getBoundingClientRect().width);
      if (!widths.length || widths.every(w => w === 0)) return;   // not laid out yet
      let used = 0, fit = 0;
      for (const w of widths) {
        if (used + w > available) break;
        used += w; fit += 1;
      }
      setMaxVisible(fit >= primaryCount ? null : fit);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
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
    <div ref={barRef} role="tablist" aria-label="Case workspace"
      style={{display:"flex",alignItems:"center",gap:0,borderBottom:`1px solid ${COLOR.borderFaint}`,
              overflow:"hidden",position:"relative"}}>
      {visible.map(d => (
        <button key={d.id} data-dest={d.id} type="button" role="tab"
          aria-selected={active === d.id}
          onClick={() => onSelect(d.id)}
          style={tabStyle(active === d.id)}>
          {d.label}{typeof d.count === "number" && d.count > 0 ? ` (${d.count})` : ""}
        </button>
      ))}

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
