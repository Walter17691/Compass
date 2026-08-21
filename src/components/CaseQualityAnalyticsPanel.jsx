import { useMemo } from 'react';
import { computeCaseQualityAnalytics, CASE_QUALITY_MIN_SAMPLE_SIZE } from '../lib/caseQualityAnalytics';
import { DataQualityCaveat } from './DataQualityCaveat';

const BarRow = ({ label, value, max, color = "#C84B2F" }) => (
  <div style={{marginBottom:8}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
      <span style={{fontSize:12,color:"#1C1820"}}>{label}</span>
      <span style={{fontSize:12,color:"#9B9098"}}>{value.count} case{value.count===1?"":"s"} ({value.pct}%)</span>
    </div>
    <div style={{background:"#F5F1EA",borderRadius:3,height:5}}>
      <div style={{background:color,borderRadius:3,height:5,width:`${max>0?Math.round((value.count/max)*100):0}%`}}/>
    </div>
  </div>
);

// Organisational ER Intelligence (Phase 6, OP12, §9) — case quality
// analytics. Aggregates caseReadiness.js's and guardrails.js's existing
// per-case checks (see caseQualityAnalytics.js's own header for the
// full data lineage) into "most frequent issue" rankings, no new
// RPC/table needed.
export function CaseQualityAnalyticsPanel({ cases, allegations, caseSignals, caseTasks, policies, caseAccess, orgMembers }) {
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
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Case quality analytics</div>
        <DataQualityCaveat total={data.totalCases} minRequired={CASE_QUALITY_MIN_SAMPLE_SIZE} label="cases"/>
      </div>
    );
  }

  const topIssues = data.issues.slice(0, 8);
  const max = Math.max(1, ...topIssues.map(i => i.count));

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:10}}>Case quality analytics</div>
      {topIssues.length === 0
        ? <div style={{fontSize:13,color:"#6B6375"}}>No recurring case-quality issues identified across {data.totalCases} cases.</div>
        : topIssues.map(issue => <BarRow key={issue.id} label={issue.label} value={issue} max={max}/>)}
    </div>
  );
}
