import { describe, it, expect } from 'vitest';

// Appeal Hearing P1 reliability pass (2026-09-18) — regression coverage
// for App.jsx's saveMeetingToCaseImpl reliability fix. That function is a
// non-exported closure inside the top-level App component (not directly
// unit-testable), so — matching this codebase's own established
// convention for such logic (see appealHearingChairIntegrity.test.js and
// siblings) — its exact decision logic is mirrored here as pure functions
// and tested exhaustively. Its user-visible behaviour (whether "Save to
// case" actually navigates) is covered directly and non-mirrored in
// src/test/ReviewScreen.test.jsx and src/test/LetterScreen.test.jsx,
// since those components ARE directly renderable.

// Verbatim copy of App.jsx's own describeSaveMeetingError — translates the
// database's own known rejection messages into human-readable copy,
// never exposing the raw Postgres/PostgREST text, with a generic fallback
// for anything else (including genuinely raw/unexpected provider errors).
function describeSaveMeetingError(message) {
  const msg = message || "";
  if (msg.startsWith("APPEAL_CHAIR_MISMATCH") || msg.startsWith("APPEAL_HEARING_CHAIR_MISSING")) {
    return "This appeal hearing could not be saved because the appointed appeal officer has changed or could not be verified. Return to the case and check the appeal officer.";
  }
  if (msg.startsWith("APPEAL_HEARING_CHAIR_IMMUTABLE")) {
    return "This appeal hearing's record could not be saved because its recorded chair cannot be changed after saving.";
  }
  return "Couldn't save this meeting — please try again.";
}

// Mirrors saveMeetingToCaseImpl's own post-saveCases branching exactly:
// given the {ok, reason, message} contract saveCaseToDB now returns,
// decide whether to roll back the optimistic local update, show a
// translated error, and whether the success-only side effects (audit,
// success toast, navigation) may run.
function decideSaveOutcome(result) {
  if (result?.ok) {
    return { shouldRollback: false, shouldShowError: false, shouldProceedAsSuccess: true, errorMessage: null };
  }
  if (result?.reason === 'conflict') {
    // Benign, already-recovered conflict — saveCaseToDB's own info toast
    // and loadCasesFromDB() already fired. No rollback needed (a fresh
    // reload is already in flight), no additional error, and definitely
    // not success for THIS attempt.
    return { shouldRollback: false, shouldShowError: false, shouldProceedAsSuccess: false, errorMessage: null };
  }
  return { shouldRollback: true, shouldShowError: true, shouldProceedAsSuccess: false, errorMessage: describeSaveMeetingError(result?.message) };
}

describe('describeSaveMeetingError — human-readable translation, never the raw database message', () => {
  it('an appeal-chair mismatch is translated to actionable copy', () => {
    const copy = describeSaveMeetingError('APPEAL_CHAIR_MISMATCH: the recorded appeal hearing chair must be the currently appointed appeal officer for this case');
    expect(copy).toBe('This appeal hearing could not be saved because the appointed appeal officer has changed or could not be verified. Return to the case and check the appeal officer.');
    expect(copy).not.toContain('APPEAL_CHAIR_MISMATCH');
  });

  it('a missing appeal-hearing chair is translated to the same actionable copy', () => {
    const copy = describeSaveMeetingError('APPEAL_HEARING_CHAIR_MISSING: a newly created appeal hearing record must specify chairUserId');
    expect(copy).toContain('appointed appeal officer has changed or could not be verified');
    expect(copy).not.toContain('APPEAL_HEARING_CHAIR_MISSING');
  });

  it('an immutability violation gets its own distinct copy', () => {
    const copy = describeSaveMeetingError("APPEAL_HEARING_CHAIR_IMMUTABLE: an appeal hearing's recorded chair cannot be changed or removed after it is saved");
    expect(copy).toContain('cannot be changed after saving');
    expect(copy).not.toContain('APPEAL_HEARING_CHAIR_IMMUTABLE');
  });

  it('any other/unexpected database message falls back to a generic, still human-readable message — never the raw text', () => {
    const copy = describeSaveMeetingError('permission denied for table cases');
    expect(copy).toBe("Couldn't save this meeting — please try again.");
    expect(copy).not.toContain('permission denied');
  });

  it('a missing message (undefined/null) falls back to the same generic copy without throwing', () => {
    expect(describeSaveMeetingError(undefined)).toBe("Couldn't save this meeting — please try again.");
    expect(describeSaveMeetingError(null)).toBe("Couldn't save this meeting — please try again.");
  });
});

describe('decideSaveOutcome — the full success/failure/conflict decision gate', () => {
  it('successful save: no rollback, no error, proceeds as success (navigation/audit/success toast all run)', () => {
    expect(decideSaveOutcome({ ok: true })).toEqual({ shouldRollback: false, shouldShowError: false, shouldProceedAsSuccess: true, errorMessage: null });
  });

  it('a genuine rejection: rolls back the optimistic local state and shows a translated error — never proceeds as success', () => {
    const result = decideSaveOutcome({ ok: false, reason: 'error', message: 'APPEAL_CHAIR_MISMATCH: the recorded appeal hearing chair must be the currently appointed appeal officer for this case' });
    expect(result.shouldRollback).toBe(true);
    expect(result.shouldShowError).toBe(true);
    expect(result.shouldProceedAsSuccess).toBe(false);
    expect(result.errorMessage).toContain('appointed appeal officer has changed');
  });

  it('a benign conflict: no rollback (a fresh reload is already in flight), no additional error toast, but still not success for this attempt', () => {
    expect(decideSaveOutcome({ ok: false, reason: 'conflict' })).toEqual({ shouldRollback: false, shouldShowError: false, shouldProceedAsSuccess: false, errorMessage: null });
  });

  // The exact race named in the remediation: hearing opened while Officer
  // A was appointed, reassigned to Officer B before Save, so the database
  // correctly rejects the stale Officer-A chairUserId.
  it('stale-officer race: officer reassigned mid-preparation produces a visible, actionable rejection, never a false success', () => {
    const result = decideSaveOutcome({ ok: false, reason: 'error', message: 'APPEAL_CHAIR_MISMATCH: the recorded appeal hearing chair must be the currently appointed appeal officer for this case' });
    expect(result.shouldProceedAsSuccess).toBe(false);
    expect(result.shouldShowError).toBe(true);
    expect(result.errorMessage).toBe('This appeal hearing could not be saved because the appointed appeal officer has changed or could not be verified. Return to the case and check the appeal officer.');
    // Rolling back is what makes a subsequent, conscious retry (after the
    // operator checks the case and sees the new officer) build its fresh
    // meeting object on top of the REAL, unmodified case data rather than
    // appending alongside the first, still-unpersisted attempt.
    expect(result.shouldRollback).toBe(true);
  });

  it('a valid, current officer at the moment of save succeeds — the happy path is unaffected by the reliability fix', () => {
    expect(decideSaveOutcome({ ok: true }).shouldProceedAsSuccess).toBe(true);
  });
});

describe('retry-after-rollback does not compound a duplicate meeting', () => {
  // Mirrors the actual risk named in the remediation: saveCases always
  // updates local state optimistically BEFORE the database confirms
  // anything. Without a rollback, a retry's fresh meeting object (each
  // save call generates its own new id) would be appended on top of
  // local state that still (wrongly) contains the first, rejected entry.
  function appendMeeting(existingMeetings, meeting) {
    return [...existingMeetings, meeting];
  }

  it('without rollback, a retry would compound: two meeting entries survive locally even though only one was ever meant to exist', () => {
    const original = [];
    const firstAttempt = appendMeeting(original, { id: 'm1', type: 'Disciplinary Appeal' });
    // Simulates the bug: local state kept the rejected first attempt.
    const secondAttemptWithoutRollback = appendMeeting(firstAttempt, { id: 'm2', type: 'Disciplinary Appeal' });
    expect(secondAttemptWithoutRollback).toHaveLength(2);
  });

  it('with rollback (restoring the pre-save snapshot on failure), a retry starts clean: only the successful attempt\'s single entry survives', () => {
    const original = [];
    const preSaveSnapshot = original; // captured before the first attempt
    // First attempt rejected -> roll back to preSaveSnapshot (still []).
    const afterRollback = preSaveSnapshot;
    const retryAttempt = appendMeeting(afterRollback, { id: 'm2', type: 'Disciplinary Appeal' });
    expect(retryAttempt).toHaveLength(1);
    expect(retryAttempt[0].id).toBe('m2');
  });
});
