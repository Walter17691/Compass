import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  RESOLUTION, RESOLUTIONS, RESPONSE_TYPE,
  RESOLVED_DISPUTE_BADGE, resolvedDisputeBadge,
  awaitsEmployerReview, isResolved,
} from '../lib/employeeResponse.js';
import { confirmationSemanticsFor, TONE } from '../lib/confirmationSemantics.js';
import { computeInvestigationQualityGaps } from '../lib/investigationQuality.js';
import { mirrorResolutionOntoMeeting, resolutionMirrorFields } from '../lib/resolutionMirror.js';

// ─────────────────────────────────────────────────────────────────────────
// TRUST-SIG FINALISATION — A REVIEWED DISPUTE MUST STOP LOOKING UNRESOLVED.
//
// ┌─ THE PRODUCTION STATE THIS REPRODUCES ──────────────────────────────────┐
// │ Case 065d5a28, meeting_a9465aa4, 07/10/2026. The employee disputed the   │
// │ Investigation record and signed. The manager reviewed it and recorded      │
// │ "Partially accepted" with a rationale and an addendum. signing_requests   │
// │ was correct:                                                             │
// │                                                                         │
// │   status=signed  response_type=disputed  response_resolution=partially_accepted │
// │                                                                         │
// │ But cases.meetings[].responseResolution stayed NULL, because                │
// │ resolveSignatureResponse never wrote it and the signature-sync poll only   │
// │ refreshed NON-terminal requests — and `signed` is terminal. So every       │
// │ client-side consumer read a RESOLVED dispute as an UNRESOLVED one:         │
// │                                                                         │
// │   row badge   "Signed — notes disputed"                     (stale)       │
// │   quality gap "…that response has not been reviewed."       (FALSE)       │
// │                                                                         │
// │ Both indefinitely, and the second actively misleads a manager at the      │
// │ moment they conclude an investigation.                                   │
// └─────────────────────────────────────────────────────────────────────────┘
//
// The fixtures below are the REAL persisted shapes, read from production.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The 07/10 meeting mirror, exactly as cases.meetings held it. */
const disputedMeeting = (over = {}) => ({
  id: 'meeting_a9465aa4-ac02-4087-9215-a40c1644f182',
  date: '2026-10-07', type: 'Investigation',
  status: 'completed', signStatus: 'signed',
  signId: '34efb422-b8fc-4414-addd-2a98402c0f5e',
  responseType: RESPONSE_TYPE.DISPUTED,
  participantComment: 'Responsibility for the stock count was not established.',
  proposedCorrection: 'It should record that responsibility was not established.',
  responseResolution: null,
  record: '# Meeting record\n\nORIGINAL ISSUED TEXT',
  ...over,
});

const resolvedMeeting = (resolution = RESOLUTION.PARTIALLY_ACCEPTED) => disputedMeeting({
  responseResolution: resolution,
  responseResolutionReason: 'Sam is correct on responsibility; the rest of the record stands.',
  responseAddendum: 'It is recorded that responsibility was not established during this meeting.',
  responseResolvedAt: '2026-10-07T09:01:33.408Z',
});

const caseWith = (...meetings) => ({ id: '065d5a28', meetings });

// ═══════════════════════════════════════════════════════════════════════════
describe('A. disputed with no resolution — unchanged', () => {
  it('requires manager action and reads as an attention state', () => {
    const m = disputedMeeting();
    expect(awaitsEmployerReview(m)).toBe(true);
    expect(isResolved(m)).toBe(false);
    const sem = confirmationSemanticsFor(m.signStatus, m);
    expect(sem.badgeLabel).toBe('Signed — notes disputed');
    expect(sem.managerActionRequired).toBe(true);
    expect(sem.responseAwaitsReview).toBe(true);
    expect(sem.tone).toBe(TONE.ATTENTION);
  });

  it('still raises the unresolved-dispute quality gap', () => {
    const gaps = computeInvestigationQualityGaps(caseWith(disputedMeeting()), [], []);
    expect(gaps.join(' ')).toMatch(/inaccurate or incomplete/);
    expect(gaps.join(' ')).toMatch(/has not been reviewed/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. disputed and partially accepted — the production scenario', () => {
  const m = resolvedMeeting(RESOLUTION.PARTIALLY_ACCEPTED);

  it('no longer requires manager action', () => {
    expect(isResolved(m)).toBe(true);
    expect(awaitsEmployerReview(m)).toBe(false);
    const sem = confirmationSemanticsFor(m.signStatus, m);
    expect(sem.managerActionRequired).toBe(false);
    expect(sem.responseAwaitsReview).toBe(false);
  });

  it('reads "Disputed — partially accepted" and no longer says "notes disputed"', () => {
    const sem = confirmationSemanticsFor(m.signStatus, m);
    expect(sem.badgeLabel).toBe('Disputed — partially accepted');
    expect(sem.badgeLabel).not.toMatch(/notes disputed/);
  });

  it('uses a completed tone, not an attention tone implying outstanding work', () => {
    const sem = confirmationSemanticsFor(m.signStatus, m);
    expect(sem.tone).toBe(TONE.DONE);
    expect(sem.tone).not.toBe(TONE.ATTENTION);
  });

  it('THE FALSE WARNING IS GONE — the exact sentence production produced', () => {
    const gaps = computeInvestigationQualityGaps(caseWith(m), [], []);
    expect(gaps.join(' ')).not.toMatch(/the employee says it is inaccurate or incomplete, and that response has not been reviewed/);
    expect(gaps.join(' ')).not.toMatch(/has not been reviewed/);
    // And specifically: this meeting contributes NO gap at all now.
    expect(gaps.filter(g => g.includes('2026-10-07'))).toEqual([]);
  });

  it('still carries the dispute as a historical fact — it is not erased', () => {
    const sem = confirmationSemanticsFor(m.signStatus, m);
    // The word "Disputed" survives review. A manager scanning the Meetings tab
    // must still be able to see this record was challenged.
    expect(sem.badgeLabel).toMatch(/^Disputed/);
    expect(sem.participantResponded).toBe(true);
    expect(sem.impliesAgreement).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. every other canonical resolved value', () => {
  it('maps each stored token to its own badge, with no action required', () => {
    const expected = {
      correction_accepted: 'Disputed — correction accepted',
      partially_accepted: 'Disputed — partially accepted',
      original_retained: 'Disputed — original record retained',
      addendum_added: 'Disputed — clarification added',
    };
    // The canonical tokens, asserted against the stored vocabulary itself.
    expect(RESOLUTIONS).toEqual(Object.keys(expected));
    for (const [token, badge] of Object.entries(expected)) {
      const m = resolvedMeeting(token);
      const sem = confirmationSemanticsFor(m.signStatus, m);
      expect(sem.badgeLabel).toBe(badge);
      expect(sem.tone).toBe(TONE.DONE);
      expect(sem.managerActionRequired).toBe(false);
      expect(computeInvestigationQualityGaps(caseWith(m), [], [])).toEqual([]);
    }
  });

  it('every resolution has a badge, so a fifth cannot ship without one', () => {
    for (const r of RESOLUTIONS) expect(RESOLVED_DISPUTE_BADGE[r]).toBeTruthy();
    expect(Object.keys(RESOLVED_DISPUTE_BADGE).sort()).toEqual([...RESOLUTIONS].sort());
  });

  it('an unrecognised stored token falls back rather than inventing a label', () => {
    expect(resolvedDisputeBadge({ responseResolution: 'something_new' })).toBe(null);
    const m = disputedMeeting({ responseResolution: 'something_new' });
    // isResolved is false for an unknown token, so this is the unresolved path.
    expect(confirmationSemanticsFor(m.signStatus, m).badgeLabel).toBe('Signed — notes disputed');
  });

  it('reads snake_case and camelCase alike — row or mirror', () => {
    expect(resolvedDisputeBadge({ response_resolution: 'partially_accepted' })).toBe('Disputed — partially accepted');
    expect(resolvedDisputeBadge({ responseResolution: 'partially_accepted' })).toBe('Disputed — partially accepted');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. the resolution survives persistence and reload', () => {
  const app = stripComments(read('src/App.jsx'));

  // The server's reply, exactly as api/signing.js returns it.
  const SERVER_REPLY = Object.freeze({
    response_resolution: 'partially_accepted',
    response_resolution_reason: 'Sam is correct on responsibility; the rest of the record stands.',
    response_addendum: 'It is recorded that responsibility was not established during this meeting.',
    response_resolved_at: '2026-10-07T09:01:33.408Z',
  });

  const liveCases = () => ([
    { id: 'other-case', meetings: [{ id: 'other-meeting', record: 'untouched' }] },
    caseWith(disputedMeeting(), { id: 'sibling', record: 'sibling record', signStatus: 'signed' }),
  ]);

  it('EXECUTED: projects the resolution onto the right meeting and heals the badge', () => {
    const before = liveCases();
    const after = mirrorResolutionOntoMeeting(before, {
      caseId: '065d5a28', meetingId: disputedMeeting().id, request: SERVER_REPLY,
    });
    const m = after[1].meetings.find(x => x.id === disputedMeeting().id);
    expect(m.responseResolution).toBe('partially_accepted');
    expect(m.responseResolutionReason).toBe(SERVER_REPLY.response_resolution_reason);
    expect(m.responseAddendum).toBe(SERVER_REPLY.response_addendum);
    expect(m.responseResolvedAt).toBe(SERVER_REPLY.response_resolved_at);
    // And the whole point: the derived manager-facing state is now correct.
    expect(confirmationSemanticsFor(m.signStatus, m).badgeLabel).toBe('Disputed — partially accepted');
    expect(awaitsEmployerReview(m)).toBe(false);
    expect(computeInvestigationQualityGaps(after[1], [], [])).toEqual([]);
  });

  it('EXECUTED: mutates nothing — the input array and every immutable field survive', () => {
    const before = liveCases();
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = mirrorResolutionOntoMeeting(before, {
      caseId: '065d5a28', meetingId: disputedMeeting().id, request: SERVER_REPLY,
    });
    expect(before).toEqual(snapshot);           // no in-place mutation
    expect(after).not.toBe(before);
    const m = after[1].meetings.find(x => x.id === disputedMeeting().id);
    const orig = disputedMeeting();
    expect(m.record).toBe(orig.record);
    expect(m.participantComment).toBe(orig.participantComment);
    expect(m.proposedCorrection).toBe(orig.proposedCorrection);
    expect(m.responseType).toBe(orig.responseType);
    expect(m.signStatus).toBe(orig.signStatus);
    expect(m.signId).toBe(orig.signId);
  });

  it('EXECUTED: leaves other cases and sibling meetings by REFERENCE, so saveCases skips them', () => {
    const before = liveCases();
    const after = mirrorResolutionOntoMeeting(before, {
      caseId: '065d5a28', meetingId: disputedMeeting().id, request: SERVER_REPLY,
    });
    expect(after[0]).toBe(before[0]);                                   // untouched case
    expect(after[1].meetings[1]).toBe(before[1].meetings[1]);           // untouched sibling meeting
  });

  it('EXECUTED: never mirrors the internal resolver id, even when the server sends one', () => {
    const after = mirrorResolutionOntoMeeting(liveCases(), {
      caseId: '065d5a28', meetingId: disputedMeeting().id,
      request: { ...SERVER_REPLY, response_resolved_by: 'auth-user-uuid-should-not-travel' },
    });
    expect(JSON.stringify(after)).not.toContain('auth-user-uuid-should-not-travel');
    const m = after[1].meetings.find(x => x.id === disputedMeeting().id);
    expect(m.responseResolvedBy).toBeUndefined();
  });

  it('EXECUTED: a reply with no resolution cannot blank an existing mirror', () => {
    const resolved = [caseWith(resolvedMeeting(RESOLUTION.PARTIALLY_ACCEPTED))];
    for (const request of [null, undefined, {}, { response_resolution: null }]) {
      const after = mirrorResolutionOntoMeeting(resolved, { caseId: '065d5a28', meetingId: disputedMeeting().id, request });
      expect(after).toBe(resolved);   // same reference — caller skips the write
      expect(after[0].meetings[0].responseResolution).toBe('partially_accepted');
    }
  });

  it('EXECUTED: the field set is exactly the four the client projection needs', () => {
    const fields = resolutionMirrorFields({ ...SERVER_REPLY, response_resolved_by: 'uuid', document: 'x' });
    expect(Object.keys(fields).sort()).toEqual([
      'responseAddendum', 'responseResolution', 'responseResolutionReason', 'responseResolvedAt',
    ]);
    expect(resolutionMirrorFields(null)).toBe(null);
  });

  it('EXECUTED: an unknown case or meeting id is a no-op, not a stray write', () => {
    const before = liveCases();
    for (const args of [
      { caseId: 'no-such-case', meetingId: disputedMeeting().id },
      { caseId: '065d5a28', meetingId: 'no-such-meeting' },
      { caseId: null, meetingId: null },
    ]) {
      expect(mirrorResolutionOntoMeeting(before, { ...args, request: SERVER_REPLY })).toBe(before);
    }
  });

  it('the handler uses that transform and the established save path, not a new writer', () => {
    const from = app.indexOf('const resolveSignatureResponse');
    expect(from).toBeGreaterThan(-1);
    const body = app.slice(from, app.indexOf('const sendDocumentForSignature', from));
    expect(body).toMatch(/mirrorResolutionOntoMeeting\(casesRef\.current/);
    expect(body).toMatch(/request: data\.request/);
    expect(body).toMatch(/saveCases\(updated, cs\.id\)/);
    // No second source of truth, and never the local decision object.
    expect(body).not.toMatch(/supabase\.from\(/);
    expect(body).not.toMatch(/responseResolution:\s*resolution\b/);
  });

  it('the signature sync re-reads a signed request whose dispute still looks unresolved', () => {
    // This is what makes an ALREADY-STALE mirror heal itself through a normal
    // app path, instead of needing a one-off production backfill.
    expect(app).toMatch(/!isTerminalStatus\(m\.signStatus\) \|\| awaitsEmployerReview\(m\)/);
  });

  it('a refresh that is not a status transition cannot duplicate audit history', () => {
    // Widening the poll means an already-signed request can now produce a
    // "change". Without this guard it would re-log "notes signed" and
    // "accuracy disputed" every time a resolution arrived.
    const from = app.indexOf('changes.forEach(({ id, status, prevStatus');
    expect(from).toBeGreaterThan(-1);
    const body = app.slice(from, from + 1200);
    expect(body).toMatch(/if \(status === prevStatus\) return;/);
    expect(app).toMatch(/prevStatus: m\.signStatus \|\| null/);
  });

  it('the poll carries the resolution fields onto the meeting', () => {
    for (const field of ['responseResolution', 'responseResolutionReason',
      'responseResolvedAt', 'responseAddendum']) {
      expect(app).toMatch(new RegExp(`${field}: changeMap\\.get\\(m\\.id\\)\\.${field}`));
    }
  });

  it('a reloaded mirror reads exactly as the authoritative row does', () => {
    // Reload = the persisted meeting JSON comes back with these fields set.
    // Both shapes must produce the same manager-facing state.
    const row = {
      status: 'signed', response_type: 'disputed',
      response_resolution: 'partially_accepted',
      response_resolution_reason: 'r', response_addendum: 'a',
      response_resolved_at: '2026-10-07T09:01:33.408Z',
    };
    const mirror = resolvedMeeting(RESOLUTION.PARTIALLY_ACCEPTED);
    const a = confirmationSemanticsFor('signed', row);
    const b = confirmationSemanticsFor('signed', mirror);
    expect(a.badgeLabel).toBe(b.badgeLabel);
    expect(a.tone).toBe(b.tone);
    expect(a.managerActionRequired).toBe(b.managerActionRequired);
    expect(a.badgeLabel).toBe('Disputed — partially accepted');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. the original signed artefacts are untouched', () => {
  it('nothing in this patch can write document, comment, correction or signature', () => {
    const app = stripComments(read('src/App.jsx'));
    const from = app.indexOf('const mirrored = data.request');
    const body = app.slice(from, app.indexOf('showToast("Conclusion recorded', from));
    expect(body).not.toMatch(/\brecord\s*:/);
    expect(body).not.toMatch(/participant_comment|proposed_correction|\bdocument\b/);
  });

  it('the resolution patch the server builds still excludes every immutable field', () => {
    // Re-asserted here because this patch is the one that made the resolution
    // travel further; the write itself must not have grown.
    const lib = stripComments(read('src/lib/employeeResponse.js'));
    const from = lib.indexOf('export function resolutionPatch');
    const body = lib.slice(from, lib.indexOf('}', lib.indexOf('return {', from)));
    for (const immutable of ['document', 'participant_comment', 'proposed_correction',
      'signature', 'signed_at', 'status', 'response_type']) {
      expect(body).not.toContain(immutable);
    }
  });

  it('a resolved dispute never reads as agreement', () => {
    for (const r of RESOLUTIONS) {
      const sem = confirmationSemanticsFor('signed', resolvedMeeting(r));
      expect(sem.impliesAgreement).toBe(false);
      expect(`${sem.heading} ${sem.stateLine} ${sem.badgeLabel}`.toLowerCase()).not.toMatch(/agreed|accepts the record|reject/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('nothing else moved', () => {
  it('a plain comment is still not a dispute and still needs no review', () => {
    const m = disputedMeeting({ responseType: RESPONSE_TYPE.COMMENT, proposedCorrection: null, responseResolution: null });
    const sem = confirmationSemanticsFor('signed', m);
    expect(sem.badgeLabel).toBe('Signed with comments');
    expect(sem.managerActionRequired).toBe(false);
    expect(computeInvestigationQualityGaps(caseWith(m), [], [])).toEqual([]);
  });

  it('a historical unclassified comment is still untouched', () => {
    const m = disputedMeeting({ responseType: undefined, proposedCorrection: null,
      participantComment: 'This is completely wrong and I disagree with all of it.' });
    expect(confirmationSemanticsFor('signed', m).badgeLabel).toBe('Signed with comments');
    expect(computeInvestigationQualityGaps(caseWith(m), [], [])).toEqual([]);
  });

  it('an explicit "accurate" is still an ordinary signature', () => {
    const m = disputedMeeting({ responseType: RESPONSE_TYPE.ACCURATE, participantComment: null, proposedCorrection: null });
    expect(confirmationSemanticsFor('signed', m).badgeLabel).toBe('Signed');
  });

  it('readiness logic and report generation were not touched by this patch', () => {
    const app = stripComments(read('src/App.jsx'));
    const tab = stripComments(read('src/components/caseTabs/MeetingsTab.jsx'));
    // The readiness predicate and the report input builder are unchanged.
    expect(tab).toContain('invMeetings.some(m=>m.record)');
    expect(app).toContain('"Investigation meeting "+(i+1)+" — "+m.date+nl+m.record');
  });
});
