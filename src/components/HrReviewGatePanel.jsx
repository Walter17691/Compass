import { COLOR, SPACE, TYPE } from '../styles/tokens';
import { useState } from 'react';
import { INVESTIGATION_REVIEW_STATUSES, investigationReviewStatusLabel } from '../lib/approvals';

// Manager Enablement (Phase 4, MP11, §17) — HR Review Gate. A separate
// panel from ApprovalsPanel (P9's own approve/reject sign-off for
// outcome-gated actions, unchanged), specifically for investigation
// submissions (step:"inv_report", MP10's own finalizeInvestigationSubmission).
// Shows every submission on this case, newest first — a returned
// investigation can be resubmitted, producing a new request rather than
// overwriting the old one, so the review history stays visible.
// 10/10 pass, Part A — see ApprovalsPanel's own comment: no longer its
// own card, composes as a subsection of "Case readiness"; per-request
// boxes became rows. Logic/handlers unchanged.
export function HrReviewGatePanel({ cs, hrReviewRequests, resolveInvestigationReview, isHR }) {
  const requests = (hrReviewRequests || []).filter(r => r.case_id === cs.id && r.step === "inv_report")
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));
  const [comments, setComments] = useState("");
  if (!requests.length) return null;
  const pending = requests.find(r => r.status === "pending");

  return (
    <div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>HR Review Gate</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {requests.map((r,i)=>(
          <div key={r.id} style={{padding:"10px 0",borderBottom:i<requests.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:600,color:COLOR.ink}}>Investigation submitted</span>
              <span style={{fontSize:11,fontWeight:700,color:r.status==="pending"?COLOR.amber:r.status==="returned"?COLOR.red:COLOR.green}}>{investigationReviewStatusLabel(r.status)}</span>
            </div>
            {r.requested_by_name&&<div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>Submitted by {r.requested_by_name}</div>}
            {r.status!=="pending"&&r.reviewed_by_name&&<div style={{fontSize:11,color:COLOR.inkFaint,marginTop:2}}>By {r.reviewed_by_name}{r.comments?": "+r.comments:""}</div>}
            {r.status==="pending"&&isHR&&r===pending&&(
              <div style={{marginTop:10}}>
                <textarea aria-label="Review comments" value={comments} onChange={e=>setComments(e.target.value)} placeholder="Comments (optional)" rows={2}
                  style={{width:"100%",fontSize:12,border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"6px 10px",color:COLOR.ink,boxSizing:"border-box",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",marginBottom:8}}/>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {INVESTIGATION_REVIEW_STATUSES.map(s=>(
                    <button key={s.id} onClick={()=>{resolveInvestigationReview(r.id, cs.id, s.id, comments);setComments("");}}
                      style={{fontSize:11,color:s.id==="approved"?"#FFFFFF":COLOR.inkSoft,background:s.id==="approved"?COLOR.green:"none",border:s.id==="approved"?"none":`1px solid ${COLOR.border}`,borderRadius:5,padding:"5px 10px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:s.id==="approved"?600:400}}>{s.actionLabel}</button>
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
