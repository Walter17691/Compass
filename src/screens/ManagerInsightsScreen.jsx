import { Card, Btn } from '../components/Primitives';
import { computeManagerPerformanceInsights } from '../lib/managerInsights';
import { collectInterventionSignals } from '../lib/managerLearningLoop';

const StatTile = ({ label, value, detail }) => (
  <Card style={{flex:"1 1 200px",minWidth:200}}>
    <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>{label}</div>
    <div style={{fontSize:28,fontWeight:600,color:"#1A1535",fontFamily:"DM Serif Display,Georgia,serif"}}>{value}</div>
    {detail&&<div style={{fontSize:12,color:"#6B6375",marginTop:4}}>{detail}</div>}
  </Card>
);

const fmtGeneratedAt = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
};

// Manager Enablement (Phase 4, MP20, §24) — HR-only aggregated stats over
// what MP7/MP10/MP11/MP18/M9/P7 already produce. Deliberately org-wide
// aggregates only, no per-manager breakdown — see managerInsights.js's own
// header comment on why this is "advisory, not a judgment", same
// disclaimer discipline as caseRisk.js.
//
// Manager Enablement (Phase 4, MP21, §25) — "Manager Capability Insight"
// below closes the loop on top of the same aggregated data: App.jsx owns
// the one real AI call (generateManagerCapabilityInsight) and the
// persisted history (managerCapabilityInsights); this screen only
// triggers it and renders what's already been generated. collectInterventionSignals
// is read here too, only to decide whether there's anything worth
// generating from yet — the same function App.jsx's own call uses as its
// real input, not a separate parallel check that could drift from it.
export function ManagerInsightsScreen({ cases, caseAccess, hrReviewRequests, auditLog, dueSoon, caseTasks, managerCapabilityInsights, generatingManagerInsight, onGenerateManagerInsight }) {
  const insights = computeManagerPerformanceInsights(cases, caseAccess, hrReviewRequests, auditLog, dueSoon);
  const signalCount = collectInterventionSignals(caseTasks, hrReviewRequests, auditLog).length;

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

      <div style={{marginTop:36,paddingTop:28,borderTop:"1px solid #EDE5D8"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,marginBottom:16,flexWrap:"wrap"}}>
          <div>
            <h3 style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:19,color:"#1A1535",margin:"0 0 4px",fontWeight:600}}>Manager Capability Insight</h3>
            <p style={{fontSize:13,color:"#6B6375",margin:0,maxWidth:520}}>Recurring themes across HR's own recorded interventions, with a suggested organisational response — never a comment on any named manager.</p>
          </div>
          {onGenerateManagerInsight&&(
            <Btn onClick={onGenerateManagerInsight} disabled={generatingManagerInsight||signalCount===0}>
              {generatingManagerInsight?"Generating…":"Generate insight"}
            </Btn>
          )}
        </div>

        {signalCount===0&&!managerCapabilityInsights?.length ? (
          <Card style={{textAlign:"center",padding:"24px 20px",color:"#9B9098",fontSize:13}}>Not enough recorded intervention history yet — insights will be available once HR has sent guidance, returned an investigation, or recorded an override.</Card>
        ) : !managerCapabilityInsights?.length ? (
          <Card style={{textAlign:"center",padding:"24px 20px",color:"#9B9098",fontSize:13}}>No insight generated yet — click "Generate insight" to analyse what's been recorded so far.</Card>
        ) : managerCapabilityInsights.map(insight=>(
          <Card key={insight.id} style={{marginBottom:16}}>
            <div style={{fontSize:11,color:"#9B9098",marginBottom:12}}>Generated {fmtGeneratedAt(insight.created_at)} · based on {insight.sample_size} recorded intervention{insight.sample_size===1?"":"s"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              {(insight.categories||[]).map((cat,i)=>(
                <div key={i} style={{background:"#F9F7F2",border:"1px solid #EDE5D8",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#1A1535",marginBottom:2}}>{cat.label}</div>
                  {cat.description&&<div style={{fontSize:12,color:"#6B6375",marginBottom:cat.frequency?4:0}}>{cat.description}</div>}
                  {cat.frequency&&<div style={{fontSize:11,color:"#9B9098"}}>{cat.frequency}</div>}
                </div>
              ))}
            </div>
            {insight.suggested_response&&(
              <div style={{fontSize:12,color:"#1A1535",background:"#F5F3FF",border:"1px solid #DDD9F5",borderRadius:8,padding:"10px 12px"}}>
                <span style={{fontWeight:700,color:"#7C5CFC"}}>Suggested response: </span>{insight.suggested_response}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
