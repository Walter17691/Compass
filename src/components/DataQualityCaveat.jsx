import { COLOR, FONT } from '../styles/tokens';

// Organisational ER Intelligence (Phase 6, OP1, §21/§24) — a shared
// "limited data, interpret cautiously" surface, generalising the
// applicable/total shape already returned by outcomeConsistency.js's
// computeOutcomeDistribution/computeSanctionDistribution
// (MIN_SAMPLE_SIZE=3) and orgIntelligence.js's extractThemeKeywords
// (MIN_CASE_COUNT=2). Every org-level insight built in this phase should
// render through this rather than inventing its own threshold message,
// so the caveat reads the same way everywhere in Insights.
//
// Phase 2B — deliberately no border/background card here (Compass
// Design Vision §3): a "not enough data yet" state should never carry
// the same visual weight as a genuine metric tile next to it. Same
// text, same props, just a quiet inline line with a small marker
// instead of a boxed callout.
export function DataQualityCaveat({ total, minRequired, label = "cases" }) {
  return (
    <div style={{padding:"18px 20px",display:"flex",alignItems:"baseline",gap:6,fontFamily:FONT.sans}}>
      <span style={{fontSize:11,fontWeight:600,color:COLOR.amber,flexShrink:0}}>Limited data</span>
      <span style={{fontSize:12,color:COLOR.inkFaint,flexShrink:0}}>·</span>
      <span style={{fontSize:12,color:COLOR.inkFaint}}>
        {total === 0
          ? `No ${label} available for this period yet.`
          : `Only ${total} ${label} available for this period (at least ${minRequired} needed for a reliable pattern). Interpret this cautiously.`}
      </span>
    </div>
  );
}
