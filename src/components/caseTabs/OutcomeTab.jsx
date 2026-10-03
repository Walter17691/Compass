import { isGrievanceCase, hasLetterType } from '../../lib/caseStage';
import { isWarningOutcome } from '../../lib/outcomeTypes';
import { computeAppealDeadline } from '../../lib/deadlines';
import { FONT } from '../../styles/tokens';
import { hasReachedOutcomeStage } from '../../lib/outcomeReachability';

// Phase 6.5 hardening (closes Prompt 16 audit finding H12, HIGH) — this
// used to hardcode a fixed list of stage ids ("disciplinary"/"hearing"/
// "outcome"/"appeal"/"closed") as the only ones that count as "reached",
// which only covers the disciplinary and grievance stage shapes. Every
// other process type (long-term sickness, flexible working) has its own
// stage vocabulary that never intersects that list — a long-term-
// sickness case's own late stages ("occupational_health",
// "capability_consideration") could never satisfy `reached`, and since
// cs.outcome can only ever be set by clicking the button `reached` itself
// gates, those cases could never record an outcome through this tab at
// all, permanently. Derived generically from the case's own process
// type instead: "reached" once the case is at the stage immediately
// before its own type's outcome-equivalent stage ("outcome" or
// "decision", whichever that type's own stage list actually has) or
// later — the same threshold disciplinary/grievance already used, just
// computed instead of hardcoded, so it's automatically correct for every
// process type's own vocabulary.
// D1 completion — this local copy became the shared predicate in
// outcomeReachability.js so navigation, nextStep and this card cannot drift.
// The CARD asks a narrower question than the NAV: has the case reached its
// decision point? The destination additionally requires a completed hearing
// before it will advertise one (canRecordOutcome). Both definitions live in
// outcomeReachability.js — this is the right one for this site, not a second
// copy of the rule.
const isOutcomeReachable = (cs, stage) =>
  !!cs?.outcome || hasReachedOutcomeStage(cs, stage);


// No longer gated to viewing the Disciplinary meetings group — this is
// its own tab now, so it reads the case's actual lifecycle stage
// directly to decide what to show. "hearing" is grievance's equivalent
// in-progress stage to disciplinary's "disciplinary".
// Defect #12/#14 remediation — an outcome recorded before
// outcome_issued_at/warning_duration_months existed (or one whose HR
// user simply hadn't been asked for a duration yet, pre-remediation) has
// outcome set but warningDurationMonths null. Distinct from
// "reassessing whether the sanction should have been different" — this
// never touches cs.outcome itself, so it's offered whenever a warning
// outcome is missing its structured metadata, regardless of how it got
// that way.
function needsOutcomeDetailsCompletion(cs) {
  return isWarningOutcome(cs.outcome) && !cs.warningDurationMonths;
}

export function OutcomeTab({ cs, stage, fmtDate, setShowOutcomeModal, canDecide, onDraftOutcomeLetter }) {
  const grievance = isGrievanceCase(cs);
  const reached = isOutcomeReachable(cs, stage);
  // Defect #17 remediation — a durable, always-available route to the
  // outcome letter, independent of Case Copilot's own single-track "next
  // step" suggestion (nextStep.js), which moves on to "Close case" the
  // moment the letter's been saved once and has no way back. cs.outcome
  // being set is the only precondition — never gated on hearing-signature
  // status (see the #17 report: no product rule anywhere actually
  // requires that ordering, only this Copilot suggestion used to assume
  // it) and never gated on canDecide (drafting/regenerating a letter
  // writes nothing to the HR-only-protected outcome columns; only
  // "Issue outcome"/"Complete outcome details" do, and those already
  // enforce it above).
  const hasSavedOutcomeLetter = hasLetterType(cs.meetings || [], "outcome");

  if (!reached) {
    return (
      <div style={{textAlign:"center",padding:"40px",background:"#FFFFFF",borderRadius:12,border:"1px solid #E8EAF2"}}>
        <div style={{fontSize:14,color:"#8A8EA3"}}>No outcome yet — this case hasn't reached {grievance?"a grievance meeting":"a disciplinary hearing"}.</div>
      </div>
    );
  }

  if (cs.outcome) {
    const needsCompletion = needsOutcomeDetailsCompletion(cs);
    // Defect #16 remediation — the same anchor computeDueSoon's own
    // due/overdue tracking uses (lib/deadlines.js), so this text can never
    // silently disagree with the deadline actually being tracked. Only
    // resolves once an outcome letter has actually been saved (matching
    // computeDueSoon's own condition for generating this deadline at all);
    // before that there's nothing real to display yet.
    const appealDeadline = computeAppealDeadline(cs);
    return (
      <div style={{background:"#E8F5EE",border:"1px solid #A8D5B5",borderRadius:12,padding:"16px 20px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#1A7A4A",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:4}}>Outcome issued</div>
        <div style={{fontSize:14,fontWeight:600,color:"#1C1820",marginBottom:4}}>{cs.outcome}</div>
        <div style={{fontSize:12,color:"#4A4E63"}}>Issued {cs.outcomeIssuedAt?fmtDate(cs.outcomeIssuedAt):"date not recorded"} · Appeal window: 5 working days from issue{appealDeadline?` · Deadline ${fmtDate(appealDeadline)}`:""}</div>
        {cs.warningDurationMonths&&(
          <div style={{fontSize:12,color:"#4A4E63",marginTop:2}}>Warning duration: {cs.warningDurationMonths} month{cs.warningDurationMonths===1?"":"s"}{cs.warningExpiresAt?` · Expires ${fmtDate(cs.warningExpiresAt)}`:""}</div>
        )}
        {/* WAVE D4.2b — the "Complete outcome details" action is retired.
            A warning's duration is SUBSTANTIVE decision data: it sets how long
            the sanction is live, therefore whether it is a Current Warning,
            therefore the escalation position. Supplying it after the fact was
            editing the sanction through a metadata route, so it is no longer
            offered to anyone — not merely hidden from non-deciders.
            The read-only notice is PRESERVED (it already existed for the
            non-canDecide case) because a historical record being incomplete is
            worth seeing; what has gone is the ability to rewrite it here. A
            deliberate correction/variation workflow is future work. */}
        {needsCompletion&&(
          <div style={{fontSize:12,color:"#4A4E63",marginTop:10}}>This warning has no recorded duration, so its expiry and currency cannot be calculated. Historical records are kept as they were recorded.</div>
        )}
        {onDraftOutcomeLetter&&(
          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #A8D5B5"}}>
            <button onClick={onDraftOutcomeLetter} style={{fontSize:12,background:"none",border:"1px solid #1A7A4A",borderRadius:8,padding:"8px 16px",color:"#1A7A4A",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>{hasSavedOutcomeLetter?"Regenerate outcome letter":"Draft outcome letter"}</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{background:"#FFFFFF",border:"1px solid #E8EAF2",borderRadius:12,padding:"16px 20px"}}>
      <div style={{fontSize:13,color:"#1C1820",fontWeight:600,marginBottom:4}}>Record {grievance?"grievance":"disciplinary"} outcome</div>
      <div style={{fontSize:12,color:"#4A4E63",marginBottom:14}}>Once the hearing is complete, record the decision. The written outcome follows as a separate step. ACAS recommends within 5 working days of the hearing. The outcome letter starts the employee's 5-day appeal window.</div>
      {canDecide ? (
        <button onClick={()=>setShowOutcomeModal(true)} style={{fontSize:13,background:"#1C1820",border:"none",borderRadius:8,padding:"10px 20px",color:"#fff",fontWeight:600,cursor:"pointer",fontFamily:FONT.sans}}>Record outcome →</button>
      ) : (
        <div style={{fontSize:12,color:"#8A8EA3"}}>Only HR or this case's Hearing Manager can record the outcome.</div>
      )}
    </div>
  );
}
