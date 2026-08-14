import { Card } from '../components/Primitives';
import { computeManagerPerformanceInsights } from '../lib/managerInsights';

const StatTile = ({ label, value, detail }) => (
  <Card style={{flex:"1 1 200px",minWidth:200}}>
    <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>{label}</div>
    <div style={{fontSize:28,fontWeight:600,color:"#1A1535",fontFamily:"DM Serif Display,Georgia,serif"}}>{value}</div>
    {detail&&<div style={{fontSize:12,color:"#6B6375",marginTop:4}}>{detail}</div>}
  </Card>
);

// Manager Enablement (Phase 4, MP20, §24) — HR-only aggregated stats over
// what MP7/MP10/MP11/MP18/M9/P7 already produce. Deliberately org-wide
// aggregates only, no per-manager breakdown — see managerInsights.js's own
// header comment on why this is "advisory, not a judgment", same
// disclaimer discipline as caseRisk.js.
export function ManagerInsightsScreen({ cases, caseAccess, hrReviewRequests, auditLog, dueSoon }) {
  const insights = computeManagerPerformanceInsights(cases, caseAccess, hrReviewRequests, auditLog, dueSoon);

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"40px 20px"}}>
      <h2 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:26,color:"#7C5CFC",margin:"0 0 4px",fontWeight:600}}>Manager Performance Insights</h2>
      <p style={{fontSize:13,color:"#6B6375",margin:"0 0 24px",maxWidth:560}}>
        Aggregated, organisation-wide trends across delegated investigations — advisory context for training and process decisions, not a score for any individual manager.
      </p>

      {insights.delegatedCaseCount===0 ? (
        <Card style={{textAlign:"center",padding:"32px 20px",color:"#9B9098",fontSize:13}}>No investigations have been delegated yet — insights will appear here once managers start taking on investigations.</Card>
      ) : (
        <div style={{display:"flex",flexWrap:"wrap",gap:16}}>
          <StatTile
            label="Avg. investigation completion time"
            value={insights.avgInvestigationCompletionDays!==null?insights.avgInvestigationCompletionDays+" days":"Not enough data"}
            detail={insights.investigationCompletionSampleSize>0?"Based on "+insights.investigationCompletionSampleSize+" completed investigation"+(insights.investigationCompletionSampleSize===1?"":"s"):"Assignment to submission, across all investigators"}
          />
          <StatTile
            label="Investigations returned for rework"
            value={insights.investigationsReturnedForRework}
            detail="Sent back by HR for further investigation"
          />
          <StatTile
            label="Overdue manager actions"
            value={insights.overdueManagerActions}
            detail="Overdue deadlines on delegated investigations"
          />
          <StatTile
            label="Meeting quality gaps"
            value={insights.meetingQualityGapsCount}
            detail="Meetings ended despite unresolved quality check gaps"
          />
          <StatTile
            label="Process deviations"
            value={insights.processDeviationsCount}
            detail="Recorded departures from policy, org-wide"
          />
        </div>
      )}
    </div>
  );
}
