import { SignalCard } from './SignalCard';

// Phase 4 of the reasoning-layer build-out (process intelligence, after
// meeting intelligence). Reads open "process_risk" case_signals — unlike
// InconsistenciesPanel/UnansweredQuestionsPanel there's no "check again"
// button here: App.jsx's syncGuardrailSignals runs automatically whenever
// the case is opened, since these are plain deterministic comparisons
// (see lib/guardrails.js), not an AI call worth gating behind a click.
export function GuardrailsPanel({ signals, changeSignalStatus, onAskWhy }) {
  if (!signals.length) return null;

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden",marginBottom:16}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Procedural guardrails</div>
      </div>
      <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:8}}>
        {signals.map(signal=>(
          <SignalCard key={signal.id} signal={signal}
            onMarkResolved={()=>changeSignalStatus(signal.id, "resolved")}
            onMarkNotRelevant={()=>changeSignalStatus(signal.id, "not_relevant")}
            onAskWhy={()=>onAskWhy(signal)}
          />
        ))}
      </div>
    </div>
  );
}
