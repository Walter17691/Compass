import { useState, useRef } from 'react';
import { usePopoverPosition } from '../../hooks/usePopoverPosition';
import { COLOR, RADIUS, FONT } from '../../styles/tokens';

// Phase 2A (Compass Design Vision) — the "ActionBar" primitive: one
// primary action plus a "More actions" menu for everything secondary,
// replacing a row of equally-weighted buttons. Reuses
// usePopoverPosition (Phase 7.5C) so this menu gets the same real
// viewport-edge flip behaviour already fixed and verified for the
// notification/org-switcher popovers, rather than re-risking the same
// overflow bug a third time.
//
// Deliberately dumb: takes a list of {label, onClick, disabled} actions
// and renders them as plain buttons. No new logic — every action passed
// in is the exact same handler the five-button row used to call
// directly.
export function ActionMenu({ actions, label = "More actions" }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const popoverStyle = usePopoverPosition(btnRef, show);

  const visible = actions.filter(Boolean);
  if (!visible.length) return null;

  return (
    <div style={{ position: "relative" }} ref={ref}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget)) setShow(false); }}>
      <button ref={btnRef} onClick={() => setShow(v => !v)} aria-haspopup="menu" aria-expanded={show}
        style={{
          fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: COLOR.inkSoft,
          background: show ? COLOR.paper : COLOR.surface, border: `1px solid ${COLOR.border}`,
          borderRadius: RADIUS.surface, padding: "8px 14px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}>
        {label} <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {show && popoverStyle && (
        <div role="menu" aria-label={label} style={{
          ...popoverStyle, background: COLOR.surface, border: `1px solid ${COLOR.border}`,
          borderRadius: RADIUS.surface, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          minWidth: 200, overflowY: "auto", zIndex: 250,
        }}>
          {visible.map((a, i) => (
            <button key={i} role="menuitem" disabled={a.disabled}
              onClick={() => { setShow(false); a.onClick(); }}
              style={{
                width: "100%", textAlign: "left", background: "none", border: "none",
                borderBottom: i < visible.length - 1 ? `1px solid ${COLOR.borderFaint}` : "none",
                padding: "10px 14px", fontFamily: FONT.sans, fontSize: 13,
                color: a.disabled ? COLOR.inkFaint : COLOR.ink,
                cursor: a.disabled ? "default" : "pointer",
              }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
