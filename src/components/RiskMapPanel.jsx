import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { computeStageBottlenecksByLocation } from '../lib/processDashboard';
import { computeSiteRiskFlags } from '../lib/riskMap';

const FLAG_COLOR = {
  er_volume: "#B87520",
  case_delay: "#C84B2F",
  process_risk: "#7C5CFC",
  operational_change: "#1C5AA0",
};

// Organisational ER Intelligence (Phase 6, OP16, §13) — organisational
// risk map. See riskMap.js's own header for the full scope reasoning:
// four real, per-site flags (never a blended score, never protected
// characteristics), with the spec's other "potential categories"
// (management capability, appeal vulnerability, policy confusion,
// workforce communication) explicitly noted as covered elsewhere in
// Insights at organisation level, not fabricated per site here.
export function RiskMapPanel({ cases, employeeRecords, processTemplates, orgEvents }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_insights_overview', { p_period_days: 90 });
      if (cancelled) return;
      if (rpcError) { console.error("org_insights_overview", rpcError); setError(true); }
      else setOverview(data);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <div style={{fontSize:13,color:"#6B6375"}}>Couldn't load risk map data right now.</div>;
  if (!overview) return <div style={{fontSize:13,color:"#6B6375"}}>Loading risk map…</div>;

  const bottlenecks = computeStageBottlenecksByLocation(cases, employeeRecords, processTemplates);
  const sites = computeSiteRiskFlags({
    locationCounts: overview.cases_by_location,
    locationDurations: overview.avg_duration_by_location,
    companyAvgDuration: overview.avg_case_duration_days,
    bottlenecks,
    orgEvents,
  });

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:6}}>Organisational risk map</div>
      <div style={{fontSize:12,color:"#6B6375",marginBottom:16,maxWidth:560}}>
        Flags below are indicative signals from real case data, never a ranking and never based on protected characteristics. Management capability, appeal, and policy risk are covered organisation-wide in the Manager Insights, Appeal, and Policy panels rather than broken down by site — the data doesn't support attributing those to a specific location.
      </div>

      {sites.length === 0 && <div style={{fontSize:13,color:"#6B6375"}}>No site data available yet.</div>}
      {sites.map(s => (
        <div key={s.site} style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"14px 16px",marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:s.flags.length?8:0}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1A1535"}}>{s.site}</div>
            <div style={{fontSize:11,color:"#9B9098"}}>{s.caseCount} case{s.caseCount===1?"":"s"}</div>
          </div>
          {s.flags.length === 0
            ? <div style={{fontSize:12,color:"#9B9098"}}>No flags for this site.</div>
            : s.flags.map(f => (
              <div key={f.category} style={{fontSize:12,color:"#1A1535",marginBottom:4}}>
                <span style={{fontWeight:600,color:FLAG_COLOR[f.category]||"#1A1535"}}>{f.label}</span> — {f.detail}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
