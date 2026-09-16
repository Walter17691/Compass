import { useState } from 'react';
import { COLOR, FONT, RADIUS, TYPE } from '../styles/tokens';

// Insights Visual Upgrade, Phase 1 — closes the review's single most
// direct finding: ExecutiveBriefPanel and PeriodicReviewPanel used to
// render, unconditionally expanded, at the very top of the Reports tab —
// the literal "wall of AI text before any chart" the product review
// screenshotted in production. This is a pure visual wrapper: no change
// to either panel's own data fetching, generation, or persistence
// (er_executive_briefs is untouched) — it only decides whether their
// content is visible at all, collapsed by default, below the
// deterministic dashboard (ErReportScreen renders first in
// InsightsScreen.jsx's "reports" branch; this renders after it).
export function ManagementAnalysisSection({ children }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: COLOR.surface, border: `1px solid ${COLOR.borderFaint}`, borderRadius: RADIUS.surface, marginTop: 24 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left", font: "inherit",
        }}
      >
        <div>
          <div style={{ ...TYPE.sectionHeading, color: COLOR.inkFaint, marginBottom: 2 }}>Management analysis</div>
          <div style={{ fontSize: 12, color: COLOR.inkFaint }}>AI-generated commentary on the data above — always a supplement to it, never a replacement.</div>
        </div>
        <span style={{ fontSize: 13, color: COLOR.purple, fontWeight: 600, fontFamily: FONT.sans, flexShrink: 0, marginLeft: 12 }}>
          {expanded ? "Hide" : "Show"}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 20px 20px" }}>
          {children}
        </div>
      )}
    </div>
  );
}
