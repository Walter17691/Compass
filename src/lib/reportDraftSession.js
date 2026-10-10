// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — THE EDITOR'S STATE, AS A PURE FUNCTION OF WHAT HAS HAPPENED.
//
// Every transition the draft editor can make lives here, as data in and data
// out, so the rules can be tested without rendering anything and so there is
// one place to audit the only two questions that matter:
//
//   1. CAN THE INVESTIGATOR'S TEXT BE LOST? Nothing in this module replaces,
//      trims or discards the body on any failure path. A stale save, a
//      refusal, a dropped connection and an unreadable response all keep the
//      text exactly as typed; the state changes and the text does not. The
//      server's version is never written over the local one — on a conflict
//      the investigator is told what happened and decides.
//
//   2. CAN A RETRY CREATE A SECOND VERSION? The request id is minted per
//      DISTINCT request and reused for an exact repeat of one. The comparison
//      is made at save time against the whole pending request — body, base
//      version, source and reason — so editing a character and saving again
//      is a new request with a new id, while saving the identical thing after
//      a timeout is the same request with the same id, which the database
//      answers idempotently.
//
// WHY THE COMPARISON IS CONTENT-BASED RATHER THAN EVENT-BASED. An earlier
// shape dropped the pending id on every keystroke. That is correct for an
// edit, and wrong for an edit that is undone: typing a letter and deleting it
// again leaves the request byte-identical, and a fresh id would then turn a
// legitimate retry into a second save. Comparing content at save time gets
// both cases right without the editor having to track intent.
//
// WHAT THIS MODULE DOES NOT DECIDE. Whether the actor has authority — the
// database owns that, and `canSave` here is only what the UI was told, used
// to choose between a disabled control and an enabled one. A session with
// canSave true still cannot write anything if Postgres refuses, which is why
// REFUSED is one of the outcomes it handles rather than a state it prevents.
// ─────────────────────────────────────────────────────────────────────────

import {
  composeReportBody, parseReportBody, normaliseSections, emptyReportSections,
  sectionsAreEmpty, bodyRoundTripsExactly,
} from './reportDraftComposer.js';
import { DRAFT_SAVE_RESULT, isUncertainOutcome, describeDraftSaveOutcome } from './reportDraftGateway.js';

export const DRAFT_STATE = Object.freeze({
  /** Saving is not available to this viewer. The report is still shown. */
  READ_ONLY: 'read_only',
  /** Nothing to save: either untouched, or saved and unchanged since. */
  CLEAN: 'clean',
  /** Unsaved changes. */
  DIRTY: 'dirty',
  SAVING: 'saving',
  /** Saved in this session and unchanged since. Distinct from CLEAN so the UI
   *  can confirm the save rather than merely stop showing a warning. */
  SAVED: 'saved',
  /** A competing version was saved from the same base. Local text intact. */
  STALE: 'stale',
  /** HR is saving on a case they are not the investigator for, with no reason
   *  given yet. Distinct from ERROR because it is a prompt, not a fault. */
  NEEDS_HR_REASON: 'needs_hr_reason',
  /** A save failed. Local text intact. `retryable` says whether repeating the
   *  same request id is the correct move. */
  ERROR: 'error',
});

export const READ_ONLY_REASON = Object.freeze({
  NOT_ACTIVATED: 'not_activated',
  NO_AUTHORITY: 'no_authority',
  HISTORY_UNREADABLE: 'history_unreadable',
});

/**
 * Open a session.
 *
 * `body` is the text to start from — normally empty, or the body of a version
 * the investigator chose to continue from. If that body did not come out of
 * this editor it is kept as RAW text in a single field rather than
 * redistributed across the seven, because decomposing somebody else's
 * document and recomposing it on save would rewrite their wording.
 *
 * `baseVersion` is the version number the editor is working from: 0 for a
 * case with no saved versions. It is the concurrency token, so it is required
 * and is not defaulted — a session that does not know its base cannot save.
 */
export function createDraftSession({
  caseId = null,
  baseVersion = null,
  body = '',
  canSave = false,
  readOnlyReason = null,
  requiresHrReason = false,
} = {}) {
  const startBody = typeof body === 'string' ? body : '';
  const exact = startBody.trim() === '' ? true : bodyRoundTripsExactly(startBody);
  const parsed = exact ? parseReportBody(startBody) : null;
  return Object.freeze({
    caseId,
    baseVersion: Number.isInteger(baseVersion) ? baseVersion : null,
    sections: exact ? (parsed?.sections || emptyReportSections()) : emptyReportSections(),
    raw: exact ? '' : startBody,
    rawMode: !exact,
    // What the server is known to hold for this base. Used to tell a genuine
    // edit from a reopened editor, so an untouched session is never DIRTY.
    savedBody: startBody,
    pending: null,
    hrReason: '',
    requiresHrReason: !!requiresHrReason,
    canSave: !!canSave,
    readOnlyReason: canSave ? null : readOnlyReason,
    state: canSave ? DRAFT_STATE.CLEAN : DRAFT_STATE.READ_ONLY,
    lastResult: null,
    message: null,
    retryable: false,
    /** The stale-version review, when one is open. Null otherwise. */
    conflict: null,
    /** Set once a save in this session has stored a version. */
    savedThisSession: false,
  });
}

/** The single text this session would save. */
export function currentBody(session) {
  if (!session) return '';
  return session.rawMode ? (session.raw || '') : composeReportBody(session.sections);
}

/** Is there text the server does not have? */
export function hasUnsavedChanges(session) {
  if (!session) return false;
  if (session.state === DRAFT_STATE.READ_ONLY) return false;
  return currentBody(session) !== (session.savedBody || '');
}

/** Can a save be attempted right now? */
export function canAttemptSave(session) {
  if (!session || !session.canSave) return false;
  if (session.state === DRAFT_STATE.SAVING) return false;
  if (!Number.isInteger(session.baseVersion)) return false;
  const body = currentBody(session);
  if (body.trim() === '') return false;
  return hasUnsavedChanges(session) || session.state === DRAFT_STATE.ERROR || session.state === DRAFT_STATE.STALE;
}

function afterEdit(session, patch) {
  const next = { ...session, ...patch };
  const dirty = currentBody(next) !== (next.savedBody || '');
  return Object.freeze({
    ...next,
    // An edit clears a stale or error banner's claim about the CURRENT text
    // but keeps the message, so the investigator is not told their last save
    // conflicted and then silently un-told it.
    state: dirty ? DRAFT_STATE.DIRTY : DRAFT_STATE.CLEAN,
    retryable: false,
  });
}

/** Edit one or more of the seven sections. */
export function editSections(session, sections) {
  if (!session || session.state === DRAFT_STATE.READ_ONLY) return session;
  return afterEdit(session, { sections: normaliseSections({ ...session.sections, ...(sections || {}) }) });
}

/**
 * Take the editor's live content in one atomic step.
 *
 * THIS IS THE FUNCTION THAT MAKES "SAVE WHAT IS VISIBLE" TRUE. The editor
 * holds the text the investigator is typing in its own local state, so the
 * keystrokes do not re-render the whole case view — which means the session
 * is, by design, slightly behind the screen. Saving therefore cannot read the
 * session; it must be handed the live content and commit it first, in the
 * same synchronous step, with no dependence on a blur event having fired, on
 * React having flushed anything, or on the order in which a browser delivers
 * mousedown and click.
 *
 * `pending` is deliberately NOT cleared. A retry commits content identical to
 * the request whose outcome is unknown, and beginSave compares content to
 * decide whether to reuse the identifier — so committing before an exact
 * retry must not look like a new request.
 */
export function commitLive(session, live) {
  if (!session || session.state === DRAFT_STATE.READ_ONLY) return session;
  const l = (live && typeof live === 'object') ? live : {};
  const patch = {};
  if (l.sections && !session.rawMode) patch.sections = normaliseSections({ ...session.sections, ...l.sections });
  if (typeof l.raw === 'string' && session.rawMode) patch.raw = l.raw;
  const hrReason = typeof l.hrReason === 'string' ? l.hrReason : session.hrReason;

  const next = { ...session, ...patch, hrReason };
  const dirty = currentBody(next) !== (next.savedBody || '');
  const unchanged = currentBody(next) === currentBody(session) && hrReason === session.hrReason;
  if (unchanged) return session;
  return Object.freeze({
    ...next,
    // A commit that is part of a retry must not clear the conflict or error
    // the investigator is still looking at; only the dirty/clean distinction
    // moves. STALE in particular is a state they have to act on.
    state: (session.state === DRAFT_STATE.STALE || session.state === DRAFT_STATE.NEEDS_HR_REASON)
      ? session.state
      : (dirty ? DRAFT_STATE.DIRTY : DRAFT_STATE.CLEAN),
  });
}

/** Edit the raw body, for a session that opened a document it did not write. */
export function editRaw(session, raw) {
  if (!session || session.state === DRAFT_STATE.READ_ONLY) return session;
  if (!session.rawMode) return session;
  return afterEdit(session, { raw: typeof raw === 'string' ? raw : '' });
}

/** Record the HR exception reason. Not a body edit, but it IS part of the
 *  request, so changing it makes the next save a distinct request. */
export function setHrReason(session, reason) {
  if (!session || session.state === DRAFT_STATE.READ_ONLY) return session;
  const hrReason = typeof reason === 'string' ? reason : '';
  const dirty = currentBody(session) !== (session.savedBody || '');
  return Object.freeze({
    ...session,
    hrReason,
    state: session.state === DRAFT_STATE.NEEDS_HR_REASON
      ? (dirty ? DRAFT_STATE.DIRTY : DRAFT_STATE.CLEAN)
      : session.state,
  });
}

/**
 * Build the request for a save, minting or reusing the request id.
 *
 * Returns `{ session, request }`, or `{ session, request: null }` when a save
 * cannot be attempted. `newRequestId` is injected rather than generated here
 * so tests are deterministic and so this module has no dependency on the
 * crypto API.
 */
export function beginSave(session, { newRequestId } = {}) {
  if (!canAttemptSave(session)) return { session, request: null };

  const body = currentBody(session);
  const reason = session.requiresHrReason
    ? (session.hrReason.trim() === '' ? null : session.hrReason.trim())
    : null;

  // HR with no reason is stopped BEFORE a request id is minted, so a prompt
  // does not consume an identifier and the eventual save is a first attempt
  // rather than a retry of something that never left the browser.
  if (session.requiresHrReason && reason === null) {
    return {
      session: Object.freeze({
        ...session,
        state: DRAFT_STATE.NEEDS_HR_REASON,
        message: describeDraftSaveOutcome(DRAFT_SAVE_RESULT.HR_REASON_REQUIRED),
        retryable: false,
      }),
      request: null,
    };
  }

  const candidate = {
    body,
    expectedBaseVersion: session.baseVersion,
    source: 'edited',
    hrReason: reason,
  };

  // AN EXACT REPEAT REUSES THE ID; ANYTHING ELSE GETS A NEW ONE. Compared
  // field by field against the whole pending request, because the database
  // digests all of it — a retry that differs in any one of these is a
  // different request and must not borrow the previous identifier.
  const p = session.pending;
  const isExactRepeat = !!p
    && p.body === candidate.body
    && p.expectedBaseVersion === candidate.expectedBaseVersion
    && p.source === candidate.source
    && p.hrReason === candidate.hrReason;

  const requestId = isExactRepeat ? p.requestId : newRequestId;
  if (typeof requestId !== 'string' || requestId.trim() === '') {
    // No identifier means no save. Refused here rather than sent without one,
    // which the RPC would reject anyway — but this way the editor says so.
    return { session, request: null };
  }

  const pending = { ...candidate, requestId };
  return {
    session: Object.freeze({
      ...session,
      pending,
      state: DRAFT_STATE.SAVING,
      message: null,
      retryable: false,
    }),
    request: { ...pending, caseId: session.caseId },
  };
}

/**
 * Fold a gateway outcome back into the session.
 *
 * `outcome` is what saveReportDraft returned. The body is never touched on any
 * path through this function; only state, message and the pending request are.
 */
export function applySaveResult(session, outcome) {
  if (!session) return session;
  const result = outcome?.result;
  const message = describeDraftSaveOutcome(result);

  if (result === DRAFT_SAVE_RESULT.OK) {
    const version = outcome.version || null;
    const storedBody = session.pending?.body ?? currentBody(session);
    const nextBase = Number.isInteger(version?.versionNo) ? version.versionNo : session.baseVersion;
    // The body that was SENT becomes the saved body — not the body as it is
    // now. If the investigator kept typing while the save was in flight, that
    // later text is still unsaved, and saying so is the honest answer.
    const next = {
      ...session,
      savedBody: storedBody,
      baseVersion: nextBase,
      pending: null,
      lastResult: result,
      message: null,
      retryable: false,
      savedThisSession: true,
      lastSavedVersion: version,
      hrReason: '',
      // The conflict, if there was one, is resolved by the save landing.
      conflict: null,
    };
    const stillDirty = currentBody(next) !== storedBody;
    return Object.freeze({ ...next, state: stillDirty ? DRAFT_STATE.DIRTY : DRAFT_STATE.SAVED });
  }

  if (result === DRAFT_SAVE_RESULT.STALE) {
    // The base is wrong, so a retry is a DIFFERENT request by definition —
    // the base version is part of what the database digests. The pending id
    // is therefore released, and the local text is kept untouched.
    //
    // A CONFLICT NOW OPENS A REVIEW RATHER THAN OFFERING A BUTTON. An earlier
    // version of this advanced the base from the already-loaded list and
    // offered to save straight away, which asked the investigator to decide
    // something they had not been shown: who saved, when, and what it said.
    // The conflict starts in `fetching` and the caller must resolve it
    // through the authorised case-scoped gateway before any confirmation is
    // possible.
    return Object.freeze({
      ...session,
      pending: null,
      state: DRAFT_STATE.STALE,
      lastResult: result,
      message,
      retryable: false,
      conflict: { state: 'fetching', latest: null, body: null, bodyState: 'idle' },
    });
  }

  if (result === DRAFT_SAVE_RESULT.HR_REASON_REQUIRED) {
    return Object.freeze({
      ...session,
      pending: null,
      requiresHrReason: true,
      state: DRAFT_STATE.NEEDS_HR_REASON,
      lastResult: result,
      message,
      retryable: false,
    });
  }

  const uncertain = isUncertainOutcome(result);
  return Object.freeze({
    ...session,
    // KEPT only where the outcome is genuinely unknown, so the retry is the
    // same request and cannot duplicate. Released otherwise: a known refusal
    // repeated with the same id would be refused again for the same reason.
    pending: uncertain ? session.pending : null,
    state: DRAFT_STATE.ERROR,
    lastResult: result,
    message,
    retryable: uncertain,
  });
}

// ── THE CONFLICT REVIEW ───────────────────────────────────────────────────
//
// A stale save is the one moment where two people's work is in play, so it is
// the one moment the product must slow down. These transitions exist so the
// investigator is shown WHAT they are following before being asked whether to
// follow it, and so that Compass fails closed when it cannot show them.

/** The authorised, case-scoped read came back. `latest` is the newest version. */
export function conflictLatestLoaded(session, latest) {
  if (!session || session.state !== DRAFT_STATE.STALE) return session;
  if (!latest || !Number.isInteger(latest.versionNo)) return conflictUnavailable(session);
  return Object.freeze({
    ...session,
    conflict: { state: 'ready', latest, body: null, bodyState: 'idle' },
  });
}

/**
 * The newer version could not be retrieved. FAIL CLOSED: the local draft is
 * preserved and no confirmation is offered, because confirming would mean
 * agreeing to follow a version Compass cannot describe.
 */
export function conflictUnavailable(session) {
  if (!session || session.state !== DRAFT_STATE.STALE) return session;
  return Object.freeze({
    ...session,
    conflict: { state: 'unavailable', latest: null, body: null, bodyState: 'idle' },
  });
}

/** The investigator asked to read the newer version. */
export function conflictBodyLoading(session) {
  if (!session?.conflict) return session;
  return Object.freeze({ ...session, conflict: { ...session.conflict, bodyState: 'fetching' } });
}

export function conflictBodyLoaded(session, body) {
  if (!session?.conflict) return session;
  return Object.freeze({
    ...session,
    conflict: { ...session.conflict, body: typeof body === 'string' ? body : '', bodyState: 'ready' },
  });
}

export function conflictBodyUnavailable(session) {
  if (!session?.conflict) return session;
  return Object.freeze({ ...session, conflict: { ...session.conflict, body: null, bodyState: 'unavailable' } });
}

/**
 * May the investigator be offered the confirm action?
 *
 * Only when Compass can say which version they would be following. Not while
 * the read is in flight, and never when it failed.
 */
export function canConfirmRebase(session) {
  return !!session
    && session.state === DRAFT_STATE.STALE
    && session.conflict?.state === 'ready'
    && Number.isInteger(session.conflict.latest?.versionNo);
}

/**
 * The explicit confirmation. Moves the base to the version just reviewed and
 * keeps every character of the local text.
 *
 * REVALIDATION IS NOT DONE HERE, AND THAT IS THE POINT. Another save can land
 * between the review and the confirmation, so a client-side check would be a
 * guess with a race in it. The authority is the database: the save that
 * follows states this base, and save_investigation_report_version compares it
 * against max(version_no) under a row lock on the case. If someone else has
 * saved again in the meantime it raises 40001 once more and the review
 * reopens against the newer version. The confirmation is a statement of
 * intent; the base is revalidated where it can actually be enforced.
 */
export function confirmRebase(session) {
  if (!canConfirmRebase(session)) return session;
  return rebaseOnto(session, session.conflict.latest.versionNo);
}

/**
 * Rebase onto the latest saved version after a conflict, KEEPING the local
 * text.
 *
 * This is the recovery path for STALE. It does not merge, does not fetch, and
 * does not replace a single character of what the investigator wrote — it
 * only updates the concurrency token so that saving again competes fairly. The
 * investigator has been shown that a newer version exists and is choosing to
 * save their own text as the next version on top of it.
 */
export function rebaseOnto(session, latestVersionNo) {
  if (!session) return session;
  if (!Number.isInteger(latestVersionNo)) return session;
  const dirty = currentBody(session) !== (session.savedBody || '');
  return Object.freeze({
    ...session,
    baseVersion: latestVersionNo,
    pending: null,
    state: dirty ? DRAFT_STATE.DIRTY : DRAFT_STATE.CLEAN,
    lastResult: null,
    message: null,
    retryable: false,
    conflict: null,
  });
}

/** Turn a save-capable session read-only without discarding its text. Used
 *  when authority or activation changes under the editor. */
export function makeReadOnly(session, reason) {
  if (!session) return session;
  return Object.freeze({
    ...session, canSave: false, readOnlyReason: reason || READ_ONLY_REASON.NO_AUTHORITY,
    state: DRAFT_STATE.READ_ONLY, pending: null, retryable: false, conflict: null,
  });
}

/** The one line the editor shows about where the draft stands. */
export function describeDraftState(session) {
  if (!session) return 'No draft is open.';
  switch (session.state) {
    case DRAFT_STATE.READ_ONLY:
      switch (session.readOnlyReason) {
        case READ_ONLY_REASON.NOT_ACTIVATED:
          return 'Saving report drafts is not yet switched on for your organisation. You can read the report and its history here.';
        case READ_ONLY_REASON.HISTORY_UNREADABLE:
          return 'Compass could not read this case’s report history, so it cannot tell which version a draft would follow. Saving is unavailable until it loads.';
        default:
          return 'You can read this report. Only the case’s assigned investigator, or HR under a documented exception, can save a draft.';
      }
    case DRAFT_STATE.CLEAN:
      return sectionsAreEmpty(session.sections) && (session.raw || '').trim() === ''
        ? 'No draft has been written yet.'
        : 'No unsaved changes.';
    case DRAFT_STATE.DIRTY:
      return 'Unsaved changes. Nothing is stored until you save a version.';
    case DRAFT_STATE.SAVING:
      return 'Saving…';
    case DRAFT_STATE.SAVED:
      return Number.isInteger(session.lastSavedVersion?.versionNo)
        ? `Saved as version ${session.lastSavedVersion.versionNo}.`
        : 'Saved.';
    case DRAFT_STATE.STALE:
      switch (session.conflict?.state) {
        case 'fetching':
          return 'Someone else saved a version of this report while you were writing. Your text is still here and has not been changed. Compass is checking what was saved.';
        case 'unavailable':
          return 'Someone else saved a version of this report while you were writing, and Compass cannot read it to show you what changed. Your text is still here and has not been changed. Saving again is unavailable until the history loads, so copy anything you need.';
        default:
          return session.message;
      }
    case DRAFT_STATE.NEEDS_HR_REASON:
      return session.message;
    case DRAFT_STATE.ERROR:
      return session.message;
    default:
      return '';
  }
}
