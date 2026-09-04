import { isGrievanceCase } from '../../lib/caseStage';
import { getProcessType } from '../../lib/processStages';
import { FONT } from '../../styles/tokens';

// Phase 6.5 hardening (closes Prompt 16 audit finding H12, HIGH) — this
// used to hardcode a fixed list of stage ids ("disciplinary"/"hearing"/
// "outcome"/"appeal"/"closed") as the only ones that count as "reached",
// which only covers the disciplinary and grievance stage shapes. Every
// other process type (long-term sickness, flexible working) has its own
// stage vocabulary that never intersects that list — a long-term-
// sickness case's own late stages ("occupational_health",
// "capability_consideration") could never satisfy `reached`, and since
// cs.outcome can only ever be set by clicking the button `reached` itself
// gates, those cases could never record an outcome through this tab at
// all, permanently. Derived generically from the case's own process
// type instead: "reached" once the case is at the stage immediately
// before its own type's outcome-equivalent stage ("outcome" or
// "decision", whichever that type's own stage list actually has) or
// later — the same threshold disciplinary/grievance already used, just
// computed instead of hardcoded, so it's automatically correct for every
// process type's own vocabulary.
function isOutcomeReachable(cs, stage) {
  if (cs.outcome) return true;
  const stageIds = getProcessType(cs?.caseType).stages.map(s => s.id);
  const outcomeStageId = stageIds.includes("outcome") ? "outcome" : stageIds.includes("decision") ? "decision" : null;
  if (!outcomeStageId) return false;
  const currentIndex = stageIds.indexOf(stage);
  const outcomeIndex = stageIds.indexOf(outcomeStageId);
  return currentIndex !== -1 && currentIndex >= outcomeIndex - 1;
}

// No longer gated to viewing the Disciplinary meetings group — this is
// its own tab now, so it reads the case's actual lifecycle stage
// directly to decide what to show. "hearing" is grievance's equivalent
// in-progress stage to disciplinary's "disciplinary".
export function OutcomeTab({ cs, stage, fmtDate, setShowOutcomeModal, canDecide }) {
  const grievance = isGrievanceCase(cs);
  const reached = isOutcomeReachable(cs, stage);

  if (!reached) {
    return (
      <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8E0D0"}}>
        <div style={{fontSize:14,color:"#9B9098"}}>No outcome yet — this case hasn't reached {grievance?"a grievance meeting":"a disciplinary hearing"}.</div>
      </div>
    );
  }

  if (cs.outcome) {
    return (
      <div style={{background:"#E8F5EE",border:"1px solid #A8D5B5",borderRadius:12,padding:"16px 20px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#1A7A4A",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Outcome issued</div>
        <div style={{fontSize:14,fontWeight:600,color:"#1C1820",marginBottom:4}}>{cs.outcome}</div>
        <div style={{fontSize:12,color:"#6B6375"}}>Issued {fmtDate(cs.outcomeDate)} · Appeal window: 5 working days from issue</div>
      </div>
    );
  }

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px 20px"}}>
      <div style={{fontSize:13,color:"#1C1820",fontWeight:600,marginBottom:4}}>Issue {grievance?"grievance":"disciplinary"} outcome</div>
      <div style={{fontSize:12,color:"#6B6375",marginBottom:14}}>Once the hearing is complete, issue the written outcome. ACAS recommends within 5 working days of the hearing. The outcome letter starts the employee's 5-day appeal window.</div>
      {canDecide ? (
        <button onClick={()=>setShowOutcomeModal(true)} style={{fontSize:13,background:"#1C1820",border:"none",borderRadius:8,padding:"10px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Issue outcome →</button>
      ) : (
        <div style={{fontSize:12,color:"#9B9098"}}>Only HR or this case's Hearing Manager can issue the outcome.</div>
      )}
    </div>
  );
}
