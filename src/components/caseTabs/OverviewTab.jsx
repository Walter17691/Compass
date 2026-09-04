import { useState } from 'react';
import { estimateExposure } from '../../lib/tribunalEstimate';
import { WarningIcon } from '../Icons';
import { openSignalsForCase } from '../../lib/caseSignals';
import { computeCaseRisk, HEALTH_RELEVANT_PROCESS_TYPES } from '../../lib/caseRisk';
import { evaluateAutomationRules } from '../../lib/automationRules';
import { getProcessType } from '../../lib/processStages';
import { getTemplateForType } from '../../lib/processTemplates';
import { requiresApproval } from '../../lib/approvals';
import { UnansweredQuestionsPanel } from '../UnansweredQuestionsPanel';
import { InconsistenciesPanel } from '../InconsistenciesPanel';
import { GuardrailsPanel } from '../GuardrailsPanel';
import { AutomationSuggestionsPanel } from '../AutomationSuggestionsPanel';
import { CaseRolesPanel } from '../CaseRolesPanel';
import { ApprovalsPanel } from '../ApprovalsPanel';
import { HrReviewGatePanel } from '../HrReviewGatePanel';
import { AskHrPanel } from '../AskHrPanel';
import { CaseRiskPanel } from '../CaseRiskPanel';
import { ProcessChecklistPanel } from '../ProcessChecklistPanel';
import { OccupationalHealthPanel } from '../OccupationalHealthPanel';
import { COLOR, TYPE, RADIUS, SPACE, FONT } from '../../styles/tokens';

const RISK_STYLE = {
  HIGH: { color:"#C84B2F", bg:"#FEF0EB" },
  MEDIUM: { color:"#B87520", bg:"#FEF5E7" },
};
const ORDINAL = {2:"2nd",3:"3rd",4:"4th",5:"5th",6:"6th",7:"7th",8:"8th",9:"9th",10:"10th"};
const fmtGBP = n => "£"+Math.round(n).toLocaleString("en-GB");
const KEY_DATE_FIELDS = [
  { field:"fitNoteEndDate", label:"Fit note expires" },
  { field:"probationReviewDate", label:"Probation review" },
  { field:"ohReferralDate", label:"OH referral" },
  { field:"suspensionReviewDate", label:"Suspension review" },
];

// UAT Product Hierarchy pass, Part 2 — a capability existing in Compass
// is not sufficient reason to display it. An ordinary misconduct/
// attendance investigation showed weekly pay, age, fit note, probation,
// OH referral and suspension fields regardless of whether any of them
// had anything to do with the case in front of HR. Every predicate below
// is grounded in real, already-recorded data or an existing, deliberately
// curated signal that already lives elsewhere in the codebase — never an
// inference from "this is an employee case" alone.
//
// Re-audit (human review round 2) — re-examined against the actual
// tribunalEstimate.js data model and its own test suite, every place
// that reads/writes estimatedWeeklyPay/estimatedAgeAtDismissal, every
// supported process type and their real stage registries (processStages.js/
// caseStage.js — not stages invented for this rule), and the existing
// case-risk module. Three things the first pass got wrong, corrected here:
//
// 1. Redundancy was excluded entirely because it never reaches a
//    "disciplinary" stage — but redundancy has no disciplinary hearing
//    at all, by design, so gating on one excluded it always. Its own
//    basic-award-shaped statutory redundancy calculation overlaps
//    directly with this estimator's formula, and consultation itself
//    (not a later hearing) is the process that can end in dismissal —
//    relevant from the first day of the case, no stage gate.
//
// 2. Appeal was excluded outright — backwards. An appeal exists because
//    a decision (often a dismissal) has already been made and is being
//    challenged: the exposure is already crystallised, not speculative,
//    so it is if anything MORE clearly relevant than mid-investigation,
//    not less. No stage gate, same as redundancy.
//
// 3. Grievance was excluded entirely, which misses discrimination and
//    whistleblowing grievances specifically — tribunalEstimate.js's own
//    UNCAPPED_CASE_TYPES list (and its test suite) singles these two out
//    because they carry real, uncapped tribunal exposure independent of
//    any dismissal ACAS process, and that exposure doesn't wait for a
//    hearing either. getProcessType() normalises both case-type ids
//    ("discrimination"/"whistleblowing", selectable at intake) to
//    processTypeId "grievance", so the raw cs.caseType is checked
//    directly here, the same way tribunalEstimate.js itself already
//    does. An ordinary/other grievance still has no such standalone
//    exposure and stays excluded by default.
//
// For misconduct/capability/attendance/probation/long_term_sickness —
// gating on "a disciplinary hearing is live" was too late (exactly what
// the second review flagged), but showing it from the literal moment a
// case is created, before any fact-finding has happened at all, is the
// same prematurity the original UAT complaint was about. The one gate
// that's neither: exclude only each process type's own real "nothing
// investigated yet" starting stage (processStages.js's own stage
// registries — "intake" for the disciplinary-shaped types, and
// probation/long-term-sickness's own equivalent first stage) — once a
// case has moved past that, exposure is a live, live question for the
// rest of its life, not something that waits for a hearing to be booked.
const DISMISSAL_TRACK_TYPES_NO_STAGE_GATE = new Set(["redundancy", "appeal"]);
const DISMISSAL_TRACK_STARTING_STAGE = { misconduct:"intake", capability:"intake", attendance:"intake", probation:"probation_started", long_term_sickness:"absence_identified" };
function hasStandaloneTribunalExposure(cs, processTypeId) {
  if (processTypeId !== "grievance") return false;
  const rawType = (cs.caseType || "").toLowerCase();
  return rawType.includes("discrimination") || rawType.includes("whistleblow");
}

function isRiskExposureRelevant(cs, caseCtx, processTypeId) {
  // Never hide a figure someone has already entered, and never hide it
  // once risk has genuinely been assessed above LOW — regardless of type.
  if (cs.estimatedWeeklyPay || cs.estimatedAgeAtDismissal) return true;
  if (caseCtx.currentRisk && caseCtx.currentRisk !== "LOW") return true;
  if (DISMISSAL_TRACK_TYPES_NO_STAGE_GATE.has(processTypeId)) return true;
  if (processTypeId in DISMISSAL_TRACK_STARTING_STAGE) {
    return caseCtx.stage !== DISMISSAL_TRACK_STARTING_STAGE[processTypeId];
  }
  return hasStandaloneTribunalExposure(cs, processTypeId);
}

// Each predicate mirrors the one authoritative signal that field is
// actually about — never "any employee case might need this."
//
// Re-audit — fit note/OH referral relevance previously only recognised
// long_term_sickness/attendance case types, narrower than the health-
// relevance judgement this codebase already makes elsewhere: caseRisk.js's
// own missing_medical_info check (the literal source of the UAT
// complaint's "missing medical information" item) already treats
// attendance/long_term_sickness/capability as HEALTH_RELEVANT_PROCESS_TYPES,
// and separately treats real wellbeing notes recorded for this specific
// employee (not just this case) as its own genuine signal, independent of
// case type — e.g. a misconduct case where the employee has a real,
// separately-logged wellbeing concern. Both reused here rather than
// re-deriving a narrower, drifting definition.
function keyDateRelevance(cs, caseCtx, wellbeingNotes, processTypeId) {
  const probationEndDate = caseCtx.empRecord?.probationEndDate ? new Date(caseCtx.empRecord.probationEndDate) : null;
  const healthRelevant = HEALTH_RELEVANT_PROCESS_TYPES.includes(processTypeId)
    || (wellbeingNotes || []).some(n => n.employeeName === cs.employeeName);
  return {
    fitNoteEndDate: !!cs.fitNoteEndDate || healthRelevant,
    probationReviewDate: !!cs.probationReviewDate || processTypeId === "probation" || (!!probationEndDate && probationEndDate > new Date()),
    ohReferralDate: !!cs.ohReferralDate || !!cs.ohProcess?.currentStep || healthRelevant,
    // Re-audit — no authoritative "this case involves a suspension"
    // signal exists anywhere else in the data model: no meeting type, no
    // case-stage heuristic, and drafting/sending the Suspension letter
    // (LetterScreen) persists nothing back to the case today. Confirmed
    // by inspection, not assumed — see the report accompanying this
    // change for the full trail. Because this genuinely is a real,
    // ACAS-recognised action with no other way to reach it, it keeps its
    // own single, narrowly-scoped reveal (rendered below, not a generic
    // "show everything" toggle) rather than being made unreachable.
    suspensionReviewDate: !!cs.suspensionReviewDate,
  };
}

// 10/10 pass, Part A — a plain heading-and-chevron disclosure, local to
// this tab only (not a new shared design-system primitive — the brief
// for this pass is explicit that the design system itself is frozen).
// Used for the Layer 3 items that are genuinely secondary reference
// material (OH process before it's started, the process-template
// checklist, case-role assignment) rather than for anything actionable —
// nothing behind a Disclosure here blocks case progress, so collapsing
// it by default never hides something the user needed to see.
function Disclosure({ title, defaultOpen=false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{borderTop:`1px solid ${COLOR.borderFaint}`,paddingTop:SPACE.md,marginTop:SPACE.md}}>
      <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left",font:"inherit",fontFamily:"inherit"}}>
        <span style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>{title}</span>
        <span aria-hidden="true" style={{fontSize:10,color:COLOR.inkFaint,transform:open?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.15s"}}>▾</span>
      </button>
      {open && <div style={{marginTop:SPACE.md}}>{children}</div>}
    </div>
  );
}

export function OverviewTab({
  cs,
  caseCtx = {},
  shell = {},
  caseData = {},
  caseActions = {},
  caseIntel = {},
  oh = {},
  review = {},
  automation = {},
}) {
  const riskItems = computeCaseRisk(cs, { allegations: caseData.allegations, caseSignals: caseData.caseSignals, cases: caseCtx.cases, auditLog: caseData.auditLog, wellbeingNotes: caseData.wellbeingNotes, dueSoon: caseData.dueSoon });
  const automationSuggestions = evaluateAutomationRules(cs, { caseTasks: caseData.caseTasks, caseSignals: caseData.caseSignals });
  const processTypeId = getProcessType(cs.caseType).id;
  const processTemplate = getTemplateForType(caseData.processTemplates, processTypeId);
  // UAT Product Hierarchy pass, Part 2, re-audited on human review — see
  // isRiskExposureRelevant/keyDateRelevance above for exactly what makes
  // each module relevant to THIS case. The earlier generic "+ Add risk &
  // key date tracking" escape hatch is gone: every field below now has
  // its own genuine contextual trigger, so there's nothing left needing
  // a manual "reveal everything" override — except suspensionReviewDate,
  // which keeps its own single, narrow reveal (see keyDateRelevance's
  // comment on that field for why).
  const showRiskExposure = isRiskExposureRelevant(cs, caseCtx, processTypeId);
  const dateRelevance = keyDateRelevance(cs, caseCtx, caseData.wellbeingNotes, processTypeId);
  const [suspensionRevealed, setSuspensionRevealed] = useState(false);
  const effectiveDateRelevance = { ...dateRelevance, suspensionReviewDate: dateRelevance.suspensionReviewDate || suspensionRevealed };
  const visibleDateFields = KEY_DATE_FIELDS.filter(d => effectiveDateRelevance[d.field]);
  const showOh = !!cs.ohProcess?.currentStep || !!cs.ohReferralDate || HEALTH_RELEVANT_PROCESS_TYPES.includes(processTypeId) || (caseData.wellbeingNotes||[]).some(n=>n.employeeName===cs.employeeName);
  // Phase 6.5 hardening (Batch 12) — deliberately NOT switched to
  // dateMath.daysBetween: this is a fractional-YEARS estimate (divided
  // by 365.25, itself already an approximation), not a calendar-day
  // count for display — the DST-driven error here (~1 hour out of
  // ~8766) is immaterial next to the 365.25 approximation it's already
  // built on, and this feeds estimateExposure, whose own age-banding
  // formula is flagged (task #201) as awaiting employment-law review
  // before further changes.
  const yearsService = (() => {
    if(!caseCtx.empRecord?.startDate) return null;
    const start = new Date(caseCtx.empRecord.startDate.includes("/") ? caseCtx.empRecord.startDate.split("/").reverse().join("-") : caseCtx.empRecord.startDate);
    if(isNaN(start)) return null;
    return (Date.now()-start.getTime())/(1000*60*60*24*365.25);
  })();
  const exposure = estimateExposure({ weeklyPay: cs.estimatedWeeklyPay, ageAtDismissal: cs.estimatedAgeAtDismissal, yearsService, caseType: cs.caseType });

  // 10/10 pass, Part A — Layer 2 ("Case readiness") visibility flags.
  // Each condition is the exact same predicate its own panel already
  // uses internally to decide null-vs-render (requiresApproval/
  // r.step==="inv_report"/meetings with a record/open process_risk
  // signals) — recomputed here only to decide whether this subsection
  // draws a divider before the next one, never to change what renders.
  const unansweredStillToExplore = openSignalsForCase(caseData.caseSignals, cs.id, "unanswered_question");
  const inconsistencySignals = openSignalsForCase(caseData.caseSignals, cs.id, "inconsistency");
  const guardrailSignals = openSignalsForCase(caseData.caseSignals, cs.id, "process_risk");
  const hasApprovals = (caseData.hrReviewRequests||[]).some(r=>r.case_id===cs.id && requiresApproval(r.step));
  const hasHrReviewGate = (caseData.hrReviewRequests||[]).some(r=>r.case_id===cs.id && r.step==="inv_report");
  const hasInconsistenciesPanel = (cs.meetings||[]).some(m=>m.record);
  const readinessSections = [
    { key:"approvals", visible: hasApprovals },
    { key:"hrReviewGate", visible: hasHrReviewGate },
    { key:"unanswered", visible: true },
    { key:"inconsistencies", visible: hasInconsistenciesPanel },
    { key:"guardrails", visible: guardrailSignals.length>0 },
  ].filter(s=>s.visible);

  // 10/10 pass, Part A, item 1 — Layer 1 (Case Briefing): the exact same
  // fields already shown further down (owner via the header's own
  // Reassign control, risk via Risk & tribunal exposure, key dates via
  // Key dates, attention counts via the Layer 2 sections above),
  // surfaced as one read-only summary line so the case's state is
  // legible before scrolling into the editable detail. No new
  // calculation — nearestKeyDate picks the soonest of the four already-
  // existing date fields; attentionCount sums the same arrays Layer 2
  // already computed.
  const nearestKeyDate = KEY_DATE_FIELDS
    .filter(d=>cs[d.field])
    .map(d=>({ ...d, date: new Date(cs[d.field]) }))
    .sort((a,b)=>a.date-b.date)[0];
  const pendingApprovalCount = (caseData.hrReviewRequests||[]).filter(r=>r.case_id===cs.id && requiresApproval(r.step) && r.status==="pending").length;
  const pendingHrReviewCount = (caseData.hrReviewRequests||[]).filter(r=>r.case_id===cs.id && r.step==="inv_report" && r.status==="pending").length;
  const attentionCount = unansweredStillToExplore.length + inconsistencySignals.length + guardrailSignals.length + pendingApprovalCount + pendingHrReviewCount;

  return (
    <>
      {/* ══ LAYER 1 — CASE BRIEFING ══
          10/10 pass, Part A — typography and spacing only, no card, no
          stat tiles: what this case is about, then one compact summary
          line (owner / risk / next date / attention count) so the reader
          understands the case's state before reaching any detailed tool
          below. Same underlying fields as before (cs.description,
          cs.manager, caseCtx.currentRisk, the four Key Dates fields) —
          presentation and aggregation only. */}
      <div style={{marginBottom:SPACE.xl}}>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.xs}}>Description</div>
        {cs.description ? (
          <div style={{fontSize:13,color:COLOR.ink,lineHeight:1.6}}>{cs.description}</div>
        ) : (
          <div style={{fontSize:13,color:COLOR.inkFaint}}>No description recorded.</div>
        )}
        {cs.referredBy&&<div style={{fontSize:12,color:COLOR.inkFaint,marginTop:8}}>Referred by: {cs.referredBy}</div>}
        {caseCtx.repeatCount>1&&<div style={{fontSize:12,color:COLOR.inkFaint,marginTop:8}}>{ORDINAL[caseCtx.repeatCount]||caseCtx.repeatCount+"th"} case for {cs.employeeName}.</div>}

        <div style={{display:"flex",flexWrap:"wrap",gap:"6px 16px",marginTop:14,paddingTop:14,borderTop:`1px solid ${COLOR.borderFaint}`,fontSize:12.5}}>
          <span><span style={{color:COLOR.inkFaint}}>Owner </span><span style={{color:COLOR.ink,fontWeight:600}}>{cs.manager||"Unassigned"}</span></span>
          <span style={{color:COLOR.inkQuiet}}>·</span>
          <span>
            <span style={{color:COLOR.inkFaint}}>Risk </span>
            <span style={{color:caseCtx.currentRisk&&RISK_STYLE[caseCtx.currentRisk]?RISK_STYLE[caseCtx.currentRisk].color:COLOR.ink,fontWeight:600}}>{caseCtx.currentRisk||"Not assessed"}</span>
          </span>
          {nearestKeyDate&&(<>
            <span style={{color:COLOR.inkQuiet}}>·</span>
            <span><span style={{color:COLOR.inkFaint}}>{nearestKeyDate.label} </span><span style={{color:COLOR.ink,fontWeight:600}}>{nearestKeyDate.date.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span></span>
          </>)}
          {attentionCount>0&&(<>
            <span style={{color:COLOR.inkQuiet}}>·</span>
            <span style={{color:COLOR.amber,fontWeight:600}}>{attentionCount} item{attentionCount!==1?"s":""} need{attentionCount===1?"s":""} attention</span>
          </>)}
        </div>
      </div>

      {/* ══ LAYER 2 — CASE READINESS ══
          10/10 pass, Part A, items 2 & 4 — "what do I need to deal with
          before this case can progress?" Approvals, HR Review Gate,
          Unanswered Questions, Inconsistencies, and Guardrails used to
          be five separate cards; they're now one shared surface with a
          divider between whichever of them actually have content, each
          rendered as queue rows rather than a card per item. Every
          panel's own data source, handler, and gating logic is
          untouched — Do NOT combine their underlying data models — this
          only changes which DOM element draws the border. */}
      <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:SPACE.lg,marginBottom:SPACE.xl}}>
        <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:SPACE.md}}>Case readiness</div>
        {readinessSections.map((section,i)=>{
          const last = i===readinessSections.length-1;
          const wrap = node => <div key={section.key} style={{paddingBottom:last?0:SPACE.md,marginBottom:last?0:SPACE.md,borderBottom:last?"none":`1px solid ${COLOR.borderFaint}`}}>{node}</div>;
          if(section.key==="approvals") return wrap(<ApprovalsPanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} respondToReview={review.respondToReview} isApprover={review.isApprover} />);
          if(section.key==="hrReviewGate") return wrap(<HrReviewGatePanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} resolveInvestigationReview={review.resolveInvestigationReview} isHR={review.isApprover} />);
          if(section.key==="unanswered") return wrap(
            <UnansweredQuestionsPanel
              cs={cs}
              covered={caseIntel.unansweredCovered?.[cs.id]||[]}
              stillToExplore={unansweredStillToExplore}
              loading={caseIntel.unansweredLoading?.[cs.id]}
              onGenerate={caseIntel.generateUnansweredQuestions}
              createCaseTask={caseActions.createCaseTask}
              changeSignalStatus={caseActions.changeSignalStatus}
              onAskWhy={caseActions.onAskWhy}
            />
          );
          if(section.key==="inconsistencies") return wrap(
            <InconsistenciesPanel
              cs={cs}
              signals={inconsistencySignals}
              loading={caseIntel.inconsistencyLoading}
              onCheck={caseIntel.generateInconsistencies}
              changeSignalStatus={caseActions.changeSignalStatus}
              createCaseTask={caseActions.createCaseTask}
              allegations={(caseData.allegations||[]).filter(a=>a.caseId===cs.id)}
              onLinkAllegation={caseActions.linkSignalToAllegation}
              onAskWhy={caseActions.onAskWhy}
            />
          );
          if(section.key==="guardrails") return wrap(
            <GuardrailsPanel
              cs={cs}
              signals={guardrailSignals}
              changeSignalStatus={caseActions.changeSignalStatus}
              onAskWhy={caseActions.onAskWhy}
              createCaseTask={caseActions.createCaseTask}
              requestOverrideReason={caseActions.requestOverrideReason}
              requestPolicyDeviationReason={caseActions.requestPolicyDeviationReason}
            />
          );
          return null;
        })}
      </div>

      {/* ══ LAYER 3 — SUPPORTING DETAIL ══
          UAT Product Hierarchy pass, Part 2, re-audited on human review —
          Risk & tribunal exposure and each Key dates field only render
          when genuinely relevant to THIS case (see the predicates above
          this component). An ordinary case with none of these relevant
          shows neither — not an empty card, nothing at all. There is
          deliberately no generic "reveal everything" escape hatch any
          more: every field now has its own real contextual trigger
          except suspensionReviewDate, which has no authoritative signal
          anywhere in the data model to key off (confirmed by inspection —
          no meeting type, no case-stage heuristic, and drafting/sending
          the Suspension letter persists nothing back to the case today).
          Because suspension is a real, ACAS-recognised action that must
          stay reachable, it alone keeps one small, specifically-labelled
          reveal — never bundled with unrelated fields. OH process,
          Process checklist, and Case roles remain reference/
          configuration material behind a Disclosure once shown. Ask HR,
          Automation Suggestions, and Case risk stay directly visible. */}
      {caseCtx.stage!=="closed"&&(showRiskExposure||visibleDateFields.length>0) && (
        <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,marginBottom:SPACE.lg,overflow:"hidden"}}>
          {showRiskExposure&&(
            <div style={{padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:caseCtx.currentRisk||cs.estimatedWeeklyPay?10:0}}>
                <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint}}>Risk & tribunal exposure</div>
                {caseCtx.currentRisk&&RISK_STYLE[caseCtx.currentRisk]&&<span style={{fontSize:11,fontWeight:700,color:RISK_STYLE[caseCtx.currentRisk].color,background:RISK_STYLE[caseCtx.currentRisk].bg,borderRadius:4,padding:"3px 9px"}}>{caseCtx.currentRisk} RISK</span>}
              </div>
              <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
                <div>
                  <label htmlFor="overview-weekly-pay" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Weekly pay (£, gross)</label>
                  <input id="overview-weekly-pay" type="number" min="0" value={cs.estimatedWeeklyPay||""} placeholder="For exposure estimate"
                    onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,estimatedWeeklyPay:e.target.value?Number(e.target.value):null}:x))}
                    style={{width:150,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                </div>
                <div>
                  <label htmlFor="overview-age-at-dismissal" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Age (optional)</label>
                  <input id="overview-age-at-dismissal" type="number" min="16" max="80" value={cs.estimatedAgeAtDismissal||""} placeholder="Assumes 22-40"
                    onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,estimatedAgeAtDismissal:e.target.value?Number(e.target.value):null}:x))}
                    style={{width:110,fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                </div>
              </div>
              {exposure&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F5F1EA"}}>
                  <div style={{fontSize:13,color:"#1A1535"}}>Indicative exposure: <strong>{fmtGBP(exposure.totalLow)} – {fmtGBP(exposure.totalHigh)}</strong>{exposure.compensatoryUncapped&&<span style={{color:"#C84B2F"}}> (compensatory award uncapped)</span>}</div>
                  <div style={{fontSize:11,color:"#9B9098",marginTop:4}}>Basic award {fmtGBP(exposure.basicAward)} + compensatory range {fmtGBP(exposure.compensatoryLow)}–{fmtGBP(exposure.compensatoryHigh)}.{exposure.ageAssumed?" Assumes age 22-40 band — enter age for a more accurate estimate.":""} Indicative only — not legal advice, statutory caps change annually.</div>
                  {exposure.capsStale&&<div style={{fontSize:11,color:"#C84B2F",marginTop:4,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><WarningIcon size={12} color="#C84B2F" style={{flexShrink:0}}/>These statutory caps haven't been re-verified against gov.uk in over a year — they may be out of date. Check gov.uk/employment-tribunal-compensation-limits before relying on this figure.</div>}
                </div>
              )}
            </div>
          )}

          {visibleDateFields.length>0&&(
            <div style={{padding:"14px 16px",borderTop:showRiskExposure?`1px solid ${COLOR.border}`:"none"}}>
              <div style={{...TYPE.sectionHeading,color:COLOR.inkFaint,marginBottom:10}}>Key dates</div>
              <div style={{display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap"}}>
                {visibleDateFields.some(d=>d.field==="fitNoteEndDate")&&(
                  <div>
                    <label htmlFor="overview-fit-note-end-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Fit note expires</label>
                    <input id="overview-fit-note-end-date" type="date" value={cs.fitNoteEndDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,fitNoteEndDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                  </div>
                )}
                {visibleDateFields.some(d=>d.field==="probationReviewDate")&&(
                  <div>
                    <label htmlFor="overview-probation-review-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Probation review</label>
                    <input id="overview-probation-review-date" type="date" value={cs.probationReviewDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,probationReviewDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                  </div>
                )}
                {visibleDateFields.some(d=>d.field==="ohReferralDate")&&(
                  <div>
                    <label htmlFor="overview-oh-referral-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>OH referral date</label>
                    <input id="overview-oh-referral-date" type="date" value={cs.ohReferralDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,ohReferralDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                  </div>
                )}
                {visibleDateFields.some(d=>d.field==="ohReferralDate")&&cs.ohReferralDate&&(
                  <div>
                    <label htmlFor="overview-oh-report-received-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>OH report received</label>
                    <input id="overview-oh-report-received-date" type="date" value={cs.ohReportReceivedDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,ohReportReceivedDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                  </div>
                )}
                {visibleDateFields.some(d=>d.field==="suspensionReviewDate")&&(
                  <div>
                    <label htmlFor="overview-suspension-review-date" style={{fontSize:11,color:"#9B9098",display:"block",marginBottom:4}}>Suspension review</label>
                    <input id="overview-suspension-review-date" type="date" value={cs.suspensionReviewDate||""} onChange={e=>caseCtx.saveCases(caseCtx.cases.map(x=>x.id===cs.id?{...x,suspensionReviewDate:e.target.value||null}:x))} style={{fontSize:13,border:"1px solid #E8E0D0",borderRadius:6,padding:"6px 10px",color:"#1A1535"}}/>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Suspension has no authoritative trigger anywhere else in the
              data model (see the comment above) — this is its one,
              narrowly-scoped reveal, not a stand-in for the removed
              generic escape hatch. */}
          {!effectiveDateRelevance.suspensionReviewDate&&(
            <div style={{padding:"2px 16px 14px",borderTop:(showRiskExposure||visibleDateFields.length>0)?`1px solid ${COLOR.borderFaint}`:"none"}}>
              <button type="button" onClick={()=>setSuspensionRevealed(true)} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}>+ Record a suspension</button>
            </div>
          )}
        </div>
      )}

      {/* Nothing above is relevant yet (no dismissal-track exposure, no
          fit note/probation/OH signal) — suspension can still genuinely
          happen on any case, so its one narrow reveal stays reachable
          even with no card to sit inside. */}
      {caseCtx.stage!=="closed"&&!showRiskExposure&&visibleDateFields.length===0&&(
        <div style={{marginBottom:SPACE.lg}}>
          <button type="button" onClick={()=>setSuspensionRevealed(true)} style={{fontSize:12,fontWeight:600,color:COLOR.purple,background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}>+ Record a suspension</button>
        </div>
      )}

      {/* 10/10 pass — unlike Risk & tribunal exposure/Key dates (gated
          above on stage!=="closed", unchanged), none of OH process/
          Process checklist/Case roles were ever gated by stage in the
          original tab — OccupationalHealthPanel already decides its own
          closed-case visibility internally (renders when a process is
          genuinely in train, hides only when closed AND never started),
          ProcessChecklistPanel returns null on its own when the org has
          no template configured, and Case roles had no gate at all.
          Kept exactly that visibility; only wrapped each in a collapsed-
          by-default Disclosure now that they're reference/configuration
          material rather than blockers — OH still opens automatically
          the moment real progress exists. */}
      {(()=>{
        // showOh is computed once, above, from the UAT Product Hierarchy
        // pass Part 2 relevance rules (real OH progress, a referral date,
        // a health-relevant process type, or real wellbeing notes for
        // this employee — never inferred from "this is an employee
        // case").
        const showChecklist = !!processTemplate && (
          processTemplate.required_documents?.length>0 ||
          processTemplate.suggested_meetings?.length>0 ||
          processTemplate.suggested_role_ids?.length>0 ||
          !!processTemplate.policy_category ||
          processTemplate.target_days>0
        );
        return (
          <div style={{background:COLOR.surface,border:`1px solid ${COLOR.border}`,borderRadius:RADIUS.surface,padding:"0 16px",marginBottom:SPACE.lg}}>
            {showOh&&(
              <Disclosure title="Occupational health process" defaultOpen={Object.keys(cs.ohProcess?.history||{}).length>0}>
                <OccupationalHealthPanel cs={cs} cases={caseCtx.cases} saveCases={caseCtx.saveCases} stage={caseCtx.stage} ohReportFindings={oh.ohReportFindings} ohReportAnalysisLoading={oh.ohReportAnalysisLoading} onAnalyseOhReport={oh.onAnalyseOhReport} onAcceptOhFinding={oh.onAcceptOhFinding} onDismissOhFinding={oh.onDismissOhFinding} onSendForSignature={oh.onSendForSignature} />
              </Disclosure>
            )}
            {showChecklist&&(
              <Disclosure title="Process checklist" defaultOpen={false}>
                <ProcessChecklistPanel template={processTemplate} />
              </Disclosure>
            )}
            <div style={{paddingBottom:16}}>
              <Disclosure title="Case roles" defaultOpen={false}>
                <CaseRolesPanel cs={cs} caseAccess={caseData.caseAccess} orgMembers={caseData.orgMembers} assignCaseRole={review.assignCaseRole} />
              </Disclosure>
            </div>
          </div>
        );
      })()}

      <AskHrPanel cs={cs} hrReviewRequests={caseData.hrReviewRequests} respondToReview={review.respondToReview} isHR={review.isApprover} />

      <AutomationSuggestionsPanel suggestions={automationSuggestions} automationLevels={automation.automationLevels} cs={cs} onResendReminder={automation.onResendReminder} />

      <div style={{marginTop:automationSuggestions?.length?SPACE.lg:0}}>
        <CaseRiskPanel riskItems={riskItems} onAskWhy={caseActions.onAskWhy} />
      </div>

      <div style={{textAlign:"right",marginTop:SPACE.lg}}>
        <button onClick={async()=>{
          const ok = await shell.confirmDialog({title:"Delete case", message:"This will permanently delete this case and all its meeting records. This cannot be undone.", confirmLabel:"Delete", danger:true});
          if(!ok) return;
          caseCtx.saveCases(caseCtx.cases.filter(x=>x.id!==cs.id));
          shell.setScreen(shell.screens.CASES);
        }} style={{fontSize:11,color:"#C84B2F",background:"none",border:"none",cursor:"pointer",fontFamily:FONT.sans}}>Delete case</button>
      </div>
    </>
  );
}
