import { COLOR, FONT, RADIUS } from '../../styles/tokens';

// Insights Visual Upgrade, Phase 1 — one shared horizontal-bar component
// for every "breakdown" chart on the Reports dashboard (case type, stage,
// outcome, location, theme, ageing). Deliberately dumb: it renders
// whatever `entries` it's given, in the order given — sample-floor
// suppression and sorting both happen in reportsAnalytics.js, not here,
// so this component can't silently apply a different rule per caller.
//
// Never a colour-coded ranking — one neutral bar colour throughout,
// matching OrganisationalIntelligenceOverview.jsx/ErReportScreen's own
// existing BarRow convention (Compass Design Vision §7: categories that
// aren't inherently urgent get one neutral tone, colour is reserved for
// genuine semantic states elsewhere). Every bar states its own count as
// text, never colour/height alone (§22 accessibility) — a screen reader
// or a colour-blind reader gets the same information a sighted user does.
export function BreakdownBarChart({ title, subtitle, entries = [], suppressedCount = 0, suppressedLabel = "categories", emptyMessage = "No data yet.", onSelect, color = COLOR.inkQuiet }) {
  const max = Math.max(1, ...entries.map(e => e.count));
  return (
    <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.borderFaint}`, borderRadius: RADIUS.surface, padding: "20px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: COLOR.inkFaint, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 400, color: COLOR.ink, marginBottom: 16 }}>{subtitle}</div>}
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.inkFaint }}>{emptyMessage}</div>
      ) : entries.map(entry => {
        const interactive = typeof onSelect === "function" && entry.caseIds?.length > 0;
        const Row = interactive ? "button" : "div";
        return (
          <Row
            key={entry.id}
            onClick={interactive ? () => onSelect(entry) : undefined}
            title={`${entry.label}: ${entry.count}`}
            style={{
              display: "block", width: "100%", marginBottom: 10, background: "none", border: "none", padding: 0,
              textAlign: "left", font: "inherit", cursor: interactive ? "pointer" : "default", color: "inherit",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: COLOR.ink, fontWeight: 500 }}>{entry.label}</span>
              <span style={{ fontSize: 12, color: COLOR.inkFaint }}>{entry.count}</span>
            </div>
            <div style={{ background: COLOR.borderFaint, borderRadius: 3, height: 6 }}>
              <div style={{ background: color, borderRadius: 3, height: 6, width: `${Math.round((entry.count / max) * 100)}%`, transition: "width 0.3s" }} />
            </div>
          </Row>
        );
      })}
      {suppressedCount > 0 && (
        <div style={{ fontSize: 11, color: COLOR.inkFaint, marginTop: 4 }}>
          {suppressedCount} {suppressedLabel} with too few cases to show reliably
        </div>
      )}
    </div>
  );
}
