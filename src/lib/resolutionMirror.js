// ─────────────────────────────────────────────────────────────────────────
// PROJECTING AN EMPLOYER RESOLUTION ONTO THE CASE'S MEETING MIRROR.
//
// ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
// │ signing_requests is authoritative and was correct — status=signed,       │
// │ response_type=disputed, response_resolution=partially_accepted. But       │
// │ cases.meetings[].responseResolution stayed NULL, because the review       │
// │ handler never wrote it and the signature-sync poll only refreshed         │
// │ NON-terminal requests, and `signed` is terminal.                         │
// │                                                                         │
// │ Every client-side consumer therefore read a RESOLVED dispute as an        │
// │ UNRESOLVED one, indefinitely:                                            │
// │                                                                         │
// │   row badge    "Signed — notes disputed"                     (stale)      │
// │   quality gap  "…that response has not been reviewed."       (FALSE)      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHY THIS IS A PURE FUNCTION AND NOT INLINE IN THE HANDLER. The handler is
// async, closes over React state and talks to the network, so the only tests
// possible against it are assertions about its source text — and this repo has
// repeatedly found those assertions matching their own comments, or pinning a bug
// in place. A pure transform can be EXECUTED: given a cases array and the
// server's reply, the test checks the array that comes out.
//
// IT IS NOT A SECOND SOURCE OF TRUTH. The row remains authoritative; this only
// updates the existing client projection, from the server's own returned values.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The meeting fields a resolution contributes, read from the SERVER's reply.
 *
 * `response_resolved_by` is deliberately absent. It is an internal auth.users id
 * and `cases.meetings` is readable across the organisation; who reviewed is
 * recorded in signing_requests and in the audit entry, which is where an
 * internal actor id belongs. Nothing in the confirmation semantics or the
 * investigation quality gaps reads it.
 */
export function resolutionMirrorFields(request) {
  if (!request) return null;
  return {
    responseResolution: request.response_resolution || null,
    responseResolutionReason: request.response_resolution_reason || null,
    responseAddendum: request.response_addendum || null,
    responseResolvedAt: request.response_resolved_at || null,
  };
}

/**
 * Return a new cases array with the resolution projected onto one meeting.
 *
 * Immutable throughout: a new array, a new case object, a new meeting object, and
 * every untouched case and meeting kept by REFERENCE — which matters, because
 * saveCases' "sync all" branch uses reference equality to decide what to write.
 *
 * Returns the ORIGINAL array unchanged (same reference) when there is nothing to
 * apply, so a caller can skip the write entirely.
 *
 * It writes only the four fields above. `record`, `participantComment`,
 * `proposedCorrection`, `signature`, `signedAt`, `signStatus` and `responseType`
 * are not in the patch, so the original record and the employee's own words
 * cannot be altered here by construction rather than by convention.
 */
export function mirrorResolutionOntoMeeting(cases, { caseId, meetingId, request } = {}) {
  const fields = resolutionMirrorFields(request);
  if (!Array.isArray(cases) || !caseId || !meetingId || !fields) return cases;
  // Nothing to project. A reply carrying no resolution must not blank the mirror.
  if (!fields.responseResolution) return cases;

  let touched = false;
  const next = cases.map((c) => {
    if (!c || c.id !== caseId || !Array.isArray(c.meetings)) return c;
    let caseTouched = false;
    const meetings = c.meetings.map((m) => {
      if (!m || m.id !== meetingId) return m;
      caseTouched = true;
      return { ...m, ...fields };
    });
    if (!caseTouched) return c;
    touched = true;
    return { ...c, meetings };
  });
  return touched ? next : cases;
}
