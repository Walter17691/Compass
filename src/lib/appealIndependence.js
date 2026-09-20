// Appeal independence classification (Human UAT P1, 2026-09-20).
//
// MIRRORS THE DEPLOYED SQL RULE — supabase/appeal_independence_decision_
// maker_2026-09-18.sql, appoint_appeal_officer(). This file and that
// function must stay aligned: the SQL is authoritative for whether an
// appointment is ALLOWED, this module is authoritative for what Compass may
// then SAY about that appointment in an employee-facing letter. Same inputs,
// same rule, two different consequences.
//
// Why a client-side mirror rather than a persisted status: the SQL records
// its classification only as free-text audit_log action/detail, and
// case_access has no status column. Parsing audit prose is not an
// authoritative source, and adding a column would be a migration this fix
// does not need — both inputs (cases.disciplinary_decided_by,
// allegations.decided_by) are already loaded client-side, so the rule can be
// re-derived exactly. Re-deriving is also the more correct basis for a
// letter being written now: if attribution is added after appointment, the
// letter reflects current reality, and re-derivation can never produce
// 'clear' unless real attribution exists and genuinely does not match.
//
// The SQL rule, verbatim in intent:
//   v_has_conflict           := officer ∈ allegations.decided_by
//                               OR (disciplinary_decided_by is not null
//                                   AND = officer)
//   v_has_known_attribution  := disciplinary_decided_by is not null
//                               OR any allegation has a non-null decided_by
//   conflict  -> INDEPENDENCE_CONFLICT
//   !conflict AND !attribution -> INDEPENDENCE_UNKNOWN
//   otherwise -> clear
//
// Deliberately derives from structured attribution ONLY. Never from the
// audit log, free text, meeting transcripts, case owner/creator, or any AI
// inference — every one of those would reintroduce exactly the guesswork
// this classification exists to prevent.

// Compares two identity values without assuming either is a real UUID: ids
// arrive as strings from Supabase but may be null/undefined, and a loose
// `==` here would make null match undefined and wrongly report a conflict.
function sameUser(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

export function classifyAppealIndependence({ caseRecord, allegations, appealOfficerUserId } = {}) {
  // No appointed officer means there is nobody whose independence could have
  // been established — the conservative direction, and the one that stops
  // any non-involvement claim being made about an unnamed chair.
  if (!appealOfficerUserId) return 'unknown';

  const rows = Array.isArray(allegations) ? allegations : [];
  // caseMapping.js exposes the column as disciplinaryDecidedBy; the raw
  // snake_case form is accepted too so a caller holding an unmapped row
  // cannot silently fall through to 'unknown'.
  const decidedBy = caseRecord?.disciplinaryDecidedBy ?? caseRecord?.disciplinary_decided_by ?? null;
  const allegationDeciders = rows
    .map(a => a?.decidedBy ?? a?.decided_by ?? null)
    .filter(Boolean);

  const hasConflict = sameUser(decidedBy, appealOfficerUserId)
    || allegationDeciders.some(id => sameUser(id, appealOfficerUserId));
  if (hasConflict) return 'conflict';

  const hasKnownAttribution = !!decidedBy || allegationDeciders.length > 0;
  if (!hasKnownAttribution) return 'unknown';

  return 'clear';
}
