import { COLOR, SPACE, TYPE } from '../styles/tokens';
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
//
// P7 — proceeding past a signal that carries that policy citation is a
// genuine, documented policy departure, not just an unresolved warning:
// "Proceed anyway" routes through requestPolicyDeviationReason instead of
// the plain requestOverrideReason when a policyRef exists, capturing what
// will actually happen (not just why) alongside the policy's own wording.
// 10/10 pass, Part A — see UnansweredQuestionsPanel's own comment: no
// longer its own card; composes as a "Case readiness" subsection with
// queue rows instead of one card per signal.
export function GuardrailsPanel({ cs, signals, changeSignalStatus, onAskWhy, createCaseTask, requestOverrideReason, requestPolicyDeviationReason }) {
  if (!signals.length) return null;

  return (
    <div>
      <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.sm}}>Procedural guardrails</div>
      <div style={{display:"flex",flexDirection:"column"}}>
        {signals.map((signal,i)=>{
          const policyRef = signal.sourceRefs?.find(r=>r.kind==="policy");
          return (
            <div key={signal.id}>
              <SignalCard signal={signal} last={i===signals.length-1 && !policyRef}
                onMarkResolved={()=>changeSignalStatus(signal.id, "resolved")}
                onMarkNotRelevant={()=>changeSignalStatus(signal.id, "not_relevant")}
                onAskWhy={()=>onAskWhy(signal)}
                extraActions={[
                  {label:"Create action", onClick:()=>{createCaseTask(cs.id, {name:signal.title}); changeSignalStatus(signal.id, "accepted");}},
                  {label:"Proceed anyway", onClick: async ()=>{
                    const ok = policyRef
                      ? await requestPolicyDeviationReason({policyName:policyRef.label, clauseHeading:policyRef.clauseHeading, clauseText:policyRef.clauseText, caseId:cs.id})
                      : await requestOverrideReason(signal.title, {caseId:cs.id, actionLabel:"Proceeded past procedural guardrail"});
                    if(ok) changeSignalStatus(signal.id, "accepted", "Proceeded anyway");
                  }},
                ]}
              />
              {policyRef&&(
                <div style={{marginBottom:10}}>
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
