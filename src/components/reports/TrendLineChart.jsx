import { COLOR, FONT, RADIUS } from '../../styles/tokens';

// Insights Visual Upgrade, Phase 1 — "Cases opened vs closed" primary
// trend visual. Grouped bars (opened/closed side by side per bucket)
// rather than an SVG line — this is the exact visual language the
// existing "Cases opened per month" chart already established
// (ErReportScreen.jsx), just extended to a second series, so Reports
// gains one genuinely new chart type (a real two-series trend) without
// introducing a new charting technique or library. Every bar prints its
// own count directly beneath it (§22 — colour is never the only signal:
// a colour-blind or screen-reader user gets the same "opened 4, closed 2"
// fact a sighted user reading bar height does), and a small text legend
// (not colour swatches alone) identifies which series is which.
export function TrendLineChart({ title, subtitle, series = [], onSelectBucket }) {
  const max = Math.max(1, ...series.flatMap(p => [p.opened, p.closed]));
  return (
    <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.borderFaint}`, borderRadius: RADIUS.surface, padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLOR.inkFaint, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
          {subtitle && <div style={{ fontFamily: FONT.serif, fontSize: 18, fontWeight: 400, color: COLOR.ink }}>{subtitle}</div>}
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 12, color: COLOR.inkFaint }}>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: COLOR.purple, marginRight: 6 }} />Opened</span>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: COLOR.inkQuiet, marginRight: 6 }} />Closed</span>
        </div>
      </div>
      {series.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.inkFaint, marginTop: 12 }}>No case activity in the selected period.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: series.length > 20 ? 4 : 10, height: 140, marginTop: 12, overflowX: "auto" }}>
          {series.map((point, i) => {
            const interactive = typeof onSelectBucket === "function" && (point.openedCaseIds?.length || point.closedCaseIds?.length);
            const Wrapper = interactive ? "button" : "div";
            return (
              <Wrapper
                key={i}
                onClick={interactive ? () => onSelectBucket(point) : undefined}
                title={`${point.label}: ${point.opened} opened, ${point.closed} closed`}
                style={{ flex: "1 0 auto", minWidth: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: interactive ? "pointer" : "default", font: "inherit" }}
              >
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 88 }}>
                  <div title={`Opened: ${point.opened}`} style={{ width: 9, background: COLOR.purple, borderRadius: "2px 2px 0 0", height: `${Math.max(2, Math.round((point.opened / max) * 84))}px`, opacity: 0.85 }} />
                  <div title={`Closed: ${point.closed}`} style={{ width: 9, background: COLOR.inkQuiet, borderRadius: "2px 2px 0 0", height: `${Math.max(2, Math.round((point.closed / max) * 84))}px` }} />
                </div>
                <div style={{ fontSize: 9, color: COLOR.inkFaint, textAlign: "center", whiteSpace: "nowrap" }}>{point.label}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: COLOR.ink, whiteSpace: "nowrap" }}>{point.opened}/{point.closed}</div>
              </Wrapper>
            );
          })}
        </div>
      )}
    </div>
  );
}
