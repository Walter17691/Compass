import { computeStageBottlenecksByLocation } from '../lib/processDashboard';

// Organisational ER Intelligence (Phase 6, OP10, §7) — process
// bottlenecks broken down by location, with drill-in to the underlying
// cases (the spec's own "Allow users to drill into the underlying
// cases"). Reuses processDashboard.js's existing per-case stage-duration
// computation (the same logic behind HomeScreen's "Potential
// Bottlenecks" panel) rather than re-deriving stage timing — this is
// purely the location dimension layered on top.
export function ProcessBottlenecksPanel({ cases, employeeRecords, processTemplates, onOpenCase }) {
  const bottlenecks = computeStageBottlenecksByLocation(cases, employeeRecords, processTemplates);

  if (bottlenecks.length === 0) {
    return <div style={{fontSize:13,color:"#6B6375"}}>No process stages are currently running longer than target.</div>;
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {bottlenecks.map(b => (
        <div key={b.processType+":"+b.stage} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10,flexWrap:"wrap",gap:6}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1A1535"}}>{b.processType} — {b.stage}</div>
            <div style={{fontSize:12,color:"#C84B2F"}}>{b.avgDays}d avg · target {b.targetDays}d · {b.caseCount} case{b.caseCount===1?"":"s"}</div>
          </div>
          {b.byLocation.map(loc => (
            <div key={loc.location} style={{marginBottom:8,paddingBottom:8,borderBottom:"1px solid #F5F1EA"}}>
              <div style={{fontSize:12,color:"#6B6375",marginBottom:4}}>{loc.location} — {loc.avgDays}d avg, {loc.caseCount} case{loc.caseCount===1?"":"s"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {loc.cases.map(c => (
                  <button key={c.caseId} onClick={()=>onOpenCase(c.caseId, b.stageId)} style={{fontSize:11,color:"#7C5CFC",background:"#F5F3FF",border:"none",borderRadius:14,padding:"3px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>
                    {c.employeeName} · {c.days}d
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
