import { useState } from 'react';
import { INVESTIGATION_REVIEW_STATUSES, investigationReviewStatusLabel } from '../lib/approvals';

// Manager Enablement (Phase 4, MP11, §17) — HR Review Gate. A separate
// panel from ApprovalsPanel (P9's own approve/reject sign-off for
// outcome-gated actions, unchanged), specifically for investigation
// submissions (step:"inv_report", MP10's own finalizeInvestigationSubmission).
// Shows every submission on this case, newest first — a returned
// investigation can be resubmitted, producing a new request rather than
// overwriting the old one, so the review history stays visible.
export function HrReviewGatePanel({ cs, hrReviewRequests, resolveInvestigationReview, isHR }) {
  const requests = (hrReviewRequests || []).filter(r => r.case_id === cs.id && r.step === "inv_report")
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  const [comments, setComments] = useState("");
  if (!requests.length) return null;
  const pending = requests.find(r => r.status === "pending");

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px",marginBottom:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>HR Review Gate</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {requests.map(r=>(
          <div key={r.id} style={{border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>Investigation submitted</span>
              <span style={{fontSize:11,fontWeight:700,color:r.status==="pending"?"#B87520":r.status==="returned"?"#C84B2F":"#1A7A4A"}}>{investigationReviewStatusLabel(r.status)}</span>
            </div>
            {r.requested_by_name&&<div style={{fontSize:11,color:"#9B9098",marginTop:4}}>Submitted by {r.requested_by_name}</div>}
            {r.status!=="pending"&&r.reviewed_by_name&&<div style={{fontSize:11,color:"#9B9098",marginTop:2}}>By {r.reviewed_by_name}{r.comments?": "+r.comments:""}</div>}
            {r.status==="pending"&&isHR&&r===pending&&(
              <div style={{marginTop:10}}>
                <textarea aria-label="Review comments" value={comments} onChange={e=>setComments(e.target.value)} placeholder="Comments (optional)" rows={2}
                  style={{width:"100%",fontSize:12,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535",boxSizing:"border-box",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",marginBottom:8}}/>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {INVESTIGATION_REVIEW_STATUSES.map(s=>(
                    <button key={s.id} onClick={()=>{resolveInvestigationReview(r.id, cs.id, s.id, comments);setComments("");}}
                      style={{fontSize:11,color:s.id==="approved"?"#FFFFFF":"#6B6375",background:s.id==="approved"?"#1A7A4A":"none",border:s.id==="approved"?"none":"1px solid #E8E0D0",borderRadius:5,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:s.id==="approved"?600:400}}>{s.actionLabel}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
