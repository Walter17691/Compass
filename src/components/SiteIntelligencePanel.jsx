import { DataQualityCaveat } from './DataQualityCaveat';
import { COLOR, TYPE, RADIUS } from '../styles/tokens';

const MIN_DURATION_SAMPLE = 3;
// Phase 6.5 hardening (closes Prompt 16 audit finding H18, HIGH) — same
// re-identification risk as OrganisationalIntelligenceOverview.jsx's own
// fix: a per-site case-type bar reading "1" at a small site is a direct
// disclosure of which specific case that is.
const MIN_TYPE_SAMPLE = 3;

const BarRow = ({ label, value, max, color = COLOR.inkQuiet }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:12,color:COLOR.ink}}>{label}</span>
      <span style={{fontSize:12,color:COLOR.inkFaint}}>{value}</span>
    </div>
    <div style={{background:COLOR.borderFaint,borderRadius:3,height:5}}>
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
    return <div style={{fontSize:13,color:COLOR.inkFaint}}>No site data available yet.</div>;
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:4}}>Site intelligence</div>
        <div style={{fontSize:12,color:COLOR.inkFaint,maxWidth:560}}>Sorted by case volume for scannability only — not a best-site/worst-site ranking.</div>
      </div>
      {sites.map(([site, count]) => {
        const allTypes = Object.entries(locationTypes[site] || {}).sort((a,b)=>b[1]-a[1]);
        const types = allTypes.filter(([,v]) => v >= MIN_TYPE_SAMPLE);
        const suppressedTypeCount = allTypes.length - types.length;
        const maxType = Math.max(1, ...types.map(([,v])=>v));
        const duration = locationDurations[site];
        return (
          <div key={site} style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"16px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:600,color:COLOR.ink}}>{site}</div>
              <BarRow label="" value={count} max={maxVolume}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:6}}>Case types</div>
                {types.length===0
                  ? <DataQualityCaveat total={count} minRequired={MIN_TYPE_SAMPLE} label="cases at this site"/>
                  : types.map(([t,v])=><BarRow key={t} label={t} value={v} max={maxType}/>)}
                {types.length>0 && suppressedTypeCount>0 && <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>{suppressedTypeCount} type{suppressedTypeCount===1?"":"s"} with under {MIN_TYPE_SAMPLE} cases not shown</div>}
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:6}}>Avg case duration</div>
                {!duration || duration.count < MIN_DURATION_SAMPLE
                  ? <DataQualityCaveat total={duration?.count||0} minRequired={MIN_DURATION_SAMPLE} label="closed cases with measurable duration"/>
                  : (
                    <div style={{fontSize:13,color:COLOR.ink}}>
                      {duration.avg_days}d
                      {companyAvgDuration!=null && (
                        <span style={{color:COLOR.inkFaint,fontSize:12}}> · company average {companyAvgDuration}d</span>
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
