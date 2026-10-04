import { isValidConclusion } from './investigationConclusion';

// ─────────────────────────────────────────────────────────────────────────
// THE ONLY WRITER OF THE STRUCTURED INVESTIGATION CONCLUSION.
//
// saveAllegationToDB — the generic allegation writer — deliberately does not
// mention the investigation_conclusion* columns, so no ordinary panel edit can
// carry a stale conclusion back to the database. This is the one path that
// writes them, and it sends exactly two columns.
//
// WHAT IT DELIBERATELY DOES NOT SEND: investigation_conclusion_by and
// investigation_conclusion_at. Those are assigned by
// protect_allegations_investigation_conclusion_columns from auth.uid() and
// now(), and anything a client supplies is discarded. Not sending them makes the
// client honest about that rather than pretending to a say it does not have.
//
// AUTHORITY IS NOT CHECKED HERE. The database restricts this write to HR or the
// case's assigned investigator. This module's refusal handling exists to turn
// that refusal into a sentence an adviser can act on — it is not the boundary,
// and must never be treated as one.
// ─────────────────────────────────────────────────────────────────────────

export const CONCLUSION_WRITE_RESULT = Object.freeze({
  OK: "ok",
  INVALID: "invalid",
  REASONING_REQUIRED: "reasoning_required",
  REFUSED: "refused",
  CONFLICT: "conflict",
  FAILED: "failed",
});

const isRefusal = msg => /only hr or this case|do not have access|cannot be removed once recorded/i.test(msg || "");
const isReasoningRefusal = msg => /must record the reasoning|must be recorded before its reasoning/i.test(msg || "");

/**
 * Record or amend an allegation's structured investigation conclusion.
 *
 * @param {object}   args.supabase          live supabase client
 * @param {string}   args.allegationId
 * @param {string}   args.conclusion        one of INVESTIGATION_CONCLUSION
 * @param {string}   args.reasoning         required, non-blank
 * @param {string?}  args.expectedUpdatedAt the caller's version of the row, for
 *                                          the same optimistic-conflict guard
 *                                          every other allegation write uses
 * @param {function} args.conditionalUpdate injected, so this module stays pure
 *                                          and testable without a live client
 */
export async function recordInvestigationConclusionWrite({
  supabase, allegationId, conclusion, reasoning, expectedUpdatedAt, conditionalUpdate,
}) {
  // Validate before going near the network. The database carries the same two
  // rules — a CHECK constraint and a trigger — so these are a courtesy to the
  // user, never the enforcement.
  if (!allegationId || !isValidConclusion(conclusion)) {
    return { result: CONCLUSION_WRITE_RESULT.INVALID, updatedAt: null };
  }
  if (!String(reasoning || "").trim()) {
    return { result: CONCLUSION_WRITE_RESULT.REASONING_REQUIRED, updatedAt: null };
  }

  const nowIso = new Date().toISOString();
  try {
    const { error, conflict } = await conditionalUpdate(
      supabase, 'allegations', allegationId, expectedUpdatedAt,
      {
        investigation_conclusion: conclusion,
        investigation_conclusion_reasoning: String(reasoning).trim(),
        updated_at: nowIso,
      }
    );
    if (conflict) return { result: CONCLUSION_WRITE_RESULT.CONFLICT, updatedAt: null };
    if (error) {
      const msg = error.message || "";
      if (isReasoningRefusal(msg)) return { result: CONCLUSION_WRITE_RESULT.REASONING_REQUIRED, updatedAt: null, error };
      if (isRefusal(msg)) return { result: CONCLUSION_WRITE_RESULT.REFUSED, updatedAt: null, error };
      return { result: CONCLUSION_WRITE_RESULT.FAILED, updatedAt: null, error };
    }
    return { result: CONCLUSION_WRITE_RESULT.OK, updatedAt: nowIso };
  } catch (e) {
    console.error('recordInvestigationConclusionWrite', e);
    return { result: CONCLUSION_WRITE_RESULT.FAILED, updatedAt: null, error: e };
  }
}

/** The sentence shown to the adviser for each outcome. */
export function describeConclusionWriteOutcome(result) {
  switch (result) {
    case CONCLUSION_WRITE_RESULT.OK:
      return "Investigation conclusion recorded";
    case CONCLUSION_WRITE_RESULT.INVALID:
      return "Choose one of the three investigation conclusions before saving.";
    case CONCLUSION_WRITE_RESULT.REASONING_REQUIRED:
      return "Add your reasoning for this conclusion before saving.";
    case CONCLUSION_WRITE_RESULT.REFUSED:
      return "Only HR or this case's assigned investigator can record an investigation conclusion.";
    case CONCLUSION_WRITE_RESULT.CONFLICT:
      return "This allegation was updated while you were working. We've refreshed it — check it and try again.";
    default:
      return "Couldn't save the investigation conclusion — please try again.";
  }
}
