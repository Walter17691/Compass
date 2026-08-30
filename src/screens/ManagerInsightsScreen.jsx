import { Card, Btn } from '../components/Primitives';
import { computeManagerPerformanceInsights } from '../lib/managerInsights';
import { collectInterventionSignals } from '../lib/managerLearningLoop';
import { COLOR, TYPE, RADIUS } from '../styles/tokens';

// Design System Convergence pass, Phase 4 — five equally-weighted KPI
// cards, none more important-looking than the others, before any
// interpretation. Organisational Intelligence's own pattern (headline
// sentence -> compact metrics -> evidence) applies here too: same five
// figures, same computeManagerPerformanceInsights values, now one
// synthesised lead sentence plus a compact inline row instead of a
// five-card wall — no single number promoted to "the" headline tile,
// since none of the five is obviously more important than the others
// the way Organisational Intelligence's Open Cases count was.

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
    <div style={{maxWidth:900,margin:"0 auto",padding:"8px 0 40px"}}>
      <h2 style={{...TYPE.pageTitle,color:COLOR.ink,margin:"0 0 4px"}}>Manager Performance Insights</h2>
      <p style={{fontSize:13,color:COLOR.inkFaint,margin:"0 0 24px",maxWidth:560}}>
        Aggregated, organisation-wide trends across delegated investigations — advisory context for training and process decisions, not a score for any individual manager.
      </p>

      {insights.delegatedCaseCount===0 ? (
        <Card style={{textAlign:"center",padding:"32px 20px",color:COLOR.inkFaint,fontSize:13,border:`1px solid ${COLOR.borderFaint}`}}>No investigations have been delegated yet — insights will appear here once managers start taking on investigations.</Card>
      ) : (
        <>
          <div style={{fontSize:14,color:COLOR.ink,lineHeight:1.6,marginBottom:12}}>
            {[
              `${insights.delegatedCaseCount} delegated investigation${insights.delegatedCaseCount===1?"":"s"}`,
              insights.avgInvestigationCompletionDays!==null && `averaging ${insights.avgInvestigationCompletionDays} days to complete`,
              insights.investigationsReturnedForRework>0 && `${insights.investigationsReturnedForRework} returned for rework`,
              insights.overdueManagerActions>0 && `${insights.overdueManagerActions} overdue action${insights.overdueManagerActions===1?"":"s"}`,
            ].filter(Boolean).join(" · ")}.
          </div>
          <div style={{display:"flex",flexWrap:"wrap",columnGap:24,rowGap:8,fontSize:12.5}}>
            <span><span style={{color:COLOR.inkFaint}}>Avg. investigation completion </span><span style={{color:COLOR.ink,fontWeight:600}}>{insights.avgInvestigationCompletionDays!==null?insights.avgInvestigationCompletionDays+"d":"Not enough data"}</span></span>
            <span><span style={{color:COLOR.inkFaint}}>Returned for rework </span><span style={{color:COLOR.ink,fontWeight:600}}>{insights.investigationsReturnedForRework}</span></span>
            <span><span style={{color:COLOR.inkFaint}}>Overdue manager actions </span><span style={{color:COLOR.ink,fontWeight:600}}>{insights.overdueManagerActions}</span></span>
            <span><span style={{color:COLOR.inkFaint}}>Meeting quality gaps </span><span style={{color:COLOR.ink,fontWeight:600}}>{insights.meetingQualityGapsCount}</span></span>
            <span><span style={{color:COLOR.inkFaint}}>Process deviations </span><span style={{color:COLOR.ink,fontWeight:600}}>{insights.processDeviationsCount}</span></span>
          </div>
          <div style={{fontSize:11,color:COLOR.inkFaint,marginTop:8}}>{insights.investigationCompletionSampleSize>0?"Completion average based on "+insights.investigationCompletionSampleSize+" completed investigation"+(insights.investigationCompletionSampleSize===1?"":"s")+".":"Completion average: assignment to submission, across all investigators."} Returned/overdue/quality/deviation figures are organisation-wide, not attributed to any individual manager.</div>
        </>
      )}

      <div style={{marginTop:36,paddingTop:28,borderTop:`1px solid ${COLOR.borderFaint}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,marginBottom:16,flexWrap:"wrap"}}>
          <div>
            <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:4}}>Manager Capability Insight</div>
            <p style={{fontSize:13,color:COLOR.inkFaint,margin:0,maxWidth:520}}>Recurring themes across HR's own recorded interventions, with a suggested organisational response — never a comment on any named manager.</p>
          </div>
          {onGenerateManagerInsight&&(
            <Btn onClick={onGenerateManagerInsight} disabled={generatingManagerInsight||signalCount===0}>
              {generatingManagerInsight?"Generating…":"Generate insight"}
            </Btn>
          )}
        </div>

        {signalCount===0&&!managerCapabilityInsights?.length ? (
          <Card style={{textAlign:"center",padding:"24px 20px",color:COLOR.inkFaint,fontSize:13,border:`1px solid ${COLOR.borderFaint}`}}>Not enough recorded intervention history yet — insights will be available once HR has sent guidance, returned an investigation, or recorded an override.</Card>
        ) : !managerCapabilityInsights?.length ? (
          <Card style={{textAlign:"center",padding:"24px 20px",color:COLOR.inkFaint,fontSize:13,border:`1px solid ${COLOR.borderFaint}`}}>No insight generated yet — click "Generate insight" to analyse what's been recorded so far.</Card>
        ) : managerCapabilityInsights.map(insight=>(
          <Card key={insight.id} style={{marginBottom:16,border:`1px solid ${COLOR.borderFaint}`}}>
            <div style={{fontSize:11,color:COLOR.inkFaint,marginBottom:12}}>Generated {fmtGeneratedAt(insight.created_at)} · based on {insight.sample_size} recorded intervention{insight.sample_size===1?"":"s"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              {(insight.categories||[]).map((cat,i)=>(
                <div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${COLOR.borderFaint}`}}>
                  <div style={{fontSize:13,fontWeight:600,color:COLOR.ink,marginBottom:2}}>{cat.label}</div>
                  {cat.description&&<div style={{fontSize:12,color:COLOR.inkSoft,marginBottom:cat.frequency?4:0}}>{cat.description}</div>}
                  {cat.frequency&&<div style={{fontSize:11,color:COLOR.inkFaint}}>{cat.frequency}</div>}
                </div>
              ))}
            </div>
            {insight.suggested_response&&(
              <div style={{fontSize:12,color:COLOR.ink,background:COLOR.purpleTint,borderRadius:RADIUS.surface,padding:"10px 12px"}}>
                <span style={{fontWeight:700,color:COLOR.purpleDeep}}>Suggested response: </span>{insight.suggested_response}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
