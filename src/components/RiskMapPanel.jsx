import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { computeStageBottlenecksByLocation } from '../lib/processDashboard';
import { computeSiteRiskFlags } from '../lib/riskMap';
import { CreateActionButton } from './CreateActionButton';
import { COLOR, TYPE, RADIUS, SPACE } from '../styles/tokens';

// Phase 2C — every flag category collapsed onto one neutral-amber
// treatment. The old per-category rainbow (amber/red/purple/blue) had
// no real severity behind it — riskMap.js's own data model is four
// independent boolean-style flags, not a graduated risk score (see its
// header), so colour-coding by category implied a severity gradient
// that doesn't exist. A flag existing at all is already the one real
// signal; the label text says which kind. Nothing here scores or ranks
// a site against another — flags are per-site facts, not a league table.

// Organisational ER Intelligence (Phase 6, OP16, §13) — organisational
// risk map. See riskMap.js's own header for the full scope reasoning:
// four real, per-site flags (never a blended score, never protected
// characteristics), with the spec's other "potential categories"
// (management capability, appeal vulnerability, policy confusion,
// workforce communication) explicitly noted as covered elsewhere in
// Insights at organisation level, not fabricated per site here.
export function RiskMapPanel({ orgId, cases, employeeRecords, processTemplates, orgEvents, createCaseTask, improvementInitiatives }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('org_insights_overview', { p_org_id: orgId, p_period_days: 90 });
      if (cancelled) return;
      if (rpcError) { console.error("org_insights_overview", rpcError); setError(true); }
      else setOverview(data);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (error) return <div style={{fontSize:13,color:"#6B6375"}}>Couldn't load risk map data right now.</div>;
  if (!overview) return <div style={{fontSize:13,color:"#6B6375"}}>Loading risk map…</div>;

  const bottlenecks = computeStageBottlenecksByLocation(cases, employeeRecords, processTemplates);
  const sites = computeSiteRiskFlags({
    locationCounts: overview.cases_by_location,
    locationDurations: overview.avg_duration_by_location,
    companyAvgDuration: overview.avg_case_duration_days,
    companyAvgDurationSampleSize: overview.closed_cases_with_duration,
    bottlenecks,
    orgEvents,
  });

  return (
    <div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:6}}>Organisational risk map</div>
      <div style={{fontSize:12,color:COLOR.inkFaint,marginBottom:16,maxWidth:560}}>
        Flags below are indicative signals from real case data, never a ranking and never based on protected characteristics. Management capability, appeal, and policy risk are covered organisation-wide in the Manager Insights, Appeal, and Policy panels rather than broken down by site — the data doesn't support attributing those to a specific location.
      </div>

      {/* Design System Convergence pass, Phase 5 — NO DATA, distinct from
          the per-site "no flags" case below (which is NO SIGNAL
          DETECTED — a real check that found nothing, not an absence of
          data). Explains why (no case has a location recorded) rather
          than just "nothing here". */}
      {sites.length === 0 && <div style={{fontSize:13,color:COLOR.inkFaint,maxWidth:480,lineHeight:1.6}}>No site data available yet — risk flags appear once cases are recorded against a location. Nothing to review until then.</div>}
      {sites.map(s => (
        <div key={s.site} style={ s.flags.length
          ? {background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:RADIUS.surface,padding:"14px 16px",marginBottom:SPACE.sm}
          : {borderBottom:`1px solid ${COLOR.borderFaint}`,padding:"10px 0"}
        }>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:s.flags.length?8:0}}>
            <div style={{fontSize:14,fontWeight:600,color:COLOR.ink}}>{s.site}</div>
            <div style={{fontSize:11,color:COLOR.inkFaint}}>{s.caseCount} case{s.caseCount===1?"":"s"}</div>
          </div>
          {s.flags.length === 0
            ? <div style={{fontSize:12,color:COLOR.inkFaint}}>No risk flags detected for this site — checked against duration, volume, and process signals.</div>
            : s.flags.map(f => (
              <div key={f.category} style={{marginBottom:8}}>
                <div style={{fontSize:12,color:COLOR.ink}}>
                  <span style={{fontWeight:600,color:COLOR.amber}}>{f.label}</span> — {f.detail}
                </div>
                {createCaseTask && <CreateActionButton insightRef={`Risk flag: ${s.site} — ${f.label}`} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
