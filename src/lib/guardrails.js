// Procedural guardrails — Phase 4 of the reasoning-layer build-out
// (process intelligence wave, after meeting intelligence). Unlike Next
// Best Action / Contradiction Detection / Unanswered Questions, these
// don't need an LLM call: each is a plain, deterministic comparison over
// data the case already holds (who chaired which meeting, evidence
// dates, letter text, allegation fields) — cheaper and more reliable
// than prompting a model to notice a date comparison. Pure and
// unit-testable, mirroring caseReadiness.js.
//
// Each check returns { title, reasoning, sourceRefs } or null. `title` is
// deliberately stable/fixed text (variable detail like names, dates and
// counts goes in `reasoning` only) — App.jsx's syncGuardrailSignals dedupes
// signals by exact title match, so a title that changed every run would
// spawn a fresh signal every time instead of updating one.

import { isFindingStatus } from './allegations';

// Process Intelligence (P6) — plain keyword search over P4's already-
// indexed clauses, not an AI call: still no LLM in this file. Returns
// the first clause across any policy whose heading or text mentions any
// of the given keywords, as a ready-to-render sourceRef, or null if
// nothing indexed matches (no policies uploaded yet, or none relevant —
// both real, common, non-error states).
function findPolicyClauseRef(policies, keywords) {
  for (const policy of policies || []) {
    for (const clause of policy.clauses || []) {
      const haystack = (clause.heading + " " + clause.text).toLowerCase();
      if (keywords.some(k => haystack.includes(k))) {
        return { kind: "policy", id: policy.id, label: policy.name, clauseHeading: clause.heading, clauseText: clause.text };
      }
    }
  }
  return null;
}

function parseFlexDate(str) {
  if (!str) return null;
  if (typeof str === "string" && str.includes("/")) {
    const p = str.split("/");
    const d = new Date(p[2], p[1] - 1, p[0]);
    return isNaN(d) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

// Natural-justice / ACAS Code concern: the person who investigated
// shouldn't also be the one deciding the outcome, so the decision can't
// be seen as pre-judged. Meetings carry their own chair (`manager`) and
// type (the MEETING_TYPES label, e.g. "Investigation"/"Disciplinary").
function checkChairIndependence(cs) {
  const invChairs = new Set((cs.meetings || []).filter(m => m.type === "Investigation" && m.manager).map(m => m.manager));
  const discMeetings = (cs.meetings || []).filter(m => m.type === "Disciplinary" && m.manager && invChairs.has(m.manager));
  if (!discMeetings.length) return null;
  const chair = discMeetings[0].manager;
  const invMeeting = (cs.meetings || []).find(m => m.type === "Investigation" && m.manager === chair);
  return {
    title: "Same person chaired the investigation and the disciplinary hearing",
    reasoning: `${chair} chaired both the investigation and the disciplinary hearing. The ACAS Code of Practice expects the investigating manager and the person deciding the outcome to be different people, so the decision can't be seen as pre-judged — consider whether a different manager should chair the hearing.`,
    sourceRefs: [invMeeting, discMeetings[0]].filter(Boolean).map(m => ({ kind: "meeting", id: m.id })),
  };
}

// Evidence added after the investigation report was concluded hasn't been
// weighed in the findings — worth a look before the case progresses
// further, not a reason to block it.
function checkEvidenceAfterReport(cs) {
  const reportDate = parseFlexDate(cs.investigationReportDate);
  if (!reportDate) return null;
  const late = (cs.evidence || [])
    .map((e, index) => ({ ...e, index }))
    .filter(e => { const d = parseFlexDate(e.date); return d && d > reportDate; });
  if (!late.length) return null;
  return {
    title: "Evidence added after the investigation report was concluded",
    reasoning: `${late.map(e => e.name).join(", ")} — added after the investigation report was concluded. Consider whether this evidence changes the findings before the case progresses.`,
    sourceRefs: late.map(e => ({ kind: "evidence", id: e.index })),
  };
}

// letterOutput doesn't record which letter category was generated (outcome
// vs invite vs suspension etc.), only the free text — this approximates
// "a decision letter for a disciplinary/grievance hearing" via meeting
// type, which is the pairing that normally carries a right of appeal.
// Advisory only, so an occasional false positive (e.g. an invite letter
// attached to a disciplinary meeting) is dismissible via "Not relevant".
function checkAppealClauseMissing(cs, policies) {
  const risky = (cs.meetings || []).filter(m => (m.type === "Disciplinary" || m.type === "Grievance") && m.letterOutput && !/appeal/i.test(m.letterOutput));
  if (!risky.length) return null;
  const m = risky[0];
  const policyRef = findPolicyClauseRef(policies, ["appeal"]);
  return {
    title: "Outcome letter may be missing the right of appeal",
    reasoning: `The letter attached to the ${m.type.toLowerCase()} on ${m.date} doesn't mention a right of appeal. ACAS-code outcome letters should normally set out the right to appeal and how to do so — worth checking before this is sent.`,
    sourceRefs: [{ kind: "meeting", id: m.id }, ...(policyRef ? [policyRef] : [])],
  };
}

// Natural justice — the spec's own worked example (§2): an allegation
// moving toward a hearing without any recorded employee response
// suggests they may not yet have had a genuine opportunity to address
// it. Only fires once an investigation/disciplinary meeting has actually
// been held — a brand-new case with no meetings yet obviously hasn't had
// that opportunity fail to happen; there's nothing to flag.
function checkAllegationResponseOpportunity(cs, caseAllegations, policies) {
  const hasHeldMeeting = (cs.meetings || []).some(m => { const t = (m.type || "").toLowerCase(); return (t.includes("investigation") || t.includes("disciplinary")) && m.record; });
  if (!hasHeldMeeting) return null;
  const unaddressed = caseAllegations.filter(a => !(a.employeeResponse || "").trim());
  if (!unaddressed.length) return null;
  const policyRef = findPolicyClauseRef(policies, ["respond", "response", "opportunity to respond"]);
  return {
    title: unaddressed.length === 1 ? "An allegation has no recorded employee response" : `${unaddressed.length} allegations have no recorded employee response`,
    reasoning: `${unaddressed.length === 1 ? "This allegation hasn't" : "These allegations haven't"} been shown to have been put to the employee for a response yet: ${unaddressed.map(a => a.title).join(", ")}. Natural justice — and most disciplinary policies — expect the employee to have a genuine opportunity to respond to each allegation before findings are reached.`,
    sourceRefs: [...unaddressed.map(a => ({ kind: "allegation", id: a.id, label: a.title })), ...(policyRef ? [policyRef] : [])],
  };
}

// Witness evidence is normally captured as its own "Witness statement"
// evidence entry (see casePeople.js) — if an allegation's free-text
// witness-evidence field is filled in but no such entry exists anywhere
// on the case, the interview described likely hasn't been formally
// recorded yet.
function checkWitnessEvidenceGaps(cs, caseAllegations) {
  const hasWitnessStatement = (cs.evidence || []).some(e => e.type === "Witness statement");
  if (hasWitnessStatement) return null;
  const mentioning = caseAllegations.filter(a => (a.witnessEvidence || "").trim());
  if (!mentioning.length) return null;
  return {
    title: "Witness evidence referenced but no witness statement is on file",
    reasoning: `${mentioning.length === 1 ? "An allegation references" : mentioning.length + " allegations reference"} witness evidence, but no witness statement has been recorded on this case's evidence. Consider whether a formal witness interview is still needed.`,
    sourceRefs: mentioning.map(a => ({ kind: "allegation", id: a.id, label: a.title })),
  };
}

// Phase 16 (Decision Workspace): a finding (substantiated/partially
// substantiated/not substantiated/unable to determine) recorded with
// little or no reasoning is exactly the kind of thing worth a nudge
// before the case progresses — advisory only, never blocks saving the
// finding itself.
const MIN_REASONING_LENGTH = 20;

function checkDecisionReasoningMissing(cs, caseAllegations) {
  const thin = caseAllegations.filter(a => isFindingStatus(a.status) && (a.decisionReasoning || "").trim().length < MIN_REASONING_LENGTH);
  if (!thin.length) return null;
  return {
    title: "A finding was recorded with little or no reasoning",
    reasoning: `${thin.length === 1 ? "One finding" : thin.length + " findings"} — ${thin.map(a => a.title).join(", ")} — ${thin.length === 1 ? "has" : "have"} little or no reasoning recorded. A brief note on what the evidence showed makes the finding easier to defend later, at appeal or otherwise.`,
    sourceRefs: thin.map(a => ({ kind: "allegation", id: a.id, label: a.title })),
  };
}

export function computeGuardrailChecks(cs, allegations, policies) {
  const caseAllegations = (allegations || []).filter(a => a.caseId === cs.id);
  return [
    checkChairIndependence(cs),
    checkEvidenceAfterReport(cs),
    checkAppealClauseMissing(cs, policies),
    checkAllegationResponseOpportunity(cs, caseAllegations, policies),
    checkWitnessEvidenceGaps(cs, caseAllegations),
    checkDecisionReasoningMissing(cs, caseAllegations),
  ].filter(Boolean);
}
