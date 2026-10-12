import { COLOR, SPACE, TYPE } from '../styles/tokens';
import { useState } from 'react';
import { INVESTIGATION_REVIEW_STATUSES, investigationReviewStatusLabel, decisionNoteMissing, decisionNoteRequirement } from '../lib/approvals';

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
                {/* One field, two requirements. The note is optional for five of
                    the six actions and mandatory for "Request clarification",
                    so the label says both rather than claiming "(optional)" —
                    which is what made the A3c guard look like a bug. */}
                <textarea aria-label="Review comments" value={comments} onChange={e=>setComments(e.target.value)}
                  aria-describedby={`hr-review-note-hint-${r.id}`}
                  placeholder="Comments — required to request clarification, optional otherwise" rows={2}
                  style={{width:"100%",fontSize:12,border:`1px solid ${COLOR.border}`,borderRadius:6,padding:"6px 10px",color:COLOR.ink,boxSizing:"border-box",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif",marginBottom:8}}/>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {INVESTIGATION_REVIEW_STATUSES.map(s=>{
                    // Real `disabled`, not just styling: that is what makes
                    // Enter and Space on a focused button inert too, so the
                    // keyboard path cannot bypass the rule.
                    const blocked = decisionNoteMissing(s.id, comments);
                    return (
                      <button key={s.id} disabled={blocked} aria-disabled={blocked}
                        title={blocked?decisionNoteRequirement(s.id):undefined}
                        onClick={()=>{
                          if(decisionNoteMissing(s.id, comments)) return;
                          resolveInvestigationReview(r.id, cs.id, s.id, comments);setComments("");
                        }}
                        style={{fontSize:11,color:blocked?COLOR.inkFaint:s.id==="approved"?"#FFFFFF":COLOR.inkSoft,background:blocked?"none":s.id==="approved"?COLOR.green:"none",border:blocked?`1px dashed ${COLOR.borderFaint}`:s.id==="approved"?"none":`1px solid ${COLOR.border}`,borderRadius:5,padding:"5px 10px",cursor:blocked?"not-allowed":"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:s.id==="approved"&&!blocked?600:400}}>{s.actionLabel}</button>
                    );
                  })}
                </div>
                {/* Always rendered, so the textarea's aria-describedby always
                    resolves. It explains the disabled button when one is
                    disabled, and sets the expectation before the user types
                    when none is. */}
                <div id={`hr-review-note-hint-${r.id}`} style={{fontSize:11,color:COLOR.inkFaint,marginTop:6}}>
                  {INVESTIGATION_REVIEW_STATUSES.some(s=>decisionNoteMissing(s.id, comments))
                    ? decisionNoteRequirement("clarification_requested")
                    : "A comment is optional for these decisions, except when requesting clarification."}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
