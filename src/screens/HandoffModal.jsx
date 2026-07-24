import { supabase } from '../supabase';

export function HandoffModal({ cases, activeCaseId, currentUser, orgMembers, selectedMemberId, setSelectedMemberId, setShowHandoffModal, saveCases, org, user, setActiveCaseStage, showToast }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  const myLevel = currentUser?.access_level||5;
  const eligible = orgMembers.filter(m=>(m.access_level||5)>=myLevel&&m.name!==currentUser?.name);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:480}}>
        <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",marginBottom:6}}>Appoint Disciplinary Officer</div>
        <div style={{fontSize:13,color:"#6B6375",marginBottom:20}}>The investigation is complete. Appoint an officer to conduct the disciplinary hearing.</div>
        {eligible.length===0?(
          <div style={{fontSize:13,color:"#C84B2F",background:"#FFF0ED",borderRadius:8,padding:12,marginBottom:16}}>No eligible users found. Add team members with access level {myLevel}+ in Organisation Settings.</div>
        ):(
          <>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Select disciplinary officer</label>
              <select value={selectedMemberId||eligible[0]?.id||""} onChange={e=>setSelectedMemberId(e.target.value)} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",background:"#fff",color:"#1C1820"}}>
                {eligible.map(m=><option key={m.id} value={m.id}>{m.name} {m.job_title?"("+m.job_title+")":""} — Level {m.access_level||5}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowHandoffModal(false);setSelectedMemberId("");}} style={{fontSize:13,padding:"9px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#fff",cursor:"pointer",color:"#6B6375"}}>Cancel</button>
              <button onClick={async()=>{
                const sel = orgMembers.find(x=>x.id===(selectedMemberId||eligible[0]?.id));
                if(!sel) return;
                saveCases(cases.map(x=>x.id===cs.id?{...x,disciplinaryOfficer:sel.name,disciplinaryOfficerId:sel.user_id||sel.id,disciplinaryOfficerEmail:sel.email||"",investigatingManager:currentUser?.name,stage:"disciplinary",handoffDate:new Date().toISOString()}:x));
                // Grant case-level access to disciplinary officer
                if(sel.user_id) {
                  try {
                    await supabase.from("case_access").upsert({
                      case_id: cs.id,
                      user_id: sel.user_id,
                      org_id: org.id,
                      role: "disciplinary_officer",
                      granted_by: user?.id,
                    });
                  } catch(e) { console.error("case_access write failed:", e); }
                }
                setShowHandoffModal(false);
                setSelectedMemberId("");
                setActiveCaseStage("disciplinary");
                showToast("Case handed off to "+sel.name);
              }} style={{fontSize:13,padding:"9px 20px",background:"#7C5CFC",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:600}}>Appoint & hand off</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
