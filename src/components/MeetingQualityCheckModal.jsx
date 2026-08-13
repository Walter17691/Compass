import { Btn } from './Primitives';

// Meeting Intelligence Phase 2 (M9) — advisory only, never a gate: every
// path out of this modal (including the × / Escape) lets the meeting end.
// Gaps are computed deterministically in App.jsx's computeMeetingQualityGaps
// (essential questions still unasked, evidence/action suggestions never
// actioned, allegations that never came up) — this component only renders
// what it's given.
export function MeetingQualityCheckModal({ gaps = [], onReturnToMeeting, onCreateFollowUp, onProceed }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="quality-check-title"
      onKeyDown={e=>{ if(e.key==="Escape") onProceed(); }}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:4000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:16,padding:28,width:"100%",maxWidth:520,maxHeight:"80vh",overflowY:"auto"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#B87520",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Meeting Quality Check</div>
        <h3 id="quality-check-title" style={{fontFamily:"DM Serif Display,Georgia,serif",fontSize:17,color:"#1A1535",marginBottom:10,fontWeight:400}}>
          A few things worth a look before you close this out
        </h3>

        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
          {gaps.map((gap,i)=>(
            <div key={i} style={{background:"#FEF5E7",border:"1px solid #F5E6C4",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#6B5218",lineHeight:1.6}}>
              {gap}
            </div>
          ))}
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <Btn variant="ghost" onClick={onReturnToMeeting}>Return to meeting</Btn>
          <Btn variant="secondary" onClick={onCreateFollowUp}>Create follow-up action</Btn>
          <Btn onClick={onProceed}>Proceed anyway</Btn>
        </div>
      </div>
    </div>
  );
}
