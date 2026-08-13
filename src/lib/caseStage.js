// Stage-inference heuristics, one per case-type "shape". Disciplinary
// (investigation -> inv_report -> disciplinary -> outcome -> appeal ->
// closed) is the default and covers misconduct/capability/attendance/etc
// — anything without its own table below. Grievance (ACAS S6) has no
// separate investigation-vs-hearing split the way disciplinary does, so
// it collapses to intake -> hearing -> outcome -> appeal -> closed.
// DevelopScreen's own probation/appraisal/PDP flow (a genuinely separate,
// already-working system) stays exactly as it is — this is specifically
// for the regular case flow's own "probation"/"flexible working"/
// "long-term sickness" case types (already selectable in the quick-create
// dropdown, or new here), which had no dedicated stage tracking at all
// before Process Intelligence (P2) — see processStages.js for the full
// per-type stage registry these heuristics return ids from.
function inferDisciplinaryStage(cs) {
  const meetings = cs.meetings||[];
  const types = meetings.map(m=>(m.type||"").toLowerCase());
  const hasOutcome = meetings.some(m=>m.letterOutput);
  const hasSigned = meetings.some(m=>m.signStatus==="signed");
  const hasInvReport = cs.investigationReport;
  if(hasSigned&&hasOutcome) return "closed";
  if(types.some(t=>t.includes("appeal"))) return "appeal";
  if(hasOutcome) return "outcome";
  if(types.some(t=>t.includes("disciplinary"))) return "disciplinary";
  if(hasInvReport) return "inv_report";
  if(types.some(t=>t.includes("investigation"))) return "investigation";
  if(meetings.length>0) return "investigation";
  return "intake";
}

function inferGrievanceStage(cs) {
  const meetings = cs.meetings||[];
  const types = meetings.map(m=>(m.type||"").toLowerCase());
  const hasOutcome = meetings.some(m=>m.letterOutput);
  const hasSigned = meetings.some(m=>m.signStatus==="signed");
  if(hasSigned&&hasOutcome) return "closed";
  if(types.some(t=>t.includes("appeal"))) return "appeal";
  if(hasOutcome) return "outcome";
  if(types.some(t=>t.includes("grievance"))) return "hearing";
  return "intake";
}

// P2 — no structured data exists yet for these three (fit notes, OH
// referral dates, probation review dates are P16's job) so, like the two
// heuristics above, this reads only what's already on the case: meeting
// count/type and whether an outcome has been recorded. Coarse by design —
// real dated fields will let this get more precise once P16 lands them.
function inferLongTermSicknessStage(cs) {
  const meetings = cs.meetings||[];
  const types = meetings.map(m=>(m.type||"").toLowerCase());
  if(cs.outcome) return "decision";
  if(types.some(t=>t.includes("capability"))) return "capability_consideration";
  if(types.some(t=>t.includes("occupational health"))) return "occupational_health";
  if(meetings.length>0) return "contact_welfare";
  return "absence_identified";
}

function inferProbationStage(cs) {
  const meetings = cs.meetings||[];
  if(cs.outcome) return "outcome";
  if(meetings.length>1) return "concerns_raised";
  if(meetings.length>0) return "check_in";
  return "probation_started";
}

function inferFlexibleWorkingStage(cs) {
  const meetings = cs.meetings||[];
  if(cs.outcome) return "decision";
  if(meetings.some(m=>(m.type||"").toLowerCase().includes("appeal"))) return "appeal";
  if(meetings.length>0) return "decision_meeting";
  return "request_received";
}

export function isGrievanceCase(cs) {
  return (cs?.caseType||"").toLowerCase()==="grievance";
}

// Case-type strings normalized the same way processStages.js's registry
// does — see that file for why the vocabulary is this specific list
// (two case-creation entry points, never sharing one vocabulary).
function normalizedCaseType(cs) {
  return (cs?.caseType||"").trim().toLowerCase();
}

export function getCaseStage(cs) {
  if(cs.stage==="closed") return "closed";
  // An explicitly-tracked stage always wins over the heuristic below. The
  // guided flow sets cs.stage at every real transition (disciplinary,
  // outcome, appeal, closed), including the moment an outcome letter is
  // drafted — so a case correctly sitting at "outcome" almost immediately
  // satisfies hasSigned&&hasOutcome too (the hearing gets signed, then the
  // outcome letter is saved as a separate meeting entry). Checking the
  // heuristic first used to silently reclassify that case as "closed"
  // while its 5-working-day ACAS appeal window was still legally live —
  // which also suppressed the appeal-window deadline in deadlines.js
  // (skips closed cases) and returned null from getNextStep, showing no
  // guidance at all during a window HR actually needs to be watching.
  // Moved here, the heuristic only ever fires for cases with no tracked
  // stage at all — meeting-only data added outside the guided flow.
  if(cs.stage) return cs.stage;
  const type = normalizedCaseType(cs);
  if(type==="probation") return inferProbationStage(cs);
  if(type==="flexible working"||type==="flexible_working") return inferFlexibleWorkingStage(cs);
  if(type==="long-term sickness"||type==="long term sickness"||type==="long_term_sickness") return inferLongTermSicknessStage(cs);
  return isGrievanceCase(cs) ? inferGrievanceStage(cs) : inferDisciplinaryStage(cs);
}

// Process Intelligence (P17, §18) — the "Potential Bottlenecks" panel
// needs to know how long a case has sat in its current stage, and
// nothing tracked that before now (P2's own note: cs.stage is set at
// several explicit transition points, but none of them stamped a
// timestamp). Rather than touching every one of those call sites
// individually, this is called once, centrally, from saveCases — the
// single place every case write already passes through — comparing
// computed stage (not just the raw cs.stage field, so heuristically-
// inferred transitions get tracked too, not only explicit ones) before
// and after. Stored inside the existing timelineOverrides JSONB column
// (no migration needed) rather than a new one.
export function withStageTransitionStamp(cs, prevCs) {
  const stage = getCaseStage(cs);
  const prevStage = prevCs ? getCaseStage(prevCs) : null;
  if(stage === prevStage) return cs;
  const stageEnteredAt = { ...(cs.timelineOverrides?.stageEnteredAt || {}), [stage]: new Date().toISOString() };
  return { ...cs, timelineOverrides: { ...(cs.timelineOverrides || {}), stageEnteredAt } };
}

// "Currently" risk, not "ever was" — the most recent meeting that carries a
// rating, not just any meeting that ever did. A case rated HIGH early on
// that later resolved down to LOW should read as LOW here; the org-wide
// report intentionally uses a separate "ever was HIGH" signal instead
// (src/screens/ErReportScreen.jsx), since a case that once carried real
// risk is still worth a historical flag there.
export function getCurrentRisk(cs) {
  const rated = (cs.meetings||[])
    .filter(m=>m.riskScore?.rating && m.riskScore.rating!=="UNKNOWN")
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  return rated[0]?.riskScore?.rating || null;
}
