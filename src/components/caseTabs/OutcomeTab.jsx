import { isGrievanceCase } from '../../lib/caseStage';

// No longer gated to viewing the Disciplinary meetings group — this is
// its own tab now, so it reads the case's actual lifecycle stage
// directly to decide what to show. "hearing" is grievance's equivalent
// in-progress stage to disciplinary's "disciplinary".
export function OutcomeTab({ cs, stage, fmtDate, setShowOutcomeModal }) {
  const grievance = isGrievanceCase(cs);
  const reached = stage==="disciplinary"||stage==="hearing"||stage==="outcome"||stage==="appeal"||stage==="closed"||!!cs.outcome;

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
      <button onClick={()=>setShowOutcomeModal(true)} style={{fontSize:13,background:"#1C1820",border:"none",borderRadius:8,padding:"10px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Issue outcome →</button>
    </div>
  );
}
