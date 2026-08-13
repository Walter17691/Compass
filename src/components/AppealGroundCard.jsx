import { parseAppealGroundReasoning } from '../lib/appealReview';
import { Btn } from './Primitives';

// Process Intelligence (P13) — one card per distinct ground of appeal,
// replacing the single reasoning-blob SignalCard the appeal review used
// to render (one per allegation, grounds and review folded together).
// Same visual-separation philosophy as PolicyCitation: the employee's
// own argument, Compass's neutral comparison, and any procedural
// concern read as distinct sections rather than one undifferentiated
// paragraph — never a recommendation on whether the appeal should
// succeed, matching generateAppealReview's own hard constraint.
export function AppealGroundCard({ signal, onAskWhy }) {
  const { ground, employeeArgument, compassReview, potentialIssue } = parseAppealGroundReasoning(signal.reasoning);
  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:10,padding:"14px 16px",marginBottom:8}}>
      <div style={{fontSize:13,fontWeight:600,color:"#1A1535",marginBottom:10}}>{ground || signal.title}</div>
      {employeeArgument && (
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:700,color:"#9B9098",textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>Employee&rsquo;s argument</div>
          <div style={{fontSize:13,color:"#1A1535",lineHeight:1.6}}>{employeeArgument}</div>
        </div>
      )}
      {compassReview && (
        <div style={{marginBottom:potentialIssue?10:0}}>
          <div style={{fontSize:10,fontWeight:700,color:"#7C5CFC",textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>Compass review</div>
          <div style={{fontSize:13,color:"#3D3560",lineHeight:1.6}}>{compassReview}</div>
        </div>
      )}
      {potentialIssue && (
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#C84B2F",textTransform:"uppercase",letterSpacing:0.4,marginBottom:4}}>Potential issue</div>
          <div style={{fontSize:13,color:"#8A3420",lineHeight:1.6}}>{potentialIssue}</div>
        </div>
      )}
      {onAskWhy && (
        <div style={{marginTop:10}}>
          <Btn variant="ghost" style={{padding:"4px 10px",fontSize:11}} onClick={onAskWhy}>Ask why</Btn>
        </div>
      )}
    </div>
  );
}
