const DISMISSAL_OUTCOMES = ["Dismissal with notice", "Summary dismissal (gross misconduct)"];

export function OutcomeModal({ cases, activeCaseId, setShowOutcomeModal, outcomeType, setOutcomeType, outcomeNotes, setOutcomeNotes, saveCases, showToast, handleLetter, startOffboarding }) {
  const cs = cases.find(x=>x.id===activeCaseId);
  return (
    <div role="dialog" aria-modal="true" onKeyDown={e=>{if(e.key==="Escape"){setShowOutcomeModal(false);setOutcomeType("");setOutcomeNotes("");}}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#FFFFFF",borderRadius:16,padding:28,width:"100%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:20,color:"#1C1820",fontWeight:400}}>Issue disciplinary outcome</div>
            <div style={{fontSize:12,color:"#9B9098",marginTop:2}}>{cs?.employeeName}</div>
          </div>
          <button onClick={()=>{setShowOutcomeModal(false);setOutcomeType("");setOutcomeNotes("");}} aria-label="Close" style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#9B9098"}}>×</button>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Outcome decision</label>
          <select value={outcomeType} onChange={e=>setOutcomeType(e.target.value)} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:outcomeType?"#1C1820":"#9B9098",background:"#FDFAF5",outline:"none",boxSizing:"border-box"}}>
            <option value="">Select outcome…</option>
            <option value="No further action">No further action</option>
            <option value="First written warning">First written warning</option>
            <option value="Final written warning">Final written warning</option>
            <option value="Demotion">Demotion</option>
            <option value="Dismissal with notice">Dismissal with notice</option>
            <option value="Summary dismissal (gross misconduct)">Summary dismissal (gross misconduct)</option>
          </select>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:12,fontWeight:600,color:"#1C1820",display:"block",marginBottom:6}}>Notes <span style={{fontWeight:400,color:"#9B9098"}}>(optional)</span></label>
          <textarea value={outcomeNotes} onChange={e=>setOutcomeNotes(e.target.value)} placeholder="Any additional notes…" rows={3} style={{width:"100%",fontSize:13,border:"1.5px solid #E8E0D0",borderRadius:8,padding:"10px 12px",fontFamily:"DM Sans,system-ui,sans-serif",color:"#1C1820",background:"#FDFAF5",outline:"none",resize:"vertical",boxSizing:"border-box"}}/>
        </div>
        <div style={{background:"#FFF8F0",border:"1px solid #E8622A33",borderRadius:8,padding:"10px 14px",marginBottom:20,fontSize:12,color:"#E8622A"}}>
          Issuing this outcome starts the employee's 5 working day appeal window (ACAS Code).
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={()=>{setShowOutcomeModal(false);setOutcomeType("");setOutcomeNotes("");}} style={{fontSize:13,padding:"10px 20px",border:"1px solid #E8E0D0",borderRadius:8,background:"#FFFFFF",cursor:"pointer",color:"#6B6375",fontFamily:"DM Sans,system-ui,sans-serif"}}>Cancel</button>
          <button disabled={!outcomeType} onClick={()=>{
            if(!outcomeType)return;
            const wasDismissal = DISMISSAL_OUTCOMES.includes(outcomeType);
            const employeeName = cs?.employeeName;
            const employeeManager = cs?.manager;
            saveCases(cases.map(x=>x.id===activeCaseId?{...x,outcome:outcomeType,outcomeDate:new Date().toISOString(),outcomeNotes:outcomeNotes}:x));
            setShowOutcomeModal(false);setOutcomeType("");setOutcomeNotes("");showToast("Outcome recorded");handleLetter("outcome");
            if(wasDismissal) startOffboarding({name:employeeName, manager:employeeManager, reason:"dismissal"});
          }} style={{fontSize:13,padding:"10px 20px",background:!outcomeType?"#B8A9F8":"#1C1820",border:"none",borderRadius:8,color:"#fff",cursor:!outcomeType?"not-allowed":"pointer",fontWeight:600,fontFamily:"DM Sans,system-ui,sans-serif"}}>Issue outcome & generate letter</button>
        </div>
      </div>
    </div>
  );
}
