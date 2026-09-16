import { COLOR, FONT } from '../../styles/tokens';

// Insights Visual Upgrade, Phase 1 — one shared KPI-tile shape for the
// Reports dashboard's 5 headline cards. Deliberately restrained: a small
// label, one large number, and an optional short contextual line — never
// a paragraph (Compass Design Vision's own "data first" principle, and
// the exact card shape ErReportScreen/OrganisationalIntelligenceOverview
// already use elsewhere in Insights, so this isn't a new visual language,
// just a shared, reusable version of it).
export function KpiCard({ label, value, sub, accent = COLOR.ink, onClick }) {
  const interactive = typeof onClick === "function";
  const Wrapper = interactive ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      style={{
        background: COLOR.surface, border: `1px solid ${COLOR.borderFaint}`, borderRadius: 10,
        padding: "16px 18px", textAlign: "left", font: "inherit", cursor: interactive ? "pointer" : "default",
        display: "block", width: "100%", boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: COLOR.inkFaint, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: accent, fontFamily: FONT.serif, marginBottom: sub ? 4 : 0, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: COLOR.inkFaint }}>{sub}</div>}
    </Wrapper>
  );
}
