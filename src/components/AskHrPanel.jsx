// Manager Enablement (Phase 4, MP12, §13) — the receiving side of
// "Escalate to HR". Generic on purpose: shows any hr_review_requests row
// that isn't one of the fixed approval-gated outcome actions
// (ApprovalsPanel's own domain) and isn't an investigation submission
// (HrReviewGatePanel's own domain, step:"inv_report") — which today
// means the new step:"escalation" requests this phase introduces, but
// also, as a side effect of being generic rather than hardcoding that
// one step id, ReviewScreen's own pre-existing step:"record" requests
// (P9) that previously had no visible surface anywhere for HR at all.
// Deliberately simpler than HrReviewGatePanel's six-action review set —
// this is "someone needs help", not a formal investigation decision —
// so the only action is marking it resolved.
import { requiresApproval } from '../lib/approvals';

export function AskHrPanel({ cs, hrReviewRequests, respondToReview, isHR }) {
  const requests = (hrReviewRequests || []).filter(r => r.case_id === cs.id && !requiresApproval(r.step) && r.step !== "inv_report")
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  if (!requests.length) return null;

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px",marginBottom:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Ask HR</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {requests.map(r=>(
          <div key={r.id} style={{border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{r.requested_by_name?r.requested_by_name+" asked for help":"HR review requested"}</span>
              <span style={{fontSize:11,fontWeight:700,color:r.status==="pending"?"#B87520":"#1A7A4A"}}>{r.status==="pending"?"Awaiting HR response":"Resolved"}</span>
            </div>
            {r.record_snapshot&&<div style={{fontSize:12,color:"#6B6375",marginTop:6,whiteSpace:"pre-wrap"}}>{r.record_snapshot}</div>}
            {r.status==="pending"&&isHR&&(
              <div style={{marginTop:8}}>
                <button onClick={()=>respondToReview(r.id,"resolved")} style={{fontSize:11,color:"#FFFFFF",background:"#1A7A4A",border:"none",borderRadius:5,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Mark resolved</button>
              </div>
            )}
            {r.status!=="pending"&&r.reviewed_by_name&&<div style={{fontSize:11,color:"#9B9098",marginTop:6}}>By {r.reviewed_by_name}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
