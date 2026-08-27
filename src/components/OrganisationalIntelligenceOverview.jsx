import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { computeStageDurations } from '../lib/processDashboard';
import { computeInformalFormalSplit } from '../lib/orgIntelligence';
import { themeFrequency } from '../lib/themes';
import { daysBetween } from '../lib/dateMath';
import { DataQualityCaveat } from './DataQualityCaveat';
import { SiteIntelligencePanel } from './SiteIntelligencePanel';
import { BenchmarkingPanel } from './BenchmarkingPanel';
import { ProcessBottlenecksPanel } from './ProcessBottlenecksPanel';
import { AppealIntelligencePanel } from './AppealIntelligencePanel';
import { CaseQualityAnalyticsPanel } from './CaseQualityAnalyticsPanel';
import { PolicyEffectivenessPanel } from './PolicyEffectivenessPanel';

const MIN_DURATION_SAMPLE = 3;
// Phase 6.5 hardening (closes Prompt 16 audit finding H18, HIGH) — the
// duration/investigation-count stats above already had a sample floor,
// but the type/site/department/outcome breakdown bars below them did not
// — a bar reading "Manchester: 1" or "Dismissal: 1" is a direct
// re-identification risk at a small site or for a rare outcome, the same
// small-sample disclosure risk MIN_SAMPLE_SIZE/DataQualityCaveat already
// guard everywhere else in this phase (Trends, Risk Map, Benchmarking).
const MIN_BAR_SAMPLE = 3;

const StatBox = ({ label, value, sub, accent = "#7C5CFC" }) => (
  <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
    <div style={{fontSize:11,fontWeight:600,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>{label}</div>
    <div style={{fontSize:30,fontWeight:700,color:accent,fontFamily:"DM Serif Display,Georgia,serif",marginBottom:4,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:"#9B9098"}}>{sub}</div>}
  </div>
);

const BarRow = ({ label, value, max, color = "#7C5CFC" }) => (
  <div style={{marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
      <span style={{fontSize:12,color:"#1C1820",fontWeight:500}}>{label}</span>
      <span style={{fontSize:12,color:"#9B9098"}}>{value}</span>
    </div>
    <div style={{background:"#F5F1EA",borderRadius:3,height:6}}>
      <div style={{background:color,borderRadius:3,height:6,width:`${max>0?Math.round((value/max)*100):0}%`,transition:"width 0.3s"}}/>
    </div>
  </div>
);

const Panel = ({ title, children }) => (
  <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"18px 20px"}}>
    <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:14}}>{title}</div>
    {children}
  </div>
);

function topEntries(obj, limit = 6) {
  return Object.entries(obj || {}).sort((a,b)=>b[1]-a[1]).slice(0, limit);
}

// Phase 6.5 hardening (closes Prompt 16 audit finding H18) — holds back
// individual bars below MIN_BAR_SAMPLE rather than the whole panel, same
// suppression-not-fabrication approach as isSignificantTrend elsewhere in
// this phase. suppressedCount is surfaced as a plain caption, never the
// suppressed categories' own names/counts — showing "2 categories with
// under 3 cases not shown" is safe; showing which ones would defeat the
// point.
function withSampleFloor(entries) {
  const visible = entries.filter(([,v]) => v >= MIN_BAR_SAMPLE);
  return { visible, suppressedCount: entries.length - visible.length };
}

// Organisational ER Intelligence (Phase 6, OP3, §1) — the Organisational
// Intelligence dashboard. Counts/breakdowns/avg case duration come from
// org_insights_overview() (OP2) so they're correct across an org's full
// case table, not just whatever loadCasesFromDB() happened to load.
// Avg investigation duration, overdue cases, cases returned for further
// investigation, informal/formal split, and repeat themes are still
// read from the already-loaded `cases`/`dueSoon`/`hrReviewRequests`
// arrays — each reuses an existing, already-tested function
// (computeStageDurations, computeDueSoon's own dueSoon output,
// managerInsights.js's own "returned" filter, orgIntelligence.js) rather
// than re-deriving branching logic in SQL (see OP2's migration header
// for the full reasoning). Appeal rate/appeal outcome rate are OP11's
// job (Appeal Intelligence) — shown as a placeholder here, not guessed.
export function OrganisationalIntelligenceOverview({ orgId, cases, dueSoon, hrReviewRequests, processTemplates, employeeRecords, onOpenCase, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers, caseThemes, organisationThemes }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysSinceMonthStart = Math.max(1, daysBetween(startOfMonth, now));
      const { data, error: rpcError } = await supabase.rpc('org_insights_overview', { p_org_id: orgId, p_period_days: daysSinceMonthStart });
      if (cancelled) return;
      if (rpcError) { console.error("org_insights_overview", rpcError); setError(true); }
      else setOverview(data);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  // computeStageDurations/computeInformalFormalSplit both iterate every
  // case (thousands, on a real org) — memoized so an unrelated re-render
  // (e.g. this component's own overview/error state settling) doesn't
  // recompute them from scratch every time. Neither depends on overview
  // (RPC data), so these must stay ahead of the early returns below —
  // React's Rules of Hooks require every hook to run on every render,
  // in the same order, regardless of loading state.
  const { investigationCaseCount, avgInvestigationDays } = useMemo(() => {
    const investigationDurations = computeStageDurations(cases, processTemplates).filter(d => d.stage === "Investigation");
    const caseCount = investigationDurations.reduce((sum, d) => sum + d.caseCount, 0);
    const avgDays = caseCount > 0
      ? Math.round((investigationDurations.reduce((sum, d) => sum + d.avgDays * d.caseCount, 0) / caseCount) * 10) / 10
      : null;
    return { investigationCaseCount: caseCount, avgInvestigationDays: avgDays };
  }, [cases, processTemplates]);
  const resolutionSplit = useMemo(() => computeInformalFormalSplit(cases), [cases]);
  const themeFrequencies = useMemo(() => themeFrequency(caseThemes, organisationThemes), [caseThemes, organisationThemes]);

  if (error) {
    return <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"24px",fontSize:13,color:"#6B6375"}}>Couldn't load organisational statistics right now.</div>;
  }
  if (!overview) {
    return <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"24px",fontSize:13,color:"#6B6375"}}>Loading organisational statistics…</div>;
  }

  const overdueCaseIds = new Set((dueSoon || []).filter(d => d.overdue && d.caseId).map(d => d.caseId));
  const returnedForFurtherInvestigation = (hrReviewRequests || []).filter(r => r.step === "inv_report" && r.status === "returned").length;

  const typeEntries = withSampleFloor(topEntries(overview.cases_by_type));
  const locationEntries = withSampleFloor(topEntries(overview.cases_by_location));
  const departmentEntries = withSampleFloor(topEntries(overview.cases_by_department));
  // cases_by_manager (still returned by org_insights_overview()) is
  // deliberately never rendered here — a sorted, top-N bar chart of
  // named managers by case volume is exactly the "score or rank an
  // individual manager" pattern this phase's own cross-cutting
  // constraint prohibits, the same reasoning managerInsights.js's
  // "never a per-manager score" framing and riskMap.js's exclusion of
  // "management capability" from its per-site flags already apply.
  const outcomeEntries = withSampleFloor(topEntries(overview.cases_by_outcome));
  const maxOf = entries => Math.max(1, ...entries.map(([,v])=>v));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        <StatBox label="Open cases" value={overview.open_cases} sub={overview.total_cases+" total"}/>
        <StatBox label="Opened this month" value={overview.opened_in_period} accent="#1A7A4A"/>
        <StatBox label="Closed this month" value={overview.closed_in_period} accent="#1A7A4A"/>
        <StatBox label="Overdue cases" value={overdueCaseIds.size} accent={overdueCaseIds.size>0?"#C84B2F":"#1A7A4A"}/>
        <StatBox label="Returned for further investigation" value={returnedForFurtherInvestigation} accent="#B87520"/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
        {overview.closed_cases_with_duration >= MIN_DURATION_SAMPLE
          ? <StatBox label="Avg case duration" value={overview.avg_case_duration_days+"d"} sub={overview.closed_cases_with_duration+" closed cases measured"}/>
          : <DataQualityCaveat total={overview.closed_cases_with_duration} minRequired={MIN_DURATION_SAMPLE} label="closed cases with measurable duration"/>}
        {investigationCaseCount >= MIN_DURATION_SAMPLE
          ? <StatBox label="Avg investigation duration" value={avgInvestigationDays+"d"} sub={investigationCaseCount+" cases currently in investigation"} accent="#7C5CFC"/>
          : <DataQualityCaveat total={investigationCaseCount} minRequired={MIN_DURATION_SAMPLE} label="cases currently in investigation"/>}
        <StatBox label="Informal resolution" value={resolutionSplit.informal} sub={resolutionSplit.formal+" formal"} accent="#1A7A4A"/>
        <div style={{background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.4px",textTransform:"uppercase",marginBottom:4}}>Appeal rate</div>
          <div style={{fontSize:13,color:"#6B6375"}}>Coming with Appeal Intelligence, later in this phase.</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
        <Panel title="Cases by type">
          {typeEntries.visible.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No data yet.</div>}
          {typeEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(typeEntries.visible)}/>)}
          {typeEntries.suppressedCount>0 && <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>{typeEntries.suppressedCount} categor{typeEntries.suppressedCount===1?"y":"ies"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Cases by site">
          {locationEntries.visible.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No data yet.</div>}
          {locationEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(locationEntries.visible)} color="#B87520"/>)}
          {locationEntries.suppressedCount>0 && <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>{locationEntries.suppressedCount} site{locationEntries.suppressedCount===1?"":"s"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Cases by department">
          {departmentEntries.visible.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No data yet.</div>}
          {departmentEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(departmentEntries.visible)} color="#1C5AA0"/>)}
          {departmentEntries.suppressedCount>0 && <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>{departmentEntries.suppressedCount} department{departmentEntries.suppressedCount===1?"":"s"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Outcome types">
          {outcomeEntries.visible.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No recorded outcomes yet.</div>}
          {outcomeEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(outcomeEntries.visible)} color="#C84B2F"/>)}
          {outcomeEntries.suppressedCount>0 && <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>{outcomeEntries.suppressedCount} outcome{outcomeEntries.suppressedCount===1?"":"s"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Repeat case themes">
          {themeFrequencies.length===0 && <div style={{fontSize:12,color:"#9B9098"}}>No recurring themes tagged across 3+ cases yet.</div>}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {themeFrequencies.map(t=>(
              <span key={t.themeId} style={{fontSize:11,color:"#6B6375",background:"#FDFAF5",border:"1px solid #E8E0D0",borderRadius:20,padding:"3px 10px"}}>{t.name} · {t.count} case{t.count===1?"":"s"}</span>
            ))}
          </div>
        </Panel>
      </div>

      <SiteIntelligencePanel overview={overview}/>
      <BenchmarkingPanel overview={overview} cases={cases}/>

      <div>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Process bottlenecks by site</div>
        <ProcessBottlenecksPanel cases={cases} employeeRecords={employeeRecords} processTemplates={processTemplates} onOpenCase={onOpenCase}/>
      </div>

      <AppealIntelligencePanel allegations={allegations} cases={cases} caseSignals={caseSignals}/>

      <CaseQualityAnalyticsPanel cases={cases} allegations={allegations} caseSignals={caseSignals} caseTasks={caseTasks} policies={policies} caseAccess={caseAccess} orgMembers={orgMembers}/>

      <PolicyEffectivenessPanel caseSignals={caseSignals} hrReviewRequests={hrReviewRequests}/>
    </div>
  );
}
