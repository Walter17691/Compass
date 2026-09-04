import { Btn } from './Primitives';
import { COLOR } from '../styles/tokens';

// Process Intelligence Phase 3 (P4) — the reusable citation shape every
// policy-aware feature in this phase builds on (P5's Next Best Action,
// P6's guardrails, P10's decision workspace all render one of these
// rather than each inventing its own policy-quoting UI). Structurally
// separates the three things the spec insists never get blended: the
// exact quoted company policy text, Compass's own observation about how
// it applies to this case, and — only when genuinely relevant — general
// legal/regulatory context. Any prop left out simply doesn't render that
// section; nothing here assumes all three are always present.
export function PolicyCitation({ policyName, clauseHeading, clauseText, observation, legalNote, onViewPolicy, onCreateAction, onDismiss }) {
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px"}}>
      {(clauseText||policyName)&&(
        <div style={{marginBottom:observation||legalNote?10:0}}>
          <div style={{fontSize:10,fontWeight:700,color:"#9B9098",textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>
            Company policy{policyName?" — "+policyName:""}
          </div>
          {clauseHeading&&<div style={{fontSize:11,fontWeight:600,color:"#6B6375",marginBottom:2}}>{clauseHeading}</div>}
          {clauseText&&<div style={{fontSize:13,color:"#1A1535",fontStyle:"italic",lineHeight:1.6}}>&ldquo;{clauseText}&rdquo;</div>}
        </div>
      )}
      {observation&&(
        <div style={{marginBottom:legalNote?10:0}}>
          <div style={{fontSize:11,fontWeight:700,color:COLOR.ink,marginBottom:4}}>Compass guidance</div>
          <div style={{fontSize:13,color:"#3D3560",lineHeight:1.6}}>{observation}</div>
        </div>
      )}
      {legalNote&&(
        <div>
          <div style={{fontSize:11,fontWeight:700,color:COLOR.ink,marginBottom:4}}>Legal / regulatory guidance</div>
          <div style={{fontSize:13,color:"#3D3560",lineHeight:1.6}}>{legalNote}</div>
        </div>
      )}
      {(onViewPolicy||onCreateAction||onDismiss)&&(
        <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
          {onViewPolicy&&<Btn variant="secondary" style={{padding:"6px 12px",fontSize:12}} onClick={onViewPolicy}>View policy</Btn>}
          {onCreateAction&&<Btn variant="secondary" style={{padding:"6px 12px",fontSize:12}} onClick={onCreateAction}>Create action</Btn>}
          {onDismiss&&<Btn variant="ghost" style={{padding:"6px 12px",fontSize:12}} onClick={onDismiss}>Dismiss</Btn>}
        </div>
      )}
    </div>
  );
}
