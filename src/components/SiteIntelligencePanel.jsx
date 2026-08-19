import { DataQualityCaveat } from './DataQualityCaveat';

const MIN_DURATION_SAMPLE = 3;

const BarRow = ({ label, value, max, color = "#7C5CFC" }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:12,color:"#1C1820"}}>{label}</span>
      <span style={{fontSize:12,color:"#9B9098"}}>{value}</span>
    </div>
    <div style={{background:"#F5F1EA",borderRadius:3,height:5}}>
      <div style={{background:color,borderRadius:3,height:5,width:`${max>0?Math.round((value/max)*100):0}%`}}/>
    </div>
  </div>
);

// Organisational ER Intelligence (Phase 6, OP4, §5) — per-site detail,
// reading the location/type/duration breakdowns
// org_insights_location_fix_2026-08-19.sql added to org_insights_overview().
// Deliberately a plain list, not a ranked table — the spec's own caution
// against "simplistic league tables that encourage poor behaviour such
// as suppressing case reporting" (sites are sorted by case volume for
// scannability only, never styled as a best/worst ranking).
//
// SCOPE NOTE: no region grouping (this schema has no region concept —
// see the migration's own header) and no per-site "vs previous period"
// comparison (would need a second, period-scoped RPC call this phase
// doesn't add yet) or per-site recurring themes (would need cases
// joined back to employee_records client-side just to re-derive what
// the RPC's own cases_by_location_type already answers more precisely).
// Company-average comparison is what's genuinely buildable now.
export function SiteIntelligencePanel({ overview }) {
  const locationCounts = overview.cases_by_location || {};
  const locationTypes = overview.cases_by_location_type || {};
  const locationDurations = overview.avg_duration_by_location || {};
  const sites = Object.entries(locationCounts).sort((a,b)=>b[1]-a[1]);
  const maxVolume = Math.max(1, ...sites.map(([,v])=>v));
  const companyAvgDuration = overview.avg_case_duration_days;

  if (sites.length === 0) {
    return <div style={{fontSize:13,color:"#6B6375"}}>No site data available yet.</div>;
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Site intelligence</div>
      {sites.map(([site, count]) => {
        const types = Object.entries(locationTypes[site] || {}).sort((a,b)=>b[1]-a[1]);
        const maxType = Math.max(1, ...types.map(([,v])=>v));
        const duration = locationDurations[site];
        return (
          <div key={site} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:600,color:"#1A1535"}}>{site}</div>
              <BarRow label="" value={count} max={maxVolume} color="#B87520"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:6}}>Case types</div>
                {types.map(([t,v])=><BarRow key={t} label={t} value={v} max={maxType}/>)}
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"#9B9098",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:6}}>Avg case duration</div>
                {!duration || duration.count < MIN_DURATION_SAMPLE
                  ? <DataQualityCaveat total={duration?.count||0} minRequired={MIN_DURATION_SAMPLE} label="closed cases with measurable duration"/>
                  : (
                    <div style={{fontSize:13,color:"#1C1820"}}>
                      {duration.avg_days}d
                      {companyAvgDuration!=null && (
                        <span style={{color:"#9B9098",fontSize:12}}> · company average {companyAvgDuration}d</span>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
