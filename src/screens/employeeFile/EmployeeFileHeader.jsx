import { COLOR, TYPE, FONT, SPACE, RADIUS } from '../../styles/tokens';
import { ActionMenu } from '../../components/design/ActionMenu';

// ─────────────────────────────────────────────────────────────────────────
// The Employee File header. Phase E1.
//
// Restrained by design. The previous Person View opened with a coloured avatar
// disc and two equally-weighted purple buttons; the name competed with its own
// chrome. Here the NAME is the anchor and everything else is quiet metadata on
// one line beneath it.
//
// Fields appear only when recorded. A row of em-dashes makes a sparse record
// look broken, and most production roster rows hold little beyond a name.
// ─────────────────────────────────────────────────────────────────────────

const STATUS_LABEL = { active: "Active", leaver: "Left the organisation", unknown: null };

export function EmployeeFileHeader({ employee, onBack, primaryAction, overflowActions = [] }) {
  const name = employee?.name || "Unknown employee";
  // Ordered most-identifying first, so a truncated line still distinguishes two
  // colleagues who share a display name.
  const meta = [
    employee?.jobTitle,
    employee?.location,
    employee?.employeeNumber ? `#${employee.employeeNumber}` : null,
    employee?.department,
  ].filter(Boolean);
  const status = STATUS_LABEL[employee?.employmentStatus] || null;

  return (
    <header style={{ borderBottom: `1px solid ${COLOR.border}`, background: COLOR.paper }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: `${SPACE.lg}px ${SPACE.xl}px ${SPACE.md}px` }}>
        <button type="button" onClick={onBack}
          style={{ ...TYPE.metadata, background: "none", border: "none", padding: 0, marginBottom: SPACE.md,
                   color: COLOR.inkFaint, cursor: "pointer", fontFamily: FONT.sans }}>
          ← People
        </button>

        {/* Wraps rather than truncating: a long name and a long job title are
            ordinary, and a clipped name on a person's own file is not
            acceptable. The actions sit below on narrow viewports so no action
            disappears on mobile. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                      gap: SPACE.lg, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <h1 style={{ ...TYPE.identity, color: COLOR.ink, margin: 0, overflowWrap: "anywhere" }}>{name}</h1>
            {(meta.length > 0 || status) && (
              <p style={{ ...TYPE.rowContext, color: COLOR.inkFaint, margin: `${SPACE.xs}px 0 0`, overflowWrap: "anywhere" }}>
                {meta.join(" · ")}
                {status && meta.length > 0 && " · "}
                {/* Status is words, never colour alone. */}
                {status}
              </p>
            )}
          </div>

          {(primaryAction || overflowActions.length > 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap", flexShrink: 0 }}>
              {/* ── Wave A ────────────────────────────────────────────────────
                  ONE primary action, and it is now the most immediate piece of
                  work rather than a fixed "New case".

                  The administrative actions — New case, Correct details, Record
                  employment change, Mark as leaver — move into a restrained
                  overflow. Nothing is removed and no permission changes: an action
                  the viewer could reach before is still reachable, one click
                  further away, which is the right cost for something done rarely
                  and deliberately.

                  ActionMenu is reused rather than reimplemented, so the menu
                  semantics (aria-haspopup, role=menu/menuitem, blur to close) are
                  the ones already proven elsewhere in the product. */}
              {overflowActions.length > 0 && (
                <ActionMenu label="More actions" actions={overflowActions} />
              )}
              {primaryAction && (
                <button type="button" onClick={primaryAction.onClick}
                  style={{ ...TYPE.metadata, fontWeight: 700, background: COLOR.purple, border: "none",
                           borderRadius: RADIUS.button, padding: "8px 14px", color: COLOR.paper,
                           cursor: "pointer", fontFamily: FONT.sans, minHeight: 36 }}>
                  {primaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────
//
// A real tablist: arrow-key navigation, aria-selected, and a focusable panel.
// Horizontally scrollable on narrow viewports rather than wrapping into two
// rows or overflowing the page — the page body must never scroll sideways.
export function EmployeeFileTabs({ tabs, active, onSelect }) {
  const onKeyDown = e => {
    const i = tabs.findIndex(t => t.id === active);
    if (i < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
      onSelect(tabs[next].id);
    }
  };

  return (
    <div style={{ borderBottom: `1px solid ${COLOR.border}`, background: COLOR.paper, position: "sticky", top: 0, zIndex: 1 }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: `0 ${SPACE.xl}px` }}>
        {/* The key handler lives on the TABS, not on the tablist. A tablist with
            an onKeyDown but no tabIndex is an interactive element that cannot be
            focused, and the APG pattern puts arrow-key handling on the focusable
            tab anyway. */}
        <div role="tablist" aria-label="Employee file sections"
          style={{ display: "flex", gap: SPACE.lg, overflowX: "auto", scrollbarWidth: "none" }}>
          {tabs.map(t => {
            const selected = t.id === active;
            return (
              <button key={t.id} role="tab" id={`emp-tab-${t.id}`}
                aria-selected={selected} aria-controls={`emp-panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onKeyDown={onKeyDown}
                onClick={() => onSelect(t.id)}
                style={{
                  ...TYPE.rowContext,
                  fontWeight: selected ? 700 : 500,
                  // Selection is an underline AND a weight change, so it never
                  // depends on colour alone.
                  color: selected ? COLOR.ink : COLOR.inkFaint,
                  background: "none", border: "none",
                  borderBottom: `2px solid ${selected ? COLOR.purple : "transparent"}`,
                  // 44px tall: a real touch target.
                  padding: `${SPACE.md}px 2px`, minHeight: 44,
                  cursor: "pointer", fontFamily: FONT.sans, whiteSpace: "nowrap", flexShrink: 0,
                }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
