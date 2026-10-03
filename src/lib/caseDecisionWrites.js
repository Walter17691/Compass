// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.3 — the authoritative decision write, kept OUT of the App component.
//
// Same two reasons as reconciliationWrites.js: a real exported function with an
// injected client is directly testable and has no hand-written mirror to drift
// from, and App.jsx's React Compiler analysis degrades as callees are added.
//
// This module re-checks NO authorisation rule. Every precondition —
// authenticated, HR in the case's organisation or its disciplinary officer, case
// access, recognised outcome, warning-duration rules, optimistic concurrency —
// lives inside record_case_decision(). A second client-side copy of an
// authorisation rule is a rule that can drift, and the weaker copy always wins
// the argument in someone's head.
//
// It also supplies no provenance. decided_by, decided_at and warning_expires_at
// are derived server-side; sending them would invite the server to trust them.
// ─────────────────────────────────────────────────────────────────────────

export const DECISION_RESULT = Object.freeze({
  OK: 'ok',
  // The case changed underneath the user. The existing conflict UX applies: the
  // case is refreshed and nothing is auto-resubmitted.
  CONFLICT: 'conflict',
  // A decision already exists for this case. The partial unique index
  // case_decisions_one_original_per_case_idx is what makes a replay or a
  // double-submit land here instead of creating a second authoritative decision.
  ALREADY_DECIDED: 'already_decided',
  REFUSED: 'refused',
  INVALID: 'invalid',
  // The RPC is not there. This has exactly one expected cause: the few seconds
  // of the D4.3 cutover between the new bundle going live and the migration
  // being applied. The old bundle wrote the case directly, so the alternative
  // deployment order would have left HR unable to record an outcome for the
  // ~90s of a Vercel build instead. Naming this state means that window tells
  // the user to wait rather than implying their decision failed.
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
});

// 42883 is undefined_function; PostgREST reports a missing RPC as PGRST202.
//
// The message fallback is deliberately narrow. A bare /does not exist/ would also
// swallow "column … does not exist" — a genuine schema bug — and report it to the
// user as "Compass is finishing an update", which is exactly the kind of
// reassuring misdiagnosis that hides a real defect. So the message must name THIS
// function.
export function isRpcMissing(error) {
  if (!error) return false;
  if (error.code === '42883' || error.code === 'PGRST202') return true;
  const msg = error.message || '';
  return /record_case_decision/.test(msg)
    && /could not find the function|does not exist/i.test(msg);
}

// 23505 is unique_violation. Matched on the code AND the index name, because
// Supabase surfaces codes inconsistently across transports and losing this
// distinction would turn "this case already has a decision" into a generic
// failure — the same reasoning as reconciliationWrites' PT409 handling.
export function isAlreadyDecided(error) {
  if (!error) return false;
  return error.code === '23505'
    || /case_decisions_one_original_per_case_idx/i.test(error.message || '')
    || /one_successor_idx/i.test(error.message || '');
}

// 42501 is insufficient_privilege — every authorisation refusal inside the RPC.
export function isRefused(error) {
  if (!error) return false;
  return error.code === '42501' || /not permitted|do not have access|Only HR/i.test(error.message || '');
}

// Record ONE authoritative decision for a case.
//
// `expectedUpdatedAt` carries the version the caller read, so the RPC can apply
// the SAME optimistic-concurrency contract saveCaseToDB already used. Omitting it
// is permitted and reproduces saveCaseToDB's unconditional branch; passing it is
// strongly preferred and is what the UI does.
export async function recordCaseDecisionWrite({
  supabase, caseId, outcome, outcomeNotes = null,
  warningDurationMonths = null, expectedUpdatedAt = null,
}) {
  if (!supabase || !caseId || !outcome) return { result: DECISION_RESULT.INVALID };
  try {
    const { data, error } = await supabase.rpc('record_case_decision', {
      p_case_id: caseId,
      p_outcome: outcome,
      p_outcome_notes: outcomeNotes,
      p_warning_duration_months: warningDurationMonths,
      p_expected_updated_at: expectedUpdatedAt,
    });
    if (error) {
      if (isAlreadyDecided(error)) return { result: DECISION_RESULT.ALREADY_DECIDED, error };
      if (isRefused(error)) return { result: DECISION_RESULT.REFUSED, error };
      // Checked before the generic error so the cutover window is legible.
      if (isRpcMissing(error)) return { result: DECISION_RESULT.UNAVAILABLE, error };
      return { result: DECISION_RESULT.ERROR, error };
    }
    // The RPC returns {ok:false, reason:'conflict'} rather than raising, so a
    // stale version reads as a recoverable conflict instead of an error — which
    // is what the existing UX distinguishes.
    if (data && data.ok === false) {
      return { result: data.reason === 'conflict' ? DECISION_RESULT.CONFLICT : DECISION_RESULT.REFUSED, data };
    }
    return { result: DECISION_RESULT.OK, data: data || null };
  } catch (err) {
    return { result: DECISION_RESULT.ERROR, error: err };
  }
}

// What to tell the user. Kept here with the result codes so a new code cannot be
// added without someone deciding what it says.
export function describeDecisionOutcome(result) {
  switch (result) {
    case DECISION_RESULT.OK: return null;
    case DECISION_RESULT.CONFLICT: return null;   // the refresh toast already spoke
    case DECISION_RESULT.ALREADY_DECIDED:
      return 'This case already has a recorded outcome. Refresh to see the current decision.';
    case DECISION_RESULT.REFUSED:
      return 'You do not have authority to record this outcome on this case.';
    case DECISION_RESULT.UNAVAILABLE:
      // Deliberately tells them to wait, and does NOT say "failed": nothing was
      // written, and trying again in a moment will work.
      return 'Compass is finishing an update — nothing was recorded. Please try again in a moment.';
    default:
      return "Couldn't record the outcome — please try again";
  }
}
