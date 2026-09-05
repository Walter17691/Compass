import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { computeStageDurations } from '../lib/processDashboard';
import { computeInformalFormalSplit } from '../lib/orgIntelligence';
import { themeFrequency } from '../lib/themes';
import { daysBetween } from '../lib/dateMath';
import { getCaseStage } from '../lib/caseStage';
import { medianOpenCaseAge, computeNeedsAttentionSignals, casesRequiringAttention, OLD_CASE_THRESHOLD_DAYS } from '../lib/needsAttention';
import { COLOR, FONT } from '../styles/tokens';
import { DataQualityCaveat } from './DataQualityCaveat';
import { DataRow, RowChevron, RowPrimary, RowSecondary } from './design/DataRow';
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

// Phase 2B (Compass Design Vision §3) — default accent is neutral ink,
// not the brand purple: a plain count (open cases, avg duration) isn't
// an interactive/primary element, so it shouldn't borrow that colour.
// Explicit accent props (green for positive, red for overdue) are
// unchanged — those are genuinely semantic. `large` gives the one or
// two promoted headline metrics a bigger, calmer treatment without a
// different DOM shape (label + value stay direct siblings under one
// wrapper, same as every other tile — several tests key off exactly
// that structure).
const StatBox = ({ label, value, sub, accent = COLOR.ink, large = false }) => (
  <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:10,padding:large?"22px 24px":"16px 18px"}}>
    <div style={{fontSize:11,fontWeight:600,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>{label}</div>
    <div style={{fontSize:large?36:26,fontWeight:700,color:accent,fontFamily:FONT.serif,marginBottom:4,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:12,color:COLOR.inkFaint}}>{sub}</div>}
  </div>
);

// Phase 2B — one neutral bar colour across every breakdown (type/site/
// department/outcome). These are category counts, not urgency states;
// the old per-panel amber/blue/red assignments implied a severity that
// isn't there (Compass Design Vision §7 — neutral grey for categories
// that aren't inherently urgent, colour reserved for genuine semantic
// meaning elsewhere).
const BarRow = ({ label, value, max, color = COLOR.inkQuiet }) => (
  <div style={{marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
      <span style={{fontSize:12,color:COLOR.ink,fontWeight:500}}>{label}</span>
      <span style={{fontSize:12,color:COLOR.inkFaint}}>{value}</span>
    </div>
    <div style={{background:COLOR.borderFaint,borderRadius:3,height:6}}>
      <div style={{background:color,borderRadius:3,height:6,width:`${max>0?Math.round((value/max)*100):0}%`,transition:"width 0.3s"}}/>
    </div>
  </div>
);

const Panel = ({ title, children }) => (
  <div style={{background:COLOR.surface,border:`1px solid ${COLOR.borderFaint}`,borderRadius:10,padding:"16px 18px"}}>
    <div style={{fontSize:11,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>{title}</div>
    {children}
  </div>
);

// Insights Phase 2 (Overview Intelligence) — one deterministic, factual
// signal line per row, with an optional drill-down into the exact case
// set that produced it. Never renders a "View cases" control when the
// caller hasn't wired one up (onOpenCase-only callers, e.g. some existing
// tests, simply get a plain line with no dead link).
const AttentionSignal = ({ children, onView }) => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 2px",borderBottom:`1px solid ${COLOR.borderFaint}`}}>
    <span style={{fontSize:13,color:COLOR.ink,lineHeight:1.5}}>{children}</span>
    {onView && <button type="button" onClick={onView} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,flexShrink:0,padding:0,whiteSpace:"nowrap"}}>View cases →</button>}
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
// job (Appeal Intelligence) — AppealIntelligencePanel below already
// covers this with its own real StatBox; Phase 7.5B removed the stale
// "Coming... later in this phase" placeholder that used to sit in the
// grid above, since the feature it was waiting on had already shipped.
export function OrganisationalIntelligenceOverview({ orgId, cases, dueSoon, hrReviewRequests, processTemplates, employeeRecords, onOpenCase, onViewCases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers, caseThemes, organisationThemes }) {
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
  // Insights Phase 2 (Overview Intelligence) — cases/dueSoon are the same
  // already-loaded, RLS-scoped arrays every other calculation on this page
  // already uses; no new fetch, no new overdue/open-case definition (see
  // lib/needsAttention.js's own header for why).
  const medianAge = useMemo(() => medianOpenCaseAge(cases), [cases]);
  const needsAttention = useMemo(() => computeNeedsAttentionSignals({ cases, dueSoon }), [cases, dueSoon]);
  const attentionCases = useMemo(() => casesRequiringAttention({ cases, dueSoon }), [cases, dueSoon]);
  const needsAttentionOpenCount = useMemo(
    () => new Set([...needsAttention.overdueCaseIds, ...needsAttention.olderThan30CaseIds]).size,
    [needsAttention]
  );

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

  // Phase 2B (Compass Design Vision §3) — "Open cases" promoted to a
  // single headline tile with the opened/closed-this-month figures
  // folded into its own interpretive line, rather than four equal-sized
  // tiles competing for attention. Both figures are real, already-
  // fetched values from the same RPC — nothing invented or compared
  // that wasn't already being shown. Overdue/Returned stay as their own
  // smaller tiles since they're the two counts that most directly say
  // "look here," not because they need equal visual weight to the
  // headline.
  const monthlyMovement = `${overview.opened_in_period} opened, ${overview.closed_in_period} closed this month`;

  // 10/10 pass, item 6 (executive clarity) — every figure below already
  // existed as its own stat tile; this synthesises the same numbers into
  // one lead sentence so the page reads insight-first ("here's what's
  // going on, here's the evidence") rather than metric-first ("here are
  // some numbers, work out what they mean yourself"). No new calculation
  // — overdueCaseIds/avgInvestigationDays/resolutionSplit are the exact
  // values the tiles beneath already render, just said in a sentence
  // first. Deliberately factual, not alarmist, in tone either direction —
  // "2 overdue" reads the same whether that's good or bad news for this
  // org's size, so the sentence doesn't editorialise beyond the numbers.
  const headline = [
    `${overview.open_cases} open case${overview.open_cases===1?"":"s"}`,
    needsAttentionOpenCount>0 && `${needsAttentionOpenCount} needing attention`,
    overdueCaseIds.size>0 && `${overdueCaseIds.size} overdue`,
    investigationCaseCount>=MIN_DURATION_SAMPLE && `investigations averaging ${avgInvestigationDays}d`,
    (resolutionSplit.informal+resolutionSplit.formal)>0 && `${resolutionSplit.informal} resolved informally, ${resolutionSplit.formal} formally`,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{fontSize:14,color:COLOR.ink,lineHeight:1.6}}>{headline}.</div>

      {/* 10/10 pass, Part B, item 10 — this used to be 6 equal-ish stat
          tiles across two grid rows (plus up to 2 DataQualityCaveats),
          all before a reader reached anything else on the tab. The
          headline sentence above already carries these same figures in
          one place; only "Open cases" earns real headline-tile
          treatment now (it's the one number that answers "how big is
          the current workload," the anchor everything else here relates
          to). Overdue/Returned/durations/informal-formal split move into
          one compact inline row — same values, same DataQualityCaveat
          suppression for genuinely small samples, just sized to their
          actual importance rather than a uniform tile grid. */}
      <StatBox large label="Open cases" value={overview.open_cases} sub={`${overview.total_cases} total · ${monthlyMovement}`}/>

      <div style={{display:"flex",flexWrap:"wrap",columnGap:24,rowGap:8,padding:"2px 2px"}}>
        <span style={{fontSize:12.5}}><span style={{color:COLOR.inkFaint}}>Needing attention </span><span style={{color:needsAttentionOpenCount>0?COLOR.amber:COLOR.ink,fontWeight:600}}>{needsAttentionOpenCount}</span></span>
        {medianAge.applicable &&
          <span style={{fontSize:12.5}}><span style={{color:COLOR.inkFaint}}>Median open case age </span><span style={{color:COLOR.ink,fontWeight:600}}>{medianAge.median}d</span></span>}
        <span style={{fontSize:12.5}}><span style={{color:COLOR.inkFaint}}>Overdue </span><span style={{color:overdueCaseIds.size>0?COLOR.red:COLOR.ink,fontWeight:600}}>{overdueCaseIds.size}</span></span>
        <span style={{fontSize:12.5}}><span style={{color:COLOR.inkFaint}}>Returned for further investigation </span><span style={{color:returnedForFurtherInvestigation>0?COLOR.amber:COLOR.ink,fontWeight:600}}>{returnedForFurtherInvestigation}</span></span>
        <span style={{fontSize:12.5}}><span style={{color:COLOR.inkFaint}}>Informal / formal </span><span style={{color:COLOR.ink,fontWeight:600}}>{resolutionSplit.informal} / {resolutionSplit.formal}</span></span>
        {overview.closed_cases_with_duration >= MIN_DURATION_SAMPLE &&
          <span style={{fontSize:12.5}}><span style={{color:COLOR.inkFaint}}>Avg case duration </span><span style={{color:COLOR.ink,fontWeight:600}}>{overview.avg_case_duration_days}d</span></span>}
        {investigationCaseCount >= MIN_DURATION_SAMPLE &&
          <span style={{fontSize:12.5}}><span style={{color:COLOR.inkFaint}}>Avg investigation duration </span><span style={{color:COLOR.ink,fontWeight:600}}>{avgInvestigationDays}d</span></span>}
      </div>
      {/* Same DataQualityCaveat component/wording every other Insights
          tab uses for a below-threshold sample — kept as its own quiet
          (already borderless) line rather than folded into the compact
          row above, so its fuller "why this is limited" explanation
          isn't truncated into a terse metric pair. */}
      {overview.closed_cases_with_duration < MIN_DURATION_SAMPLE &&
        <DataQualityCaveat total={overview.closed_cases_with_duration} minRequired={MIN_DURATION_SAMPLE} label="closed cases with measurable duration"/>}
      {investigationCaseCount < MIN_DURATION_SAMPLE &&
        <DataQualityCaveat total={investigationCaseCount} minRequired={MIN_DURATION_SAMPLE} label="cases currently in investigation"/>}
      {!medianAge.applicable &&
        <DataQualityCaveat total={medianAge.total} minRequired={MIN_DURATION_SAMPLE} label="open cases with a known creation date"/>}

      {/* Insights Phase 2 (Overview Intelligence) — the section this whole
          phase exists for. Three deterministic, explainable signals only
          (see lib/needsAttention.js): an overdue count already owned by
          deadlines.js, a >30-day open-case ageing fact (a bucket, not an
          SLA claim), and a majority case-type concentration fact (≥50% of
          the open caseload, confirmed threshold — see that module's own
          header for why no existing repo convention covered this). A
          fourth candidate ("no recorded task activity") was deliberately
          left out of this phase — case_tasks.updated_at exists in the
          database but is never mapped into client state (App.jsx's
          loadCaseTasks only keeps created_at), so no reliable "last
          touched" timestamp is currently available to support that
          statement; expanding what's fetched is a data-shape change
          outside this phase's approved scope. */}
      <div>
        <div style={{fontSize:11,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Needs attention</div>
        {needsAttention.overdueCount===0 && needsAttention.olderThan30Count===0 && !needsAttention.concentration && (
          <div style={{fontSize:12,color:COLOR.inkFaint,padding:"10px 2px"}}>No cases currently require attention.</div>
        )}
        {needsAttention.overdueCount>0 && (
          <AttentionSignal onView={onViewCases ? () => onViewCases({ caseIds: Array.from(needsAttention.overdueCaseIds) }) : null}>
            {needsAttention.overdueCount} case{needsAttention.overdueCount===1?" has":"s have"} an overdue action.
          </AttentionSignal>
        )}
        {needsAttention.olderThan30Count>0 && (
          <AttentionSignal onView={onViewCases ? () => onViewCases({ caseIds: Array.from(needsAttention.olderThan30CaseIds) }) : null}>
            {needsAttention.olderThan30Count} open case{needsAttention.olderThan30Count===1?" is":"s are"} more than {OLD_CASE_THRESHOLD_DAYS} days old.
          </AttentionSignal>
        )}
        {needsAttention.concentration && (
          <AttentionSignal onView={onViewCases ? () => onViewCases({ type: needsAttention.concentration.caseType }) : null}>
            {needsAttention.concentration.caseType} accounts for {needsAttention.concentration.pct}% of the current open caseload ({needsAttention.concentration.count} of {needsAttention.concentration.totalOpen} cases).
          </AttentionSignal>
        )}
      </div>

      {attentionCases.length>0 && (
        <div>
          <div style={{fontSize:11,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Cases requiring attention</div>
          <div>
            {attentionCases.map(row => {
              const caseObj = cases.find(cs => cs.id === row.caseId);
              return (
                <DataRow key={row.caseId} attention>
                  <button type="button" onClick={() => onOpenCase?.(row.caseId, caseObj ? getCaseStage(caseObj) : undefined)}
                    style={{flex:1,minWidth:0,padding:"10px 2px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,background:"none",border:"none",textAlign:"left",font:"inherit",color:"inherit"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <RowPrimary>{row.employeeName}</RowPrimary>
                      <RowSecondary>
                        <span>{row.caseType}</span>
                        {row.age!=null && <span>· {row.age}d open</span>}
                      </RowSecondary>
                    </div>
                    <span style={{fontSize:11.5,fontWeight:600,color:row.overdue?COLOR.red:COLOR.amber,textAlign:"right",flexShrink:1,minWidth:0}}>{row.reason}</span>
                    <RowChevron/>
                  </button>
                </DataRow>
              );
            })}
          </div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
        <Panel title="Cases by type">
          {typeEntries.visible.length===0 && <div style={{fontSize:12,color:COLOR.inkFaint}}>No data yet.</div>}
          {typeEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(typeEntries.visible)}/>)}
          {typeEntries.suppressedCount>0 && <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>{typeEntries.suppressedCount} categor{typeEntries.suppressedCount===1?"y":"ies"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Cases by site">
          {locationEntries.visible.length===0 && <div style={{fontSize:12,color:COLOR.inkFaint}}>No data yet.</div>}
          {locationEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(locationEntries.visible)}/>)}
          {locationEntries.suppressedCount>0 && <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>{locationEntries.suppressedCount} site{locationEntries.suppressedCount===1?"":"s"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Cases by department">
          {departmentEntries.visible.length===0 && <div style={{fontSize:12,color:COLOR.inkFaint}}>No data yet.</div>}
          {departmentEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(departmentEntries.visible)}/>)}
          {departmentEntries.suppressedCount>0 && <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>{departmentEntries.suppressedCount} department{departmentEntries.suppressedCount===1?"":"s"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Outcome types">
          {outcomeEntries.visible.length===0 && <div style={{fontSize:12,color:COLOR.inkFaint}}>No recorded outcomes yet.</div>}
          {outcomeEntries.visible.map(([k,v])=><BarRow key={k} label={k} value={v} max={maxOf(outcomeEntries.visible)}/>)}
          {outcomeEntries.suppressedCount>0 && <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>{outcomeEntries.suppressedCount} outcome{outcomeEntries.suppressedCount===1?"":"s"} with under {MIN_BAR_SAMPLE} cases not shown</div>}
        </Panel>
        <Panel title="Repeat case themes">
          {themeFrequencies.length===0 && <div style={{fontSize:12,color:COLOR.inkFaint}}>No recurring themes tagged across 3+ cases yet.</div>}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {themeFrequencies.map(t=>(
              <span key={t.themeId} style={{fontSize:11,color:COLOR.inkSoft,background:COLOR.paper,border:`1px solid ${COLOR.borderFaint}`,borderRadius:20,padding:"3px 10px"}}>{t.name} · {t.count} case{t.count===1?"":"s"}</span>
            ))}
          </div>
        </Panel>
      </div>

      <SiteIntelligencePanel overview={overview}/>
      <BenchmarkingPanel overview={overview} cases={cases}/>

      <div>
        <div style={{fontSize:11,fontWeight:700,color:COLOR.inkFaint,letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Process bottlenecks by site</div>
        <ProcessBottlenecksPanel cases={cases} employeeRecords={employeeRecords} processTemplates={processTemplates} onOpenCase={onOpenCase}/>
      </div>

      <AppealIntelligencePanel allegations={allegations} cases={cases} caseSignals={caseSignals}/>

      <CaseQualityAnalyticsPanel cases={cases} allegations={allegations} caseSignals={caseSignals} caseTasks={caseTasks} policies={policies} caseAccess={caseAccess} orgMembers={orgMembers}/>

      <PolicyEffectivenessPanel caseSignals={caseSignals} hrReviewRequests={hrReviewRequests}/>
    </div>
  );
}
