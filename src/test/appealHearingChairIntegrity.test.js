import { describe, it, expect } from 'vitest';

// Appeal Hearing Control Remediation (2026-09-18, REVISED) — regression
// coverage for the per-meeting design in supabase/appeal_hearing_chair_
// integrity_2026-09-18.sql and its client-side counterpart in App.jsx's
// saveMeetingToCaseImpl (chairUserId stamped directly on the meeting
// object being constructed).
//
// This supersedes the first version of this test file, which mirrored a
// case-level cases.appeal_hearing_chair_id scalar. A follow-up invariant
// review proved that design only enforced "IF the chair column happens to
// change, it must be valid" rather than "WHENEVER an appeal hearing is
// persisted, a verified chair must exist" — confirmed empirically via ten
// rolled-back disposable tests that all appended unattributed appeal-type
// meetings successfully. The authoritative chair is now a field on the
// individual meeting entry itself (chairUserId), verified by diffing
// cases.meetings against its prior value, matched by each entry's own
// stable id — never by array position, since meetings ARE patched in
// place elsewhere in the app (signature status, reminder timestamps,
// checklist toggles).
//
// Same approach as sibling files: pure-JS mirrors of the live client
// logic and SQL trigger, unit-tested exhaustively, defined here only —
// not exported, not added to any production file.

function isValidUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Mirrors the trigger's per-entry classifier exactly: an appeal-type
// entry (matching the codebase's own established "appeal" substring
// convention) whose ONLY content is a drafted invitation/outcome letter
// (letterType 'invite'/'appeal', no record text, no transcript) is a
// letter-shaped record, not a hearing, and never requires a chair. Any
// entry with real record/transcript content is treated as a hearing
// regardless of whether a letter also happens to be attached — under-
// enforcing is the unsafe direction.
function classifyMeetingEntry(entry) {
  const type = (entry.type || '').toLowerCase();
  const isAppealType = type.includes('appeal');
  const isLetterOnly = ['invite', 'appeal'].includes(entry.letterType) && !(entry.record || '') && !((entry.transcript || []).length);
  return { isAppealType, isLetterOnly, requiresChair: isAppealType && !isLetterOnly };
}

// Mirrors the trigger's validation for a NEWLY CREATED meeting entry
// (no counterpart by id in the prior meetings array).
function validateNewMeetingEntry(entry, { currentAppealManagerUserId }) {
  const { requiresChair } = classifyMeetingEntry(entry);
  if (!requiresChair) return { ok: true };
  const chair = entry.chairUserId;
  if (!chair || !isValidUuid(chair)) return { ok: false, error: 'APPEAL_HEARING_CHAIR_MISSING' };
  if (currentAppealManagerUserId == null || chair !== currentAppealManagerUserId) return { ok: false, error: 'APPEAL_CHAIR_MISMATCH' };
  return { ok: true };
}

// Mirrors the trigger's validation for an EXISTING meeting entry being
// patched (matched by id) — chairUserId, once recorded, is immutable. A
// hearing with no chairUserId at all (legacy data) imposes no new
// requirement on an unrelated patch to that same entry.
function validateExistingMeetingEntryPatch(oldEntry, newEntry) {
  if (oldEntry.chairUserId != null && oldEntry.chairUserId !== newEntry.chairUserId) {
    return { ok: false, error: 'APPEAL_HEARING_CHAIR_IMMUTABLE' };
  }
  return { ok: true };
}

// Mirrors the whole trigger: for every entry in the NEW meetings array,
// find its counterpart by id in the OLD array and dispatch accordingly.
function validateMeetingsUpdate(oldMeetings, newMeetings, ctx) {
  for (const entry of newMeetings) {
    const oldEntry = oldMeetings.find(m => m.id === entry.id);
    const result = oldEntry ? validateExistingMeetingEntryPatch(oldEntry, entry) : validateNewMeetingEntry(entry, ctx);
    if (!result.ok) return result;
  }
  return { ok: true };
}

const OFFICER_A = '11111111-1111-1111-1111-111111111111';
const OFFICER_B = '22222222-2222-2222-2222-222222222222';
const FABRICATED = '99999999-9999-9999-9999-999999999999';

describe('classifyMeetingEntry — hearing vs. letter-shaped record', () => {
  it('a real hearing (record text, no letterType) requires a chair', () => {
    expect(classifyMeetingEntry({ type: 'Disciplinary Appeal', record: 'hearing notes', transcript: [] }).requiresChair).toBe(true);
  });

  it('a Grievance Appeal hearing requires a chair too — not disciplinary-appeal-specific', () => {
    expect(classifyMeetingEntry({ type: 'Grievance Appeal', record: 'hearing notes' }).requiresChair).toBe(true);
  });

  it('an invitation letter draft (letterType invite, no record/transcript) does NOT require a chair', () => {
    expect(classifyMeetingEntry({ type: 'Disciplinary Appeal', letterType: 'invite', record: '', transcript: [] }).requiresChair).toBe(false);
  });

  it('an outcome letter draft (letterType appeal, no record/transcript) does NOT require a chair', () => {
    expect(classifyMeetingEntry({ type: 'Disciplinary Appeal', letterType: 'appeal', record: '', transcript: [] }).requiresChair).toBe(false);
  });

  it('a hearing that ALSO has a letter attached (real record content present) still requires a chair — under-enforcing is unsafe', () => {
    expect(classifyMeetingEntry({ type: 'Disciplinary Appeal', letterType: 'appeal', record: 'hearing notes plus outcome letter drafted same session', transcript: [] }).requiresChair).toBe(true);
  });

  it('a non-appeal meeting (Disciplinary, Investigation, Grievance) never requires a chair', () => {
    expect(classifyMeetingEntry({ type: 'Disciplinary', record: 'notes' }).requiresChair).toBe(false);
    expect(classifyMeetingEntry({ type: 'Investigation', record: 'notes' }).requiresChair).toBe(false);
    expect(classifyMeetingEntry({ type: 'Grievance', record: 'notes' }).requiresChair).toBe(false);
  });
});

describe('validateMeetingsUpdate — new appeal hearing creation', () => {
  it('missing chairUserId on a new appeal hearing: rejected', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes' }], { currentAppealManagerUserId: OFFICER_A });
    expect(result).toEqual({ ok: false, error: 'APPEAL_HEARING_CHAIR_MISSING' });
  });

  it('malformed (non-uuid) chairUserId on a new appeal hearing: rejected', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: 'not-a-uuid' }], { currentAppealManagerUserId: OFFICER_A });
    expect(result).toEqual({ ok: false, error: 'APPEAL_HEARING_CHAIR_MISSING' });
  });

  it('wrong chairUserId (does not match the current appeal_manager): rejected', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: FABRICATED }], { currentAppealManagerUserId: OFFICER_A });
    expect(result).toEqual({ ok: false, error: 'APPEAL_CHAIR_MISMATCH' });
  });

  it('no appeal_manager appointed at all: any chairUserId is rejected — creation must fail, never silently treated as safe', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: OFFICER_A }], { currentAppealManagerUserId: null });
    expect(result.ok).toBe(false);
  });

  it('correct chairUserId matching the current appeal_manager: accepted', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: OFFICER_A }], { currentAppealManagerUserId: OFFICER_A });
    expect(result).toEqual({ ok: true });
  });

  it('a direct/authorised meetings-JSON update (not through the structured UI) is validated identically — the check is on the resulting data, not on how it was produced', () => {
    // Same predicate as the "correct id" test above, framed as a bypass
    // attempt: an ordinary case writer directly setting meetings via a
    // raw update cannot escape this by not going through HomeMeetingScreen.
    const bypassAttempt = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', record: 'bypass notes', chairUserId: FABRICATED }], { currentAppealManagerUserId: OFFICER_A });
    expect(bypassAttempt.ok).toBe(false);
  });

  it('generic Home "Start meeting" -> user manually selects Disciplinary Appeal, no officer appointed: still rejected, closing the case-level design\'s confirmed gap', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', record: 'ad-hoc notes', chairUserId: null }], { currentAppealManagerUserId: null });
    expect(result.ok).toBe(false);
  });

  it('an appeal invitation record never requires chairUserId, even with no appeal_manager appointed', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', letterType: 'invite', record: '', transcript: [] }], { currentAppealManagerUserId: null });
    expect(result).toEqual({ ok: true });
  });

  it('an appeal outcome-letter record never requires chairUserId', () => {
    const result = validateMeetingsUpdate([], [{ id: 'm1', type: 'Disciplinary Appeal', letterType: 'appeal', record: '', transcript: [] }], { currentAppealManagerUserId: null });
    expect(result).toEqual({ ok: true });
  });
});

describe('validateMeetingsUpdate — historical immutability', () => {
  it('an existing appeal hearing\'s chairUserId cannot be changed', () => {
    const old = [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: OFFICER_A }];
    const attempt = [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: OFFICER_B }];
    expect(validateMeetingsUpdate(old, attempt, {})).toEqual({ ok: false, error: 'APPEAL_HEARING_CHAIR_IMMUTABLE' });
  });

  it('an existing appeal hearing\'s chairUserId cannot be removed (set to null)', () => {
    const old = [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: OFFICER_A }];
    const attempt = [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: null }];
    expect(validateMeetingsUpdate(old, attempt, {})).toEqual({ ok: false, error: 'APPEAL_HEARING_CHAIR_IMMUTABLE' });
  });

  it('an unrelated patch to the SAME entry (signature status) that leaves chairUserId identical is allowed', () => {
    const old = [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: OFFICER_A, signStatus: 'pending' }];
    const patched = [{ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', chairUserId: OFFICER_A, signStatus: 'signed' }];
    expect(validateMeetingsUpdate(old, patched, {})).toEqual({ ok: true });
  });

  it('a legacy hearing with no chairUserId at all can still be patched (e.g. reminder timestamp) without newly requiring one — no retroactive requirement', () => {
    const old = [{ id: 'legacy-1', type: 'Disciplinary Appeal', record: 'pre-migration hearing notes' }];
    const patched = [{ id: 'legacy-1', type: 'Disciplinary Appeal', record: 'pre-migration hearing notes', reminderSentAt: '2026-09-18T00:00:00Z' }];
    expect(validateMeetingsUpdate(old, patched, {})).toEqual({ ok: true });
  });

  it('an unrelated update elsewhere on the case (a different, non-appeal meeting patched) never fails solely because a historic appeal hearing on the same case lacks chairUserId', () => {
    const old = [
      { id: 'legacy-1', type: 'Disciplinary Appeal', record: 'pre-migration hearing notes' },
      { id: 'm2', type: 'Investigation', record: 'unrelated notes', signStatus: 'pending' },
    ];
    const patched = [
      { id: 'legacy-1', type: 'Disciplinary Appeal', record: 'pre-migration hearing notes' },
      { id: 'm2', type: 'Investigation', record: 'unrelated notes', signStatus: 'signed' },
    ];
    expect(validateMeetingsUpdate(old, patched, {})).toEqual({ ok: true });
  });
});

describe('validateMeetingsUpdate — officer reassignment and multiple hearings', () => {
  it('hearing 1 chaired by officer A remains attributed to A after A is reassigned away — reassignment never touches an existing entry', () => {
    const old = [{ id: 'hearing-1', type: 'Disciplinary Appeal', record: 'first hearing', chairUserId: OFFICER_A }];
    // Reassignment itself only changes case_access, never cases.meetings —
    // modelled here by simply confirming the SAME array (no meetings
    // change at all) needs no re-validation, and that attempting to
    // "correct" hearing-1's chair to the new officer is rejected.
    const attemptToRewriteHistory = [{ id: 'hearing-1', type: 'Disciplinary Appeal', record: 'first hearing', chairUserId: OFFICER_B }];
    expect(validateMeetingsUpdate(old, attemptToRewriteHistory, {})).toEqual({ ok: false, error: 'APPEAL_HEARING_CHAIR_IMMUTABLE' });
  });

  it('hearing 2, chaired by the newly-appointed officer B, succeeds and coexists with hearing 1\'s unaltered attribution to A', () => {
    const old = [{ id: 'hearing-1', type: 'Disciplinary Appeal', record: 'first hearing', chairUserId: OFFICER_A }];
    const withSecondHearing = [
      { id: 'hearing-1', type: 'Disciplinary Appeal', record: 'first hearing', chairUserId: OFFICER_A },
      { id: 'hearing-2', type: 'Disciplinary Appeal', record: 'reconvened hearing', chairUserId: OFFICER_B },
    ];
    const result = validateMeetingsUpdate(old, withSecondHearing, { currentAppealManagerUserId: OFFICER_B });
    expect(result).toEqual({ ok: true });
    // Both hearings preserve their own, separate, correct attribution —
    // the exact multi-hearing guarantee the case-level design could not
    // provide.
    expect(withSecondHearing[0].chairUserId).toBe(OFFICER_A);
    expect(withSecondHearing[1].chairUserId).toBe(OFFICER_B);
  });

  it('a second hearing cannot be created chaired by the OLD (reassigned-away) officer once a new one is current', () => {
    const old = [{ id: 'hearing-1', type: 'Disciplinary Appeal', record: 'first hearing', chairUserId: OFFICER_A }];
    const attempt = [
      { id: 'hearing-1', type: 'Disciplinary Appeal', record: 'first hearing', chairUserId: OFFICER_A },
      { id: 'hearing-2', type: 'Disciplinary Appeal', record: 'reconvened hearing', chairUserId: OFFICER_A },
    ];
    expect(validateMeetingsUpdate(old, attempt, { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: false, error: 'APPEAL_CHAIR_MISMATCH' });
  });
});

describe('client-side stamping — App.jsx saveMeetingToCaseImpl (chairUserId on the meeting object itself)', () => {
  // Mirrors the actual App.jsx line exactly: chairUserId: caseInfo.appealManagerId || null
  // stamped unconditionally on every constructed meeting object — safe on
  // any non-appeal-hearing meeting since the trigger's own classifier
  // ignores those; the DB is the authoritative gate, not this client line.
  const buildMeetingChairField = (appealManagerId) => ({ chairUserId: appealManagerId || null });

  it('structured appeal-hearing entry stamps the current appeal_manager UUID onto the meeting object', () => {
    expect(buildMeetingChairField(OFFICER_A)).toEqual({ chairUserId: OFFICER_A });
  });

  it('any other entry (appealManagerId never set) stamps null, harmlessly', () => {
    expect(buildMeetingChairField(null)).toEqual({ chairUserId: null });
    expect(buildMeetingChairField(undefined)).toEqual({ chairUserId: null });
  });
});

describe('savedBy remains a separate concept from chairUserId (HR operator vs. appeal officer)', () => {
  it('an HR colleague operating Compass on the officer\'s behalf: savedBy differs from chairUserId, and that is correct — the trigger never inspects savedBy at all', () => {
    const meeting = { savedBy: 'HR Colleague (notetaker)', chairUserId: OFFICER_A };
    const result = validateNewMeetingEntry({ id: 'm1', type: 'Disciplinary Appeal', record: 'notes', ...meeting }, { currentAppealManagerUserId: OFFICER_A });
    expect(result).toEqual({ ok: true });
    expect(meeting.savedBy).not.toBe(meeting.chairUserId);
  });
});

describe('textual manager/display-name handling (known, documented limitation)', () => {
  it('the trigger validates chairUserId only — it does not cross-check the free-text manager field against the officer\'s real name', () => {
    // Documents the limitation named in the invariant review: a meeting's
    // manager (display name) field could in principle diverge from the
    // person chairUserId actually identifies, since nothing here compares
    // the two. Safe display therefore requires reading identity FROM
    // chairUserId (resolved against org_members) wherever attribution
    // matters, not from the free-text manager field. This is a documented
    // limitation, not something this migration attempts to close.
    const entry = { id: 'm1', type: 'Disciplinary Appeal', record: 'notes', manager: 'A Name That Does Not Match The Officer', chairUserId: OFFICER_A };
    const result = validateNewMeetingEntry(entry, { currentAppealManagerUserId: OFFICER_A });
    expect(result).toEqual({ ok: true });
  });
});

describe('hearingDate/hearingTime/hearingLocationOrMethod (Appeal Invitation UAT P1 remediation, §12) are invisible to chair-integrity classification', () => {
  it('an invitation-only entry carrying the three new hearing-logistics fields is still classified as letter-only, still requiring no chairUserId', () => {
    const entry = {
      id: 'm1', type: 'Disciplinary Appeal', letterType: 'invite', record: '', transcript: [],
      hearingDate: '2026-10-01', hearingTime: '10:30', hearingLocationOrMethod: 'Microsoft Teams',
    };
    const { isLetterOnly, requiresChair } = classifyMeetingEntry(entry);
    expect(isLetterOnly).toBe(true);
    expect(requiresChair).toBe(false);
    const result = validateNewMeetingEntry(entry, { currentAppealManagerUserId: null });
    expect(result).toEqual({ ok: true });
  });

  it('a genuine hearing (real record content) still requires a valid, matching chairUserId regardless of these fields being absent', () => {
    const entry = { id: 'm2', type: 'Disciplinary Appeal', record: 'Hearing notes here.', transcript: [] };
    const result = validateNewMeetingEntry(entry, { currentAppealManagerUserId: OFFICER_A });
    expect(result).toEqual({ ok: false, error: 'APPEAL_HEARING_CHAIR_MISSING' });
  });
});
