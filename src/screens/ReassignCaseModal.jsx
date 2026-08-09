import { supabase } from '../supabase';
import { authedFetch } from '../lib/authedFetch';

// General "this case needs a new owner" action — usable at any stage, unlike
// HandoffModal (which is specifically the ACAS investigation→disciplinary
// officer appointment). Covers the everyday scenario: the HR person running
// a case goes on leave or leaves the org mid-case.
export function ReassignCaseModal({ cases, activeCaseId, currentUser, orgMembers, selectedMemberId, setSelectedMemberId, setShowReassignModal, saveCases, org, user, showToast, audit }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  const eligible = orgMembers.filter(m=>m.name!==currentUser?.name);
  return (
    <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape"){setShowReassignModal(false);setSelectedMemberId("");}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:480}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820"}}>Reassign case</div>
          <button onClick={()=>{setShowReassignModal(false);setSelectedMemberId("");}} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098",lineHeight:1,padding:0,marginLeft:12}}>×</button>
        </div>
        <div style={{fontSize:13,color:"#6B6375",marginBottom:20}}>Hand this case to another team member — they'll get access and an email notification.</div>
        {eligible.length===0?(
          <>
            <div style={{fontSize:13,color:"#C84B2F",background:"#FFF0ED",borderRadius:8,padding:12,marginBottom:16}}>No other team members found. Add one in Organisation Settings first.</div>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowReassignModal(false);setSelectedMemberId("");}} style={{fontSize:13,padding:"9px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#fff",cursor:"pointer",color:"#6B6375"}}>Close</button>
            </div>
          </>
        ):(
          <>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>New case owner</label>
              <select value={selectedMemberId||eligible[0]?.id||""} onChange={e=>setSelectedMemberId(e.target.value)} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",background:"#fff",color:"#1C1820"}}>
                {eligible.map(m=><option key={m.id} value={m.id}>{m.name} {m.job_title?"("+m.job_title+")":""}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowReassignModal(false);setSelectedMemberId("");}} style={{fontSize:13,padding:"9px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#fff",cursor:"pointer",color:"#6B6375"}}>Cancel</button>
              <button onClick={async()=>{
                const sel = orgMembers.find(x=>x.id===(selectedMemberId||eligible[0]?.id));
                if(!sel) return;
                const previousOwner = cs.manager||currentUser?.name||"";
                saveCases(cases.map(x=>x.id===cs.id?{...x,manager:sel.name,reassignedFrom:previousOwner,reassignedDate:new Date().toISOString()}:x));
                if(sel.user_id) {
                  try {
                    await supabase.from("case_access").upsert({
                      case_id: cs.id,
                      user_id: sel.user_id,
                      org_id: org.id,
                      role: "case_owner",
                      granted_by: user?.id,
                    });
                  } catch(e) { console.error("case_access write failed:", e); }
                }
                if(sel.user_id) {
                  try {
                    await authedFetch("/api/cron/reassign-notify", {
                      method:"POST",
                      headers:{"Content-Type":"application/json"},
                      body: JSON.stringify({ orgId: org.id, orgName: org.name, newOwnerId: sel.user_id, newOwnerName: sel.name, employeeName: cs.employeeName, caseType: cs.caseType }),
                    });
                  } catch(e) { console.error("Reassign notify failed:", e); }
                }
                audit?.("Case reassigned", `${cs.employeeName}'s case handed from ${previousOwner} to ${sel.name}`);
                setShowReassignModal(false);
                setSelectedMemberId("");
                showToast("Case reassigned to "+sel.name);
              }} style={{fontSize:13,padding:"9px 20px",background:"#7C5CFC",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:600}}>Reassign</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
