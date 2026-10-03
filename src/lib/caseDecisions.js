// WAVE D4.2 — the decision-history domain boundary.
//
// public.case_decisions is the authoritative record of what was decided on a
// case. This module is the only place application code should construct a
// decision, and it exists mainly to make two things impossible to do by
// accident:
//
//   1. choosing `legacy_unmapped` as a sanction
//   2. treating a drafted, saved, approved or downloaded letter as communication
//
// NOTHING READS THIS TABLE YET. cases.outcome remains the compatibility
// projection: Current Warnings, caseStage, nextStep, OutcomeModal, the appeal
// workflow and the Employee File are all unchanged in D4.2. This module is the
// foundation the cutover will use, with no cutover performed.

// The six values OutcomeModal actually offers, read from its own <option> list
// rather than restated from memory. The DB CHECK constraint carries the same
// six, so the two cannot drift on what a sanction is.
export const DECISION_OUTCOMES = Object.freeze([
  'No further action',
  'First written warning',
  'Final written warning',
  'Demotion',
  'Dismissal with notice',
  'Summary dismissal (gross misconduct)',
]);

// ┌─ A HISTORICAL MARKER, NOT A CHOICE ─────────────────────────────────────┐
// │ Production holds exactly one outcome string outside the six:             │
// │ "First written warning issued" — traced in D4.1 to the worked example in │
// │ downloadCaseCsvTemplate's own CSV template, imported through an          │
// │ unvalidated path. It is preserved verbatim in outcome_source_text rather │
// │ than normalised, because "it probably meant a first written warning" is  │
// │ an inference about a sanction and this module does not make those.       │
// │                                                                          │
// │ So legacy_unmapped exists for backfill and is refused here AND by the    │
// │ database trigger. Two locks, because a sanction that nobody chose must   │
// │ never become one somebody appears to have chosen.                        │
// └─────────────────────────────────────────────────────────────────────────┘
export const LEGACY_UNMAPPED = 'legacy_unmapped';

export const DECISION_TYPE = Object.freeze({
  ORIGINAL: 'original',
  APPEAL: 'appeal',
});

export const APPEAL_EFFECT = Object.freeze({
  UNCHANGED: 'unchanged',
  VARIED: 'varied',
  OVERTURNED: 'overturned',
});

// Mechanisms Compass can establish AUTHORITATIVELY. One, today.
//
// The D4 audit proposed a second — `tracked_send` — and it was rejected on
// evidence: it would derive from meeting.letterTracking, which
// src/lib/dsarCaseDisclosure.js states "is populated nowhere", and the only
// writes in the product are `letterTracking: {}`. api/send-letter.js emails via
// Resend and persists nothing. A value here must mean a durable record exists.
export const COMMUNICATED_VIA = Object.freeze({
  SIGNATURE_REQUEST: 'signature_request',
});

export const DECISION_REJECTED = Object.freeze({
  OUTCOME_NOT_OFFERED: 'outcome_not_offered',
  LEGACY_MARKER_NOT_SELECTABLE: 'legacy_marker_not_selectable',
  MISSING_DECIDED_AT: 'missing_decided_at',
  APPEAL_WITHOUT_PREDECESSOR: 'appeal_without_predecessor',
  APPEAL_WITHOUT_EFFECT: 'appeal_without_effect',
  ORIGINAL_CANNOT_SUPERSEDE: 'original_cannot_supersede',
  SELF_SUPERSEDING: 'self_superseding',
  COMMUNICATION_INCOMPLETE: 'communication_incomplete',
  COMMUNICATION_NOT_AUTHORITATIVE: 'communication_not_authoritative',
});

export function isSelectableOutcome(outcome) {
  return DECISION_OUTCOMES.includes(outcome);
}

// True only for a mechanism that leaves durable evidence. Deliberately NOT
// satisfied by letterApprovedAt, savedAt, letterOutput or a download.
export function isAuthoritativeCommunication(via) {
  return Object.values(COMMUNICATED_VIA).includes(via);
}

// Validate a decision an application path wants to record. Returns
// { ok: true, decision } or { ok: false, reason }. It mirrors the database's
// own constraints so a user sees a refusal rather than a constraint violation —
// the database remains the authority, and this is not permitted to be laxer.
export function validateDecision(input = {}) {
  const {
    decisionType = DECISION_TYPE.ORIGINAL, outcome, decidedAt = null,
    supersedesDecisionId = null, appealEffect = null, id = null,
    communicatedAt = null, communicatedVia = null,
  } = input;

  if (outcome === LEGACY_UNMAPPED) {
    return { ok: false, reason: DECISION_REJECTED.LEGACY_MARKER_NOT_SELECTABLE };
  }
  if (!isSelectableOutcome(outcome)) {
    return { ok: false, reason: DECISION_REJECTED.OUTCOME_NOT_OFFERED };
  }
  // A new decision must say when it was decided. Historical NULLs belong to the
  // backfill alone, which runs as a privileged path.
  if (!decidedAt) {
    return { ok: false, reason: DECISION_REJECTED.MISSING_DECIDED_AT };
  }

  if (decisionType === DECISION_TYPE.APPEAL) {
    if (!supersedesDecisionId) return { ok: false, reason: DECISION_REJECTED.APPEAL_WITHOUT_PREDECESSOR };
    if (!appealEffect || !Object.values(APPEAL_EFFECT).includes(appealEffect)) {
      return { ok: false, reason: DECISION_REJECTED.APPEAL_WITHOUT_EFFECT };
    }
    if (id && supersedesDecisionId === id) return { ok: false, reason: DECISION_REJECTED.SELF_SUPERSEDING };
  } else {
    if (supersedesDecisionId) return { ok: false, reason: DECISION_REJECTED.ORIGINAL_CANNOT_SUPERSEDE };
    if (appealEffect) return { ok: false, reason: DECISION_REJECTED.APPEAL_WITHOUT_PREDECESSOR };
  }

  // Communication has a time and a mechanism, or neither.
  if (!!communicatedAt !== !!communicatedVia) {
    return { ok: false, reason: DECISION_REJECTED.COMMUNICATION_INCOMPLETE };
  }
  if (communicatedVia && !isAuthoritativeCommunication(communicatedVia)) {
    return { ok: false, reason: DECISION_REJECTED.COMMUNICATION_NOT_AUTHORITATIVE };
  }

  return { ok: true, decision: { ...input, decisionType } };
}

// The current authoritative position for a case: the decision nobody supersedes.
// Pure, and it reports ambiguity rather than picking — a second head is a
// database-level impossibility (two partial unique indexes), so if one ever
// appears the caller should be told, not quietly handed one of them.
export function currentDecision(decisions = []) {
  const rows = (Array.isArray(decisions) ? decisions : []).filter(d => d && d.id);
  if (!rows.length) return { decision: null, heads: 0 };
  const superseded = new Set(rows.map(d => d.supersedesDecisionId).filter(Boolean));
  const heads = rows.filter(d => !superseded.has(d.id));
  return { decision: heads.length === 1 ? heads[0] : null, heads: heads.length };
}

// The decision chain for a case, oldest first, for history display. Returns []
// rather than a partial chain when the rows do not form one.
export function decisionChain(decisions = []) {
  const rows = (Array.isArray(decisions) ? decisions : []).filter(d => d && d.id);
  const original = rows.find(d => d.decisionType === DECISION_TYPE.ORIGINAL);
  if (!original) return [];
  const bySupersedes = new Map(rows.filter(d => d.supersedesDecisionId).map(d => [d.supersedesDecisionId, d]));
  const chain = [original];
  let next = bySupersedes.get(original.id);
  while (next && chain.length <= rows.length) {
    chain.push(next);
    next = bySupersedes.get(next.id);
  }
  return chain;
}
