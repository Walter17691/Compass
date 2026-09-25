// ─────────────────────────────────────────────────────────────────────────
// COMPASS PLATFORM PRIMITIVE — does this meeting type need a case? Phase 4B.
//
// THE PROBLEM. A user could fill in the New Meeting form, press Start or Prepare,
// do real work, and only then be told:
//
//   "This meeting isn't linked to a case yet, so it can't be saved."
//
// That message is correct — Phase 2.1's PARENT_REQUIRED is the data-integrity
// backstop and is NOT weakened here. It is simply arriving far too late.
//
// TWO DIFFERENT REASONS, AND THEY MUST NOT BE CONFLATED.
//
//   CASE_REQUIRED       A disciplinary hearing or an appeal is meaningless
//                       without the formal process it belongs to. The recipe
//                       gates it (a hearing follows an investigation; an appeal
//                       follows an outcome) and, for appeals, a database trigger
//                       verifies the chair against case-level access. A case is
//                       INHERENTLY required, and always will be.
//
//   CASE_PENDING        Informal / 1-1, Return to Work and Investigation are
//                       legitimate standalone meetings. Fact-finding in
//                       particular should be possible before anyone knows what
//                       process, if any, will follow. They need a case today only
//                       because standalone persistence does not exist yet
//                       (Phase 4C/4D). That is a Compass limitation, not a
//                       property of the meeting.
//
// Telling a manager that a welfare conversation "forms part of a formal case
// process" would be false, and would teach them something untrue about their own
// process. So the two states carry different copy.
//
// Phase 4B ships the explanation only. It does NOT enable standalone saving, and
// both states still block before work begins, because an unpersistable meeting
// lifecycle is worse than a clear refusal.
// ─────────────────────────────────────────────────────────────────────────

export const CASE_REQUIREMENT = Object.freeze({
  // A case is inherent to the meeting's meaning. Permanent.
  REQUIRED: "case_required",
  // Phase 4C.3 — this type may now be held with no case at all, persisted as a
  // row in public.meetings. Nothing blocks it.
  STANDALONE_ALLOWED: "standalone_allowed",
  // Standalone is the intended future behaviour; a case is needed for now
  // because Compass cannot yet persist a meeting without one. Since 4C.3 this
  // covers only the DEFERRED types (formal, grievance) — the three
  // standalone-intended types have moved to STANDALONE_ALLOWED.
  PENDING_ARCHITECTURE: "case_pending_architecture",
  // No parent needed from this screen at all (the dev/1-2-1 group saves through
  // its own legacy path — see NEW-20 FULL — and is deliberately untouched).
  NOT_APPLICABLE: "not_applicable",
});

// Approved 2026-09-25. A hearing follows a process; an appeal follows an outcome;
// redundancy meetings belong to a redundancy case.
const CASE_REQUIRED_TYPES = new Set([
  "disciplinary",
  "appeal-disciplinary",
  "appeal-grievance",
  "appeal-dismissal",
  "redundancy-atrisk",
  "redundancy-consult",
  "redundancy-outcome",
  "redundancy-appeal",
]);

// Approved 2026-09-25 as standalone-permitted in the target architecture.
// Investigation is here deliberately: fact-finding should be possible before the
// organisation knows what formal process, if any, will follow.
const STANDALONE_INTENDED_TYPES = new Set([
  "informal",
  "return",
  "investigation",
]);

// Deferred pending a product decision, so they behave like PENDING for now — the
// honest position, since Compass is not asserting they inherently need a case.
// "formal", "grievance", and the dev group (probation, appraisal, pip-review,
// pdp), the last of which must not be moved before saveDevMeetingToCase is
// migrated (NEW-20 FULL).
const DEV_GROUP_TYPES = new Set(["probation", "appraisal", "pip-review", "pdp"]);

export function caseRequirement(meetingTypeId, { isDevGroup = false } = {}) {
  if (!meetingTypeId) return CASE_REQUIREMENT.NOT_APPLICABLE;
  // The dev group keeps its existing behaviour untouched in this phase.
  if (isDevGroup || DEV_GROUP_TYPES.has(meetingTypeId)) return CASE_REQUIREMENT.NOT_APPLICABLE;
  if (CASE_REQUIRED_TYPES.has(meetingTypeId)) return CASE_REQUIREMENT.REQUIRED;
  // Phase 4C.3 — the three approved types can now genuinely be held standalone.
  if (STANDALONE_INTENDED_TYPES.has(meetingTypeId)) return CASE_REQUIREMENT.STANDALONE_ALLOWED;
  // Everything left is DEFERRED (formal, grievance) — still blocked, and still
  // told the honest reason: Compass has not decided, not that the meeting
  // inherently needs a case.
  return CASE_REQUIREMENT.PENDING_ARCHITECTURE;
}

export function isStandaloneIntended(meetingTypeId) {
  return STANDALONE_INTENDED_TYPES.has(meetingTypeId);
}

// The explanation shown BEFORE Start/Schedule/Prepare, and the reason attached to
// the disabled controls. Returns null when nothing blocks.
//
// `hasLinkedCase` is an explicit, id-based fact from the caller — never an
// inference from an employee name.
export function caseRequirementNotice(meetingTypeId, hasLinkedCase, { isDevGroup = false } = {}) {
  if (hasLinkedCase) return null;
  const requirement = caseRequirement(meetingTypeId, { isDevGroup });
  if (requirement === CASE_REQUIREMENT.NOT_APPLICABLE) return null;
  // Phase 4C.3 — nothing to explain and nothing to block. The user chose a
  // meeting type and chose not to link a case; Compass understands the
  // machinery and does not ask them to confirm it, or name the architecture.
  if (requirement === CASE_REQUIREMENT.STANDALONE_ALLOWED) return null;

  if (requirement === CASE_REQUIREMENT.REQUIRED) {
    return {
      requirement,
      title: "This meeting is part of a formal case",
      body: "A hearing or appeal belongs to the case it arises from. Link it to an existing case, or create the case first.",
      // Used as the disabled-control tooltip, so the reason is never invisible —
      // the failure mode of an earlier silently-greyed button.
      blockedReason: "Link this meeting to a case first — a hearing or appeal belongs to a formal case.",
    };
  }

  // PENDING_ARCHITECTURE — honest about whose limitation this is.
  return {
    requirement,
    title: "Link this meeting to a case to continue",
    body: "This kind of meeting does not have to be part of a formal case, but Compass can't save one on its own yet. Link it to an existing case, or create a case for it.",
    blockedReason: "Link this meeting to a case first — Compass can't save a standalone meeting yet.",
  };
}
