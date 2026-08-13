import { approvalActionLabel, approvalStatusLabel, requiresApproval } from '../lib/approvals';

// Process Intelligence Phase 3 (P9) — shows any approval-gated action
// request for this case (OutcomeModal's requestHrReview call, generalizing
// hr_review_requests beyond its original single "record" step) with the
// spec's own status wording (Decision prepared / Awaiting approval /
// Approved / Rejected). isApprover gates who can actually record a
// decision — anyone else just sees the current status, same
// read-only-until-authorised pattern used everywhere else permission-
// gated in this app.
export function ApprovalsPanel({ cs, hrReviewRequests, respondToReview, isApprover }) {
  const requests = (hrReviewRequests || []).filter(r => r.case_id === cs.id && requiresApproval(r.step));
  if (!requests.length) return null;

  const statusColor = { approved: "#1A7A4A", rejected: "#C84B2F" };

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,padding:"16px",marginBottom:16}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B6375",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:12}}>Approvals</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {requests.map(r=>(
          <div key={r.id} style={{border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:600,color:"#1A1535"}}>{approvalActionLabel(r.step)}</span>
              <span style={{fontSize:11,fontWeight:700,color:statusColor[r.status]||"#B87520"}}>{approvalStatusLabel(r.status)}</span>
            </div>
            {r.record_snapshot&&<div style={{fontSize:12,color:"#6B6375",marginTop:4}}>{r.record_snapshot}</div>}
            {r.requested_by_name&&<div style={{fontSize:11,color:"#9B9098",marginTop:4}}>Requested by {r.requested_by_name}</div>}
            {r.status==="pending"&&isApprover&&(
              <div style={{display:"flex",gap:8,marginTop:8}}>
                <button onClick={()=>respondToReview(r.id,"approved")} style={{fontSize:11,color:"#FFFFFF",background:"#1A7A4A",border:"none",borderRadius:5,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Approve</button>
                <button onClick={()=>respondToReview(r.id,"rejected")} style={{fontSize:11,color:"#6B6375",background:"none",border:"1px solid #E8E0D0",borderRadius:5,padding:"5px 12px",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Reject</button>
              </div>
            )}
            {r.status!=="pending"&&r.reviewed_by_name&&<div style={{fontSize:11,color:"#9B9098",marginTop:4}}>By {r.reviewed_by_name}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
