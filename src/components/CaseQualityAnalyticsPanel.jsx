import { useMemo } from 'react';
import { computeCaseQualityAnalytics, CASE_QUALITY_MIN_SAMPLE_SIZE } from '../lib/caseQualityAnalytics';
import { DataQualityCaveat } from './DataQualityCaveat';
import { CreateActionButton } from './CreateActionButton';
import { COLOR, TYPE, FONT } from '../styles/tokens';

// Phase 2C — neutral bar colour, not red: these are recurring case-
// process improvement opportunities, not an error/blame scoreboard —
// red implied a punitive severity the data doesn't carry.
// Insights Phase 5 — a per-issue "View cases" drill-down, independent of
// the whole-panel CASE_QUALITY_MIN_SAMPLE_SIZE gate below: the aggregate
// bar itself stays visible at any count (that gate already governs
// whether the panel renders at all), but a one- or two-case drill-down
// is only ever shown alongside a count of 3 or more — approved,
// dedicated floor for exactly this action (see the panel's own header).
const MIN_DRILLDOWN_COUNT = 3;
// Insights Phase 6 (Actionability) — Create Action is deliberately NOT
// coupled to MIN_DRILLDOWN_COUNT above. That floor exists to protect
// case identifiability on a "View cases" drill-down (a smaller aggregate
// case list is more re-identifying); creating an org-level action is an
// HR-owned workflow step with no case list attached at all, so the same
// privacy reasoning doesn't apply. Every existing CreateActionButton
// consumer (TrendsPanel, EarlySignalsPanel, RiskMapPanel,
// RootCauseExplorationPanel) already only ever shows the button on a row
// that's already individually surfaced as its own distinct signal — none
// of them apply a SEPARATE floor beyond whatever already gates that
// row's own visibility. Every issue row here is already individually
// surfaced (topIssues.slice(0,8) below), so the same convention is
// reused: one button per visible row, no additional threshold invented.
const BarRow = ({ label, value, max, color = COLOR.inkQuiet, onViewCases, createCaseTask, improvementInitiatives }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:3}}>
      <span style={{fontSize:12,color:COLOR.ink}}>{label}</span>
      <span style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <span style={{fontSize:12,color:COLOR.inkFaint}}>{value.count} case{value.count===1?"":"s"} ({value.pct}%)</span>
        {onViewCases && value.count >= MIN_DRILLDOWN_COUNT && (
          <button type="button" onClick={onViewCases} style={{fontSize:11,fontWeight:600,color:COLOR.purple,background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans,padding:0,whiteSpace:"nowrap"}}>View cases →</button>
        )}
      </span>
    </div>
    <div style={{background:COLOR.borderFaint,borderRadius:3,height:5}}>
      <div style={{background:color,borderRadius:3,height:5,width:`${max>0?Math.round((value.count/max)*100):0}%`}}/>
    </div>
    {createCaseTask && (
      <CreateActionButton
        insightRef={`Case quality: ${label} (${value.count} case${value.count===1?"":"s"})`}
        createCaseTask={createCaseTask}
        improvementInitiatives={improvementInitiatives}
      />
    )}
  </div>
);

// Organisational ER Intelligence (Phase 6, OP12, §9) — case quality
// analytics. Aggregates caseReadiness.js's and guardrails.js's existing
// per-case checks (see caseQualityAnalytics.js's own header for the
// full data lineage) into "most frequent issue" rankings, no new
// RPC/table needed.
export function CaseQualityAnalyticsPanel({ cases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers, onViewCases, createCaseTask, improvementInitiatives }) {
  // computeCaseQualityAnalytics runs every readiness + guardrail check
  // (13 checks) across every case — real cost on an org with thousands
  // of cases, and cases/allegations don't change on every render.
  const data = useMemo(
    () => computeCaseQualityAnalytics(cases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers),
    [cases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers]
  );

  if (data.totalCases < CASE_QUALITY_MIN_SAMPLE_SIZE) {
    return (
      <div>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:10}}>Case quality analytics</div>
        <DataQualityCaveat total={data.totalCases} minRequired={CASE_QUALITY_MIN_SAMPLE_SIZE} label="cases"/>
      </div>
    );
  }

  const topIssues = data.issues.slice(0, 8);
  const max = Math.max(1, ...topIssues.map(i => i.count));

  return (
    <div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:10}}>Case quality analytics</div>
      {topIssues.length === 0
        ? <div style={{fontSize:13,color:COLOR.inkFaint}}>No recurring case-quality issues identified across {data.totalCases} cases.</div>
        : topIssues.map(issue => <BarRow key={issue.id} label={issue.label} value={issue} max={max} onViewCases={onViewCases ? () => onViewCases({ caseIds: issue.caseIds }) : null} createCaseTask={createCaseTask} improvementInitiatives={improvementInitiatives}/>)}
    </div>
  );
}
