import { SignalCard } from './SignalCard';
import { PolicyCitation } from './PolicyCitation';

// Phase 4 of the reasoning-layer build-out (process intelligence, after
// meeting intelligence). Reads open "process_risk" case_signals — unlike
// InconsistenciesPanel/UnansweredQuestionsPanel there's no "check again"
// button here: App.jsx's syncGuardrailSignals runs automatically whenever
// the case is opened, since these are plain deterministic comparisons
// (see lib/guardrails.js), not an AI call worth gating behind a click.
//
// Process Intelligence (P6) adds the spec's own "Create action" and
// "Proceed anyway" actions — createCaseTask and requestOverrideReason are
// the exact same functions every other case-scoped action in this app
// already uses (P1's override primitive), not bespoke guardrail-only
// logic. A guardrail signal that carries a policy sourceRef (App.jsx's
// syncGuardrailSignals -> guardrails.js's findPolicyClauseRef) renders
// via P4's PolicyCitation, same pattern as P5's Next Best Action card.
export function GuardrailsPanel({ cs, signals, changeSignalStatus, onAskWhy, createCaseTask, requestOverrideReason }) {
  if (!signals.length) return null;

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8E0D0",borderRadius:12,overflow:"hidden",marginBottom:16}}>
      <div style={{padding:"12px 16px",background:"#FDFAF5",borderBottom:"1px solid #EDE5D8"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#7C5CFC",letterSpacing:"0.5px",textTransform:"uppercase"}}>Procedural guardrails</div>
      </div>
      <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:8}}>
        {signals.map(signal=>{
          const policyRef = signal.sourceRefs?.find(r=>r.kind==="policy");
          return (
            <div key={signal.id}>
              <SignalCard signal={signal}
                onMarkResolved={()=>changeSignalStatus(signal.id, "resolved")}
                onMarkNotRelevant={()=>changeSignalStatus(signal.id, "not_relevant")}
                onAskWhy={()=>onAskWhy(signal)}
                extraActions={[
                  {label:"Create action", onClick:()=>{createCaseTask(cs.id, {name:signal.title}); changeSignalStatus(signal.id, "accepted");}},
                  {label:"Proceed anyway", onClick: async ()=>{
                    const ok = await requestOverrideReason(signal.title, {caseId:cs.id, actionLabel:"Proceeded past procedural guardrail"});
                    if(ok) changeSignalStatus(signal.id, "accepted", "Proceeded anyway");
                  }},
                ]}
              />
              {policyRef&&(
                <div style={{marginTop:8}}>
                  <PolicyCitation policyName={policyRef.label} clauseHeading={policyRef.clauseHeading} clauseText={policyRef.clauseText} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
