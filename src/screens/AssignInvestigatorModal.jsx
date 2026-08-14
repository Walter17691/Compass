import { useState } from 'react';
import { allegationsForCase } from '../lib/allegations';

// Manager Enablement (Phase 4, MP7, §7) — replaces the old plain <select>
// (CaseViewScreen.jsx) that called assignInvestigator with nothing but a
// member id. HR can now scope the assignment: which specific allegations
// the investigator should look at (defaults to every allegation checked,
// matching the old implicit "sees everything" behaviour — HR narrows it
// deliberately rather than the system forcing a choice), a target
// completion date, and a short free-text note. What the investigator can
// actually SEE is still governed entirely by MP1's RLS (case_access grants
// the case), not by this scope — this is "what should they focus on",
// not a second access-control layer.
export function AssignInvestigatorModal({ cases, activeCaseId, allegations, orgMembers, setShowAssignInvestigatorModal, assignInvestigator }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  const caseAllegations = allegationsForCase(allegations, activeCaseId);
  const eligible = (orgMembers||[]).filter(m=>m.user_id);
  const [selectedMemberId, setSelectedMemberId] = useState(eligible[0]?.user_id||"");
  const [selectedAllegationIds, setSelectedAllegationIds] = useState(caseAllegations.map(a=>a.id));
  const [targetCompletionDate, setTargetCompletionDate] = useState("");
  const [scopeNote, setScopeNote] = useState("");
  const close = () => setShowAssignInvestigatorModal(false);
  const toggleAllegation = (id) => setSelectedAllegationIds(ids => ids.includes(id) ? ids.filter(x=>x!==id) : [...ids, id]);

  return (
    <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape") close();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820"}}>Assign investigator</div>
          <button onClick={close} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098",lineHeight:1,padding:0,marginLeft:12}}>×</button>
        </div>
        <div style={{fontSize:13,color:"#6B6375",marginBottom:20}}>They'll get a focused investigation workspace on this case — not the full case file.</div>

        {eligible.length===0?(
          <>
            <div style={{fontSize:13,color:"#C84B2F",background:"#FFF0ED",borderRadius:8,padding:12,marginBottom:16}}>No team members found. Add one in Organisation Settings first.</div>
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={close} style={{fontSize:13,padding:"9px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#fff",cursor:"pointer",color:"#6B6375"}}>Close</button>
            </div>
          </>
        ):(
          <>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Investigator</label>
              <select value={selectedMemberId} onChange={e=>setSelectedMemberId(e.target.value)} style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",background:"#fff",color:"#1C1820"}}>
                {eligible.map(m=><option key={m.id} value={m.user_id}>{m.name} {m.job_title?"("+m.job_title+")":""}</option>)}
              </select>
            </div>

            {caseAllegations.length>0&&(
              <div style={{marginBottom:16}}>
                <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Which allegations should they investigate?</label>
                <div style={{border:"1px solid #E8E0D0",borderRadius:8,padding:"4px 12px"}}>
                  {caseAllegations.map(a=>(
                    <label key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #F5F1EA",cursor:"pointer"}}>
                      <input type="checkbox" checked={selectedAllegationIds.includes(a.id)} onChange={()=>toggleAllegation(a.id)} style={{width:14,height:14,cursor:"pointer"}}/>
                      <span style={{fontSize:13,color:"#1A1535"}}>{a.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Target completion date <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <input type="date" value={targetCompletionDate} onChange={e=>setTargetCompletionDate(e.target.value)}
                style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",background:"#fff",color:"#1C1820",boxSizing:"border-box"}}/>
            </div>

            <div style={{marginBottom:20}}>
              <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Scope note <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
              <textarea rows={3} value={scopeNote} onChange={e=>setScopeNote(e.target.value)} placeholder="Anything specific they should focus on or avoid"
                style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",background:"#fff",color:"#1C1820",boxSizing:"border-box",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
            </div>

            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={close} style={{fontSize:13,padding:"9px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#fff",cursor:"pointer",color:"#6B6375"}}>Cancel</button>
              <button onClick={()=>{
                if(!selectedMemberId) return;
                assignInvestigator(cs.id, selectedMemberId, { allegationIds: selectedAllegationIds, targetCompletionDate, scopeNote });
                close();
              }} style={{fontSize:13,padding:"9px 20px",background:"#7C5CFC",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:600}}>Assign investigator</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
