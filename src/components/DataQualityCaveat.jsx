// Organisational ER Intelligence (Phase 6, OP1, §21/§24) — a shared
// "limited data, interpret cautiously" surface, generalising the
// applicable/total shape already returned by outcomeConsistency.js's
// computeOutcomeDistribution/computeSanctionDistribution
// (MIN_SAMPLE_SIZE=3) and orgIntelligence.js's extractThemeKeywords
// (MIN_CASE_COUNT=2). Every org-level insight built in this phase should
// render through this rather than inventing its own threshold message,
// so the caveat reads the same way everywhere in Insights.
export function DataQualityCaveat({ total, minRequired, label = "cases" }) {
  return (
    <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#B87520",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:4}}>Limited data</div>
      <div style={{fontSize:13,color:"#6B6375"}}>
        {total === 0
          ? `No ${label} available for this period yet.`
          : `Only ${total} ${label} available for this period (at least ${minRequired} needed for a reliable pattern). Interpret this cautiously.`}
      </div>
    </div>
  );
}
