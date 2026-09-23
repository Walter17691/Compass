import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

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

// Mirrors the trigger's chair check. Applied at exactly two moments: when an
// appeal hearing entry is CREATED, and when an existing one transitions INTO
// status 'in_progress' (Appeal Meeting Lifecycle Security, 2026-09-23). The
// error code differs so the two are distinguishable in the client and in
// support: a stale chair at Start means the hearing must be rescheduled, not
// that the record is wrong.
function validateChairAgainstCurrentOfficer(entry, { currentAppealManagerUserId }, atStart) {
  const chair = entry.chairUserId;
  if (!chair || !isValidUuid(chair)) return { ok: false, error: 'APPEAL_HEARING_CHAIR_MISSING' };
  if (currentAppealManagerUserId == null || chair !== currentAppealManagerUserId) {
    return { ok: false, error: atStart ? 'APPEAL_CHAIR_STALE_AT_START' : 'APPEAL_CHAIR_MISMATCH' };
  }
  return { ok: true };
}

// Mirrors the trigger's validation for a NEWLY CREATED meeting entry
// (no counterpart by id in the prior meetings array). Covers both a
// 'scheduled' hearing and one created directly as 'in_progress' by Start-now,
// since both are new entries.
function validateNewMeetingEntry(entry, ctx) {
  const { requiresChair } = classifyMeetingEntry(entry);
  if (!requiresChair) return { ok: true };
  return validateChairAgainstCurrentOfficer(entry, ctx, false);
}

// Absent, null or whitespace-only status all mean "no declared lifecycle
// state" — every row written before Phase 2.2.
const statusOf = e => {
  const s = typeof e?.status === 'string' ? e.status.trim() : '';
  return s || null;
};

// Mirrors the trigger's validation for an EXISTING meeting entry being
// patched (matched by id).
//
// Two rules, in the trigger's own order:
//
//   1. If this patch is the transition INTO 'in_progress', the chair must
//      STILL be the currently appointed officer. This is the last moment
//      before the hearing becomes a real event.
//   2. chairUserId, once recorded, is immutable — including across that
//      transition, so a stale scheduled hearing can never be quietly
//      re-pointed at the new officer instead of rescheduled. A hearing with
//      no chairUserId at all (legacy data) imposes no new requirement on an
//      unrelated patch.
//
// Deliberately NOT revalidated on in_progress -> review_draft or
// review_draft -> completed: after Start, chairUserId is historical truth,
// and a later officer replacement must never block saving a hearing that
// properly happened.
function validateExistingMeetingEntryPatch(oldEntry, newEntry, ctx = {}) {
  const { requiresChair } = classifyMeetingEntry(newEntry);
  const becomesStarted = statusOf(newEntry) === 'in_progress' && statusOf(oldEntry) !== 'in_progress';
  if (requiresChair && becomesStarted) {
    const result = validateChairAgainstCurrentOfficer(newEntry, ctx, true);
    if (!result.ok) return result;
  }
  if (oldEntry.chairUserId != null && oldEntry.chairUserId !== newEntry.chairUserId) {
    return { ok: false, error: 'APPEAL_HEARING_CHAIR_IMMUTABLE' };
  }
  return { ok: true };
}

// Mirrors the whole trigger: for every entry in the NEW meetings array,
// find its counterpart by id in the OLD array and dispatch accordingly. On
// INSERT the old array is empty, so every entry is new.
function validateMeetingsUpdate(oldMeetings, newMeetings, ctx) {
  for (const entry of newMeetings) {
    const oldEntry = oldMeetings.find(m => m.id === entry.id);
    const result = oldEntry ? validateExistingMeetingEntryPatch(oldEntry, entry, ctx) : validateNewMeetingEntry(entry, ctx);
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

// ── Appeal Meeting Lifecycle Security (2026-09-23) ──────────────────────────
//
// supabase/appeal_hearing_chair_lifecycle_2026-09-23.sql. The 2026-09-18 rule
// validated the chair when a meeting ENTRY WAS CREATED, which was complete
// only while creation and completion were the same event. Once a meeting can
// exist days before it happens, "validated at creation" stops meaning
// "validated when the hearing happened", and a hearing scheduled under
// Officer A could be held and recorded after A was replaced.
//
// The chair is now checked at the two moments the hearing becomes real —
// CREATE and the transition INTO 'in_progress' — and at no other moment.
// After Start, chairUserId is historical truth.

const SCHEDULED = { status: 'scheduled' };
const hearing = (over = {}) => ({ id: 'h1', type: 'Disciplinary Appeal', record: '', transcript: [], ...over });

describe('A-D. creation covers both start paths', () => {
  it('A. scheduled appeal hearing with the current officer as chair is accepted', () => {
    const entry = hearing({ ...SCHEDULED, chairUserId: OFFICER_A });
    expect(validateMeetingsUpdate([], [entry], { currentAppealManagerUserId: OFFICER_A })).toEqual({ ok: true });
  });

  it('B. scheduled appeal hearing with the wrong chair is rejected', () => {
    const entry = hearing({ ...SCHEDULED, chairUserId: FABRICATED });
    expect(validateMeetingsUpdate([], [entry], { currentAppealManagerUserId: OFFICER_A }).error).toBe('APPEAL_CHAIR_MISMATCH');
  });

  it('B2. scheduled appeal hearing with no chair at all is rejected', () => {
    const entry = hearing({ ...SCHEDULED, chairUserId: null });
    expect(validateMeetingsUpdate([], [entry], { currentAppealManagerUserId: OFFICER_A }).error).toBe('APPEAL_HEARING_CHAIR_MISSING');
  });

  it('C. PATH A — a hearing created directly as in_progress (Start now) with the current officer is accepted', () => {
    const entry = hearing({ status: 'in_progress', startedAt: '2026-09-23T10:00:00.000Z', chairUserId: OFFICER_A });
    expect(validateMeetingsUpdate([], [entry], { currentAppealManagerUserId: OFFICER_A })).toEqual({ ok: true });
  });

  it('D. PATH A — created directly as in_progress with the wrong chair is rejected', () => {
    const entry = hearing({ status: 'in_progress', chairUserId: FABRICATED });
    expect(validateMeetingsUpdate([], [entry], { currentAppealManagerUserId: OFFICER_A }).error).toBe('APPEAL_CHAIR_MISMATCH');
  });

  it('D2. created directly as in_progress with no officer appointed at all is rejected', () => {
    const entry = hearing({ status: 'in_progress', chairUserId: OFFICER_A });
    expect(validateMeetingsUpdate([], [entry], { currentAppealManagerUserId: null }).error).toBe('APPEAL_CHAIR_MISMATCH');
  });
});

describe('E-G. PATH B — starting a scheduled hearing', () => {
  const scheduledUnderA = hearing({ ...SCHEDULED, chairUserId: OFFICER_A });

  it('E. scheduled -> in_progress with the same, still-current officer is accepted', () => {
    const started = hearing({ status: 'in_progress', startedAt: 'T', chairUserId: OFFICER_A });
    expect(validateMeetingsUpdate([scheduledUnderA], [started], { currentAppealManagerUserId: OFFICER_A })).toEqual({ ok: true });
  });

  it('F. scheduled under A, officer replaced by B, Start under A is rejected', () => {
    const started = hearing({ status: 'in_progress', startedAt: 'T', chairUserId: OFFICER_A });
    expect(validateMeetingsUpdate([scheduledUnderA], [started], { currentAppealManagerUserId: OFFICER_B }).error)
      .toBe('APPEAL_CHAIR_STALE_AT_START');
  });

  it('G. the stale hearing cannot be quietly re-pointed at B during Start either', () => {
    const started = hearing({ status: 'in_progress', startedAt: 'T', chairUserId: OFFICER_B });
    expect(validateMeetingsUpdate([scheduledUnderA], [started], { currentAppealManagerUserId: OFFICER_B }).error)
      .toBe('APPEAL_HEARING_CHAIR_IMMUTABLE');
  });

  it('G2. so the only lawful route is an explicit reschedule under a new meeting id', () => {
    const rescheduled = hearing({ id: 'h2', ...SCHEDULED, chairUserId: OFFICER_B });
    expect(validateMeetingsUpdate([scheduledUnderA], [scheduledUnderA, rescheduled], { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: true });
  });

  it('G3. the original scheduled row survives untouched as historical scheduling state', () => {
    // Patching anything else on the stale scheduled row is still allowed.
    const annotated = hearing({ ...SCHEDULED, chairUserId: OFFICER_A, agenda: 'superseded' });
    expect(validateMeetingsUpdate([scheduledUnderA], [annotated], { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: true });
  });
});

describe('H-J. after Start the chair is historical truth', () => {
  const startedUnderA = hearing({ status: 'in_progress', startedAt: 'T', chairUserId: OFFICER_A });

  it('H. an ordinary mid-hearing patch after the officer changed is accepted', () => {
    const patched = { ...startedUnderA, transcript: [{ seq: 1 }] };
    expect(validateMeetingsUpdate([startedUnderA], [patched], { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: true });
  });

  it('H2. in_progress -> in_progress is not a Start, so it never revalidates', () => {
    const patched = { ...startedUnderA, transcript: [{ seq: 1 }, { seq: 2 }] };
    expect(statusOf(patched)).toBe('in_progress');
    expect(validateMeetingsUpdate([startedUnderA], [patched], { currentAppealManagerUserId: null })).toEqual({ ok: true });
  });

  it('I. in_progress -> review_draft after the officer became B is accepted', () => {
    const draft = { ...startedUnderA, status: 'review_draft', endedAt: 'T2' };
    expect(validateMeetingsUpdate([startedUnderA], [draft], { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: true });
  });

  it('J. review_draft -> completed after the officer became B is accepted', () => {
    const draft = { ...startedUnderA, status: 'review_draft' };
    const completed = { ...draft, status: 'completed', record: 'Full hearing record.' };
    expect(validateMeetingsUpdate([draft], [completed], { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: true });
  });

  it('J2. completion is never gated on the CURRENT officer, even with none appointed', () => {
    const draft = { ...startedUnderA, status: 'review_draft' };
    const completed = { ...draft, status: 'completed', record: 'Full hearing record.' };
    expect(validateMeetingsUpdate([draft], [completed], { currentAppealManagerUserId: null })).toEqual({ ok: true });
  });
});

describe('K-M. the recorded chair is immutable at every lifecycle state', () => {
  for (const [label, status] of [['scheduled', 'scheduled'], ['in_progress', 'in_progress'], ['review_draft', 'review_draft'], ['completed', 'completed']]) {
    it(`${label} hearing: chair cannot be rewritten`, () => {
      const before = hearing({ status, chairUserId: OFFICER_A });
      const after = hearing({ status, chairUserId: OFFICER_B });
      expect(validateMeetingsUpdate([before], [after], { currentAppealManagerUserId: OFFICER_B }).error).toBe('APPEAL_HEARING_CHAIR_IMMUTABLE');
    });

    it(`${label} hearing: chair cannot be removed`, () => {
      const before = hearing({ status, chairUserId: OFFICER_A });
      const after = hearing({ status, chairUserId: null });
      expect(validateMeetingsUpdate([before], [after], { currentAppealManagerUserId: OFFICER_A }).error).toBe('APPEAL_HEARING_CHAIR_IMMUTABLE');
    });
  }
});

describe('N-O. cancellation', () => {
  const scheduledUnderA = hearing({ ...SCHEDULED, chairUserId: OFFICER_A });

  it('N/O. cancelling a scheduled hearing is accepted and needs no revalidation', () => {
    const cancelled = hearing({ status: 'cancelled', chairUserId: OFFICER_A, cancelledAt: 'T', cancelledReason: 'appeal officer replaced' });
    expect(validateMeetingsUpdate([scheduledUnderA], [cancelled], { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: true });
  });

  it('a cancelled hearing can never be silently started — it still hits the Start check', () => {
    const cancelled = hearing({ status: 'cancelled', chairUserId: OFFICER_A });
    const revived = hearing({ status: 'in_progress', chairUserId: OFFICER_A });
    expect(validateMeetingsUpdate([cancelled], [revived], { currentAppealManagerUserId: OFFICER_B }).error).toBe('APPEAL_CHAIR_STALE_AT_START');
  });
});

describe('P-T. legacy and non-appeal behaviour is unchanged', () => {
  it('P. a legacy appeal hearing with no status is patchable exactly as before', () => {
    const legacy = { id: 'h1', type: 'Disciplinary Appeal', record: 'old notes', chairUserId: OFFICER_A };
    const patched = { ...legacy, signStatus: 'signed' };
    expect(validateMeetingsUpdate([legacy], [patched], { currentAppealManagerUserId: OFFICER_B })).toEqual({ ok: true });
  });

  it('P2. a status-less legacy row never satisfies the Start condition', () => {
    const legacy = { id: 'h1', type: 'Disciplinary Appeal', record: 'old notes', chairUserId: OFFICER_A };
    expect(statusOf(legacy)).toBeNull();
    expect(validateMeetingsUpdate([legacy], [{ ...legacy, record: 'amended' }], { currentAppealManagerUserId: null })).toEqual({ ok: true });
  });

  it('Q. a legacy appeal hearing with NO chair imposes no retroactive requirement', () => {
    const legacy = { id: 'h1', type: 'Disciplinary Appeal', record: 'old notes' };
    expect(validateMeetingsUpdate([legacy], [{ ...legacy, signStatus: 'signed' }], { currentAppealManagerUserId: null })).toEqual({ ok: true });
  });

  it('R. a letter-only appeal artefact is still exempt, at any status', () => {
    for (const status of [undefined, 'scheduled', 'in_progress', 'completed']) {
      const letter = { id: 'l1', type: 'Disciplinary Appeal', letterType: 'invite', record: '', transcript: [], status };
      expect(validateMeetingsUpdate([], [letter], { currentAppealManagerUserId: null })).toEqual({ ok: true });
    }
  });

  it('S. a genuine hearing that ALSO carries letterType is still a hearing, not exempt', () => {
    const entry = hearing({ letterType: 'appeal', record: 'real hearing notes', chairUserId: null, ...SCHEDULED });
    expect(validateMeetingsUpdate([], [entry], { currentAppealManagerUserId: OFFICER_A }).error).toBe('APPEAL_HEARING_CHAIR_MISSING');
  });

  it('T. non-appeal meetings are unaffected at every lifecycle state', () => {
    for (const type of ['Investigation', 'Disciplinary', 'Grievance', 'Return to Work', 'Probation Review']) {
      for (const status of ['scheduled', 'in_progress', 'review_draft', 'completed', 'cancelled']) {
        expect(validateMeetingsUpdate([], [{ id: 'm', type, status, record: '', chairUserId: null }], { currentAppealManagerUserId: null })).toEqual({ ok: true });
        const before = { id: 'm', type, status: 'scheduled', chairUserId: null };
        const after = { id: 'm', type, status, chairUserId: null };
        expect(validateMeetingsUpdate([before], [after], { currentAppealManagerUserId: null })).toEqual({ ok: true });
      }
    }
  });
});

describe('the deployed migration encodes exactly these rules', () => {
  const sql = readFileSync('supabase/appeal_hearing_chair_lifecycle_2026-09-23.sql', 'utf8');
  // The header deliberately names the functions it does NOT touch, so
  // prohibitions are asserted against executable SQL only.
  const sqlCode = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

  it('validates on CREATE and on the transition into in_progress only', () => {
    expect(sql).toContain("becomes_started := (not is_new_entry)");
    expect(sql).toContain("and entry_status = 'in_progress'");
    expect(sql).toContain("and old_status is distinct from 'in_progress';");
    expect(sql).toContain('if requires_chair and (is_new_entry or becomes_started) then');
  });

  it('never revalidates completion or review against the current officer', () => {
    expect(sql).not.toMatch(/entry_status\s*=\s*'completed'/);
    expect(sql).not.toMatch(/entry_status\s*=\s*'review_draft'/);
  });

  it('closes the NULL letterType bypass with coalesce', () => {
    // SQL three-valued logic: `NULL in ('invite','appeal')` is NULL, not
    // false. For an entry with no letterType, no record and no transcript —
    // precisely the shape of a SCHEDULED appeal hearing — the deployed
    // 2026-09-18 conjunction evaluated to NULL, requires_chair became
    // `true and not NULL` = NULL, and the guarded block was skipped entirely:
    // no chair required, no chair checked. Confirmed empirically against the
    // deployed function before this migration (a fabricated chair on a
    // scheduled hearing was ACCEPTED).
    expect(sqlCode).toContain("is_letter_only := coalesce(entry_letter_type, '') in ('invite', 'appeal') and entry_record = '' and entry_transcript_len = 0;");
    expect(sqlCode).not.toMatch(/is_letter_only := entry_letter_type in/);
  });

  it('keeps the immutability rule byte-identical', () => {
    expect(sqlCode).toContain("if (old_entry->>'chairUserId') is not null and (old_entry->>'chairUserId') is distinct from entry_chair_text then");
  });

  it('the JS mirror could not have caught it — JS and SQL disagree on the null case', () => {
    // ['invite','appeal'].includes(undefined) === false in JS, so the mirror
    // was accidentally correct while the SQL was not. Pinned so the next
    // person does not trust the mirror for three-valued-logic questions.
    expect(['invite', 'appeal'].includes(undefined)).toBe(false);
    expect(classifyMeetingEntry({ type: 'Disciplinary Appeal', status: 'scheduled', record: '', transcript: [] }).requiresChair).toBe(true);
  });

  it('fires on INSERT as well as UPDATE, closing the case-creation bypass', () => {
    expect(sql).toContain('before insert or update on public.cases');
    expect(sql).toContain("if tg_op = 'UPDATE' and new.meetings is not distinct from old.meetings then");
    expect(sql).toContain("old_meetings := case when tg_op = 'UPDATE' then coalesce(old.meetings, '[]'::jsonb) else '[]'::jsonb end;");
  });

  it('treats absent, null and whitespace status identically', () => {
    expect(sql).toContain("entry_status := nullif(btrim(coalesce(entry->>'status', '')), '');");
    expect(sql).toContain("old_status := nullif(btrim(coalesce(old_entry->>'status', '')), '');");
  });

  it('changes no appointment authority and performs no backfill', () => {
    expect(sqlCode).not.toMatch(/appoint_appeal_manager|revoke_appeal_manager|is_hr_role/);
    expect(sqlCode).not.toMatch(/\b(update|insert into|delete from|alter table)\b\s+public\./i);
    // the only statements are the function replacement and its trigger
    expect(sqlCode).not.toMatch(/create policy|drop policy|grant |revoke |alter role/i);
  });

  it('never revalidates against the current officer outside CREATE and START', () => {
    // exactly one place consults case_access, inside the single guarded block
    expect((sqlCode.match(/from public\.case_access/g) || []).length).toBe(1);
  });

  it('documents its rollback', () => {
    expect(sql).toContain('ROLLBACK');
    expect(sql).toContain('appeal_hearing_chair_integrity_2026-09-18.sql');
  });
});
