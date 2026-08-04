import { useState, useRef, useEffect } from 'react';

// Groups the situational HR-process screens (onboarding, offboarding,
// redundancy, wellbeing, DSAR) behind one dropdown so the top nav reads as
// 4-5 everyday items instead of 10 flat links — those four are things you
// open while actively running that specific process, not every session.
// Mirrors OrgSwitcher's click-outside/Escape pattern.
export function NavModulesMenu({ items, activeScreen, goToScreen }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const isActive = items.some(({ s }) => s === activeScreen);

  useEffect(() => {
    if (!show) return;
    const onKeyDown = e => { if (e.key === "Escape") setShow(false); };
    const onClickOutside = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onClickOutside); };
  }, [show]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button onClick={() => setShow(v => !v)} aria-haspopup="menu" aria-expanded={show}
        style={{ background: isActive ? "#F5F3FF" : "none", border: "none", color: isActive ? "#7C5CFC" : "#6B6375", padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: isActive ? 600 : 400, cursor: "pointer", fontFamily: "DM Sans,system-ui,sans-serif", display: "flex", alignItems: "center", gap: 5 }}>
        HR Processes
        <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {show && (
        <div role="menu" aria-label="HR Processes" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#FFFFFF", border: "1px solid #E8E0D0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 180, overflow: "hidden", zIndex: 250 }}>
          {items.map(({ s, l }) => (
            <button key={s} role="menuitem" onClick={() => { goToScreen(s); setShow(false); }}
              style={{ width: "100%", textAlign: "left", background: s === activeScreen ? "#F5F3FF" : "none", border: "none", borderBottom: "1px solid #F5F1EA", padding: "10px 14px", fontSize: 13, color: s === activeScreen ? "#7C5CFC" : "#1A1535", fontWeight: s === activeScreen ? 600 : 400, cursor: "pointer", fontFamily: "DM Sans,system-ui,sans-serif" }}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
