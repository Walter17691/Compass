import { COLOR, SPACE, TYPE } from '../styles/tokens';
import { approvalActionLabel, approvalStatusLabel, requiresApproval } from '../lib/approvals';

// Process Intelligence Phase 3 (P9) — shows any approval-gated action
// request for this case (OutcomeModal's requestHrReview call, generalizing
// hr_review_requests beyond its original single "record" step) with the
// spec's own status wording (Decision prepared / Awaiting approval /
// Approved / Rejected). isApprover gates who can actually record a
// decision — anyone else just sees the current status, same
// read-only-until-authorised pattern used everywhere else permission-
// gated in this app.
// 10/10 pass, Part A — no longer its own bordered card (the outer box
// was one of the 11+ near-identical surfaces the Overview redesign was
// specifically about); this now composes as a subsection inside
// OverviewTab's shared "Case readiness" surface. Per-request boxes
// became rows (bottom-border, no own background) — same reasoning,
// applied one level down: a queue reads as rows, not a stack of cards.
// Every prop, handler, and piece of data shown is byte-for-byte
// unchanged.
export function ApprovalsPanel({ cs, hrReviewRequests, respondToReview, isApprover }) {
  const requests = (hrReviewRequests || []).filter(r => r.case_id === cs.id && requiresApproval(r.step));
  if (!requests.length) return null;

  const statusColor = { approved: COLOR.green, rejected: COLOR.red };

  return (
    <div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>Approvals</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {requests.map((r,i)=>(
          <div key={r.id} style={{padding:"10px 0",borderBottom:i<requests.length-1?`1px solid ${COLOR.borderFaint}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:600,color:COLOR.ink}}>{approvalActionLabel(r.step)}</span>
              <span style={{fontSize:11,fontWeight:700,color:statusColor[r.status]||COLOR.amber}}>{approvalStatusLabel(r.status)}</span>
            </div>
            {r.record_snapshot&&<div style={{fontSize:12,color:COLOR.inkSoft,marginTop:4}}>{r.record_snapshot}</div>}
            {r.requested_by_name&&<div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>Requested by {r.requested_by_name}</div>}
            {r.status==="pending"&&isApprover&&(
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>respondToReview(r.id,"approved")} style={{fontSize:11,color:"#FFFFFF",background:COLOR.green,border:"none",borderRadius:5,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Approve</button>
                <button onClick={()=>respondToReview(r.id,"rejected")} style={{fontSize:11,color:COLOR.inkSoft,background:"none",border:`1px solid ${COLOR.border}`,borderRadius:5,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Reject</button>
              </div>
            )}
            {r.status!=="pending"&&r.reviewed_by_name&&<div style={{fontSize:11,color:COLOR.inkFaint,marginTop:4}}>By {r.reviewed_by_name}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
