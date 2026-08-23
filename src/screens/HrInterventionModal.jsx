import { useRef, useState } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';

// Manager Enablement (Phase 4, MP19, §15) — HR Intervention actions.
// Reachable from CaseViewScreen's header and from MP18's Delegated Work
// dashboard (same lifted-state pattern as EscalateToHrModal/MP12 and
// AssignInvestigatorModal/MP7 — App.jsx owns showHrInterventionModal/
// hrInterventionCaseId, rendered once at the top level). One shared note
// field feeds the three note-based actions (they only differ in label
// and where the resulting case_task's source tag routes it); the three
// standalone actions below need no note.
export function HrInterventionModal({ cs, setShowHrInterventionModal, onSendGuidance, onReturnForFurtherWork, onTakeOver, onTogglePause, onReassign }) {
  const [note, setNote] = useState("");
  const close = () => setShowHrInterventionModal(false);
  const isPaused = !!cs?.investigationPaused;
  const containerRef = useRef(null);
  useModalA11y(containerRef, close);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="hr-intervention-title" ref={containerRef} tabIndex={-1} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
          <div id="hr-intervention-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820"}}>HR Intervention</div>
          <button onClick={close} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098",lineHeight:1,padding:0,marginLeft:12}}>×</button>
        </div>
        <div style={{fontSize:13,color:"#6B6375",marginBottom:20}}>{cs?.employeeName}</div>

        <div style={{marginBottom:16}}>
          <label htmlFor="hr-intervention-note" style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Note</label>
          <textarea id="hr-intervention-note" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="What should the investigator know?"
            style={{width:"100%",fontSize:13,border:"1px solid #E8E0D0",borderRadius:8,padding:"10px 12px",background:"#fff",color:"#1C1820",boxSizing:"border-box",resize:"vertical",fontFamily:"DM Sans,system-ui,sans-serif"}}/>
        </div>

        <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Send to the investigator</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          <button onClick={()=>{onSendGuidance(note,"guidance");close();}} disabled={!note.trim()} style={{fontSize:12,padding:"7px 14px",background:note.trim()?"#7C5CFC":"#E8E0D0",border:"none",borderRadius:6,color:"#fff",cursor:note.trim()?"pointer":"not-allowed",fontFamily:"DM Sans,system-ui,sans-serif",fontWeight:600}}>Send guidance</button>
          <button onClick={()=>{onSendGuidance(note,"question");close();}} disabled={!note.trim()} style={{fontSize:12,padding:"7px 14px",background:"#fff",border:"1px solid #E8E0D0",borderRadius:6,color:note.trim()?"#6B6375":"#C4BAB0",cursor:note.trim()?"pointer":"not-allowed",fontFamily:"DM Sans,system-ui,sans-serif"}}>Add investigation question</button>
          <button onClick={()=>{onSendGuidance(note,"witness");close();}} disabled={!note.trim()} style={{fontSize:12,padding:"7px 14px",background:"#fff",border:"1px solid #E8E0D0",borderRadius:6,color:note.trim()?"#6B6375":"#C4BAB0",cursor:note.trim()?"pointer":"not-allowed",fontFamily:"DM Sans,system-ui,sans-serif"}}>Request additional witness</button>
          <button onClick={()=>{onReturnForFurtherWork(note);close();}} style={{fontSize:12,padding:"7px 14px",background:"#fff",border:"1px solid #E8E0D0",borderRadius:6,color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Return for further work</button>
        </div>

        <div style={{fontSize:11,fontWeight:700,color:"#9B9098",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:8}}>Take control of the case</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={onReassign} style={{fontSize:12,padding:"7px 14px",background:"#fff",border:"1px solid #E8E0D0",borderRadius:6,color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Reassign investigator</button>
          <button onClick={()=>{onTakeOver();close();}} style={{fontSize:12,padding:"7px 14px",background:"#fff",border:"1px solid #E8E0D0",borderRadius:6,color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>Take over case</button>
          <button onClick={()=>{onTogglePause();close();}} style={{fontSize:12,padding:"7px 14px",background:"#fff",border:"1px solid #E8E0D0",borderRadius:6,color:"#6B6375",cursor:"pointer",fontFamily:"DM Sans,system-ui,sans-serif"}}>{isPaused?"Resume investigation":"Pause investigation"}</button>
        </div>
      </div>
    </div>
  );
}
