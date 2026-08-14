import { useState } from 'react';

// Manager Enablement (Phase 4, MP12, §13) — "Escalate to HR". Deliberately
// minimal: one optional note field, no case-selection or step-type
// choice — the whole point is a manager anywhere on a case reaching HR
// in one click without having to explain the situation from scratch.
// escalateToHr (App.jsx) builds the actual context snapshot from live
// case data (buildEscalationContext, lib/escalation.js); this modal just
// collects the manager's own framing on top of it.
export function EscalateToHrModal({ caseName, setShowEscalateModal, escalateToHr }) {
  const [note, setNote] = useState("");
  const close = () => setShowEscalateModal(false);

  return (
    <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape") close();}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:480}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820"}}>Ask HR</div>
          <button onClick={close} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098",lineHeight:1,padding:0,marginLeft:12}}>×</button>
        </div>
        <div style={{fontSize:13,color:"#6B6375",marginBottom:20}}>HR will see the case's stage, latest meeting, and evidence automatically — you don't need to explain the background, just what you need help with.{caseName?" About "+caseName+".":""}</div>

        <div style={{marginBottom:20}}>
          <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>What do you need help with? <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
          <textarea rows={4} value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. The employee is disputing the evidence and I'm not sure how to proceed"
            style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",background:"#fff",color:"#1C1820",boxSizing:"border-box",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={close} style={{fontSize:13,padding:"9px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#fff",cursor:"pointer",color:"#6B6375"}}>Cancel</button>
          <button onClick={()=>{escalateToHr(note);close();}} style={{fontSize:13,padding:"9px 20px",background:"#7C5CFC",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontWeight:600}}>Send to HR</button>
        </div>
      </div>
    </div>
  );
}
