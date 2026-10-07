import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useEffect, useMemo, useState } from 'react';
import fs from 'fs';
import path from 'path';
import { syncCandidates, signatureSyncKey } from '../lib/signatureSync.js';
import { awaitsEmployerReview } from '../lib/employeeResponse.js';
import { confirmationSemanticsFor } from '../lib/confirmationSemantics.js';
import { mirrorResolutionOntoMeeting } from '../lib/resolutionMirror.js';

// ─────────────────────────────────────────────────────────────────────────
// TRUST-SIG-05 — WHY THE "SELF-HEAL ON OPEN" CLAIM FAILED IN PRODUCTION.
//
// ┌─ THE HUMAN UAT THAT DISPROVED IT ───────────────────────────────────────┐
// │ Case 065d5a28, 07/10 Investigation meeting. signing_requests held         │
// │ response_resolution = partially_accepted (09:01:33Z). Walter deployed,    │
// │ opened the case and HARD-REFRESHED. The row still read                    │
// │ "Signed — notes disputed", and cases.updated_at was still 07:52:12Z —     │
// │ i.e. no write to that case had happened at all.                          │
// │                                                                         │
// │ My previous report listed six steps and said step 1 held. It did not.     │
// │ The failure is MOUNT ORDER:                                              │
// │                                                                         │
// │   screen/activeCaseId  useState(() => readNavFromUrl())   SYNCHRONOUS     │
// │   cases                useState([])                       then async      │
// │                                                                         │
// │ On a hard refresh the sync effect runs on the first render, finds no case │
// │ in state, returns at `if (!pending.length) return` — and never runs       │
// │ again, because `cases` is excluded from its deps.                        │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THESE TESTS RUN REACT. The first pair reproduces the broken lifecycle and the
// fixed one against real renders, because the defect IS a dependency-array
// behaviour and no source assertion can observe it.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The real production meeting mirror: signed, disputed, resolution NOT mirrored. */
const staleMeeting = () => ({
  id: 'meeting_a9465aa4-ac02-4087-9215-a40c1644f182',
  date: '2026-10-07', type: 'Investigation',
  status: 'completed', signStatus: 'signed',
  signId: '34efb422-b8fc-4414-addd-2a98402c0f5e',
  responseType: 'disputed',
  participantComment: 'Responsibility for the stock count was not established.',
  proposedCorrection: 'It should record that responsibility was not established.',
  responseResolution: null,
  record: '# Meeting record\n\nORIGINAL ISSUED TEXT',
});

const CASE_ID = '065d5a28-54a0-47f0-99a3-3ecb13f180bf';
const loadedCases = () => ([
  { id: 'unrelated', meetings: [{ id: 'other', record: 'untouched' }] },
  { id: CASE_ID, updatedAt: '2026-10-07T07:52:12.299Z',
    meetings: [staleMeeting(), { id: 'sibling', record: 'sibling record', signStatus: 'signed' }] },
]);

/**
 * A harness with App's real lifecycle shape: navigation state present on the
 * FIRST render, cases arriving later. `deps` selects which dependency array the
 * sync effect uses, so the old and new behaviour are compared under one render.
 */
function SyncHarness({ onSync, mode }) {
  // Synchronous, exactly like useState(() => readNavFromUrl()).
  const [screen] = useState('CASE_VIEW');
  const [activeCaseId] = useState(CASE_ID);
  // Async, exactly like useState([]) + loadCasesFromDB().
  const [cases, setCases] = useState([]);

  const meetings = useMemo(
    () => cases.find(c => c.id === activeCaseId)?.meetings,
    [cases, activeCaseId],
  );
  const key = useMemo(() => signatureSyncKey(meetings), [meetings]);

  useEffect(() => {
    // The real app exposes the loader; here the test drives it.
    SyncHarness.load = () => act(() => setCases(loadedCases()));
    SyncHarness.editUnrelated = () => act(() => setCases(prev => prev.map(c =>
      c.id !== activeCaseId ? c : {
        ...c, meetings: c.meetings.map(m => m.id === staleMeeting().id
          ? { ...m, record: m.record + '\n\nmanager typed more' } : m),
      })));
  }, [activeCaseId]);

  useEffect(() => {
    if (screen !== 'CASE_VIEW' || !activeCaseId) return;
    const cs = cases.find(c => c.id === activeCaseId);
    const pending = syncCandidates(cs?.meetings);
    onSync(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, mode === 'fixed' ? [screen, activeCaseId, key] : [screen, activeCaseId]);

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('A–D. does the sync effect reach the stale meeting at all?', () => {
  it('THE BUG: with the old deps, the effect gives up before the case exists and never retries', async () => {
    const onSync = vi.fn();
    render(<SyncHarness onSync={onSync} mode="old" />);
    // First render: navigation state is set, cases are not.
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onSync.mock.calls[0][0]).toEqual([]);     // nothing to sync — no case yet

    SyncHarness.load();                              // cases arrive
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
    // Still ONE call. The effect never saw the meeting, so steps E-K never happened.
    const everSawMeeting = onSync.mock.calls.some(([p]) => p.length > 0);
    expect(everSawMeeting).toBe(false);
  });

  it('THE FIX: keyed on the facts it syncs, the effect re-runs the moment cases arrive', async () => {
    const onSync = vi.fn();
    render(<SyncHarness onSync={onSync} mode="fixed" />);
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onSync.mock.calls[0][0]).toEqual([]);

    SyncHarness.load();
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(2));
    const pending = onSync.mock.calls[1][0];
    expect(pending).toHaveLength(1);
    // B and C — the exact values the predicate receives.
    expect(pending[0].signId).toBe('34efb422-b8fc-4414-addd-2a98402c0f5e');
    expect(pending[0].signStatus).toBe('signed');
    expect(pending[0].responseType).toBe('disputed');
    expect(pending[0].responseResolution).toBe(null);
    expect(awaitsEmployerReview(pending[0])).toBe(true);
  });

  it('the fix does NOT reintroduce refiring on an unrelated case edit', async () => {
    const onSync = vi.fn();
    render(<SyncHarness onSync={onSync} mode="fixed" />);
    SyncHarness.load();
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(2));

    // Editing the meeting record is exactly what `cases` was removed from the
    // deps to avoid refiring on. The key is unchanged, so the effect must not run.
    SyncHarness.editUnrelated();
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(2));
    expect(onSync).toHaveBeenCalledTimes(2);
  });

  it('terminates: once repaired, the meeting leaves the candidate set and the effect settles', () => {
    const stale = [staleMeeting()];
    const keyBefore = signatureSyncKey(stale);
    expect(keyBefore).not.toBe('');
    expect(syncCandidates(stale)).toHaveLength(1);

    const repaired = [{ ...staleMeeting(), responseResolution: 'partially_accepted' }];
    const keyAfter = signatureSyncKey(repaired);
    expect(keyAfter).not.toBe(keyBefore);          // one more run
    expect(syncCandidates(repaired)).toHaveLength(0);  // which finds nothing to do
    // And that run produces the same key, so there is no third.
    expect(signatureSyncKey(repaired)).toBe(keyAfter);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the key encodes the right facts and nothing else', () => {
  it('is empty while no case is in state — which is what made the effect give up', () => {
    expect(signatureSyncKey(undefined)).toBe('');
    expect(signatureSyncKey(null)).toBe('');
    expect(signatureSyncKey([])).toBe('');
  });

  it('changes when a resolution appears', () => {
    const a = signatureSyncKey([staleMeeting()]);
    const b = signatureSyncKey([{ ...staleMeeting(), responseResolution: 'partially_accepted' }]);
    expect(a).not.toBe(b);
  });

  it('changes when a participant status moves', () => {
    const a = signatureSyncKey([{ ...staleMeeting(), signStatus: 'sent', responseType: null }]);
    const b = signatureSyncKey([{ ...staleMeeting(), signStatus: 'opened', responseType: null }]);
    expect(a).not.toBe(b);
  });

  it('does NOT change when the manager edits the record or the employee comment is displayed', () => {
    const base = staleMeeting();
    const key = signatureSyncKey([base]);
    expect(signatureSyncKey([{ ...base, record: 'completely rewritten' }])).toBe(key);
    expect(signatureSyncKey([{ ...base, riskScore: { rating: 'HIGH' } }])).toBe(key);
    expect(signatureSyncKey([{ ...base, savedBy: 'someone else' }])).toBe(key);
  });

  it('is order-independent, so a reordered meetings array does not refire the effect', () => {
    const a = { ...staleMeeting(), id: 'm-a' };
    const b = { ...staleMeeting(), id: 'm-b', signId: 'sg-b' };
    expect(signatureSyncKey([a, b])).toBe(signatureSyncKey([b, a]));
  });

  it('ignores meetings with no signId, and settled non-disputed ones', () => {
    expect(signatureSyncKey([{ id: 'x', signStatus: 'sent' }])).toBe('');          // no signId
    expect(signatureSyncKey([{ id: 'y', signId: 's', signStatus: 'signed' }])).toBe(''); // settled, no dispute
    expect(signatureSyncKey([{ id: 'z', signId: 's', signStatus: 'sent' }])).not.toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E–K. the rest of the chain, once the effect actually runs', () => {
  it('H–K: the projection lands on the right meeting and the badge becomes correct', () => {
    const before = loadedCases();
    const pending = syncCandidates(before[1].meetings);
    expect(pending).toHaveLength(1);

    // F — the authoritative reply for that request.
    const serverReply = {
      response_resolution: 'partially_accepted',
      response_resolution_reason: 'Sam is correct on responsibility; the rest of the record stands.',
      response_addendum: 'It is recorded that responsibility was not established during this meeting.',
      response_resolved_at: '2026-10-07T09:01:33.408Z',
    };
    const after = mirrorResolutionOntoMeeting(before, {
      caseId: CASE_ID, meetingId: pending[0].id, request: serverReply,
    });
    const m = after[1].meetings.find(x => x.id === staleMeeting().id);
    expect(m.responseResolution).toBe('partially_accepted');
    expect(confirmationSemanticsFor(m.signStatus, m).badgeLabel).toBe('Disputed — partially accepted');
    expect(confirmationSemanticsFor(m.signStatus, m).managerActionRequired).toBe(false);
    expect(awaitsEmployerReview(m)).toBe(false);
  });

  it('survives a reload — the persisted shape alone produces the resolved state', () => {
    // A reload reads cases.meetings back from the database. No signing fetch, no
    // sync: the stored projection must be sufficient on its own.
    const reloaded = {
      id: staleMeeting().id, signStatus: 'signed', signId: staleMeeting().signId,
      responseType: 'disputed', responseResolution: 'partially_accepted',
      responseResolutionReason: 'r', responseAddendum: 'a',
      responseResolvedAt: '2026-10-07T09:01:33.408Z',
    };
    const sem = confirmationSemanticsFor(reloaded.signStatus, reloaded);
    expect(sem.badgeLabel).toBe('Disputed — partially accepted');
    expect(sem.managerActionRequired).toBe(false);
    expect(signatureSyncKey([reloaded])).toBe('');   // and nothing left to sync
  });

  it('immutable artefacts and sibling meetings survive the repair', () => {
    const before = loadedCases();
    const snapshot = JSON.parse(JSON.stringify(before));
    const after = mirrorResolutionOntoMeeting(before, {
      caseId: CASE_ID, meetingId: staleMeeting().id,
      request: { response_resolution: 'partially_accepted', response_resolved_at: 'x' },
    });
    expect(before).toEqual(snapshot);
    const m = after[1].meetings.find(x => x.id === staleMeeting().id);
    expect(m.record).toBe(staleMeeting().record);
    expect(m.participantComment).toBe(staleMeeting().participantComment);
    expect(m.proposedCorrection).toBe(staleMeeting().proposedCorrection);
    expect(after[1].meetings[1]).toBe(before[1].meetings[1]);   // sibling, by reference
    expect(after[0]).toBe(before[0]);                            // unrelated case
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the app is wired to the fixed lifecycle', () => {
  const app = stripComments(read('src/App.jsx'));

  it('the sync effect depends on the key, and still not on `cases` wholesale', () => {
    expect(app).toMatch(/\}, \[screen, activeCaseId, signatureSyncCandidatesKey\]\);/);
    expect(app).not.toMatch(/\}, \[screen, activeCaseId, cases\]\);/);
  });

  it('the effect uses the shared candidate filter rather than a second copy of the rule', () => {
    expect(app).toMatch(/syncCandidates\(cs\?\.meetings\)/);
    // The inline duplicate of the predicate is gone.
    expect(app).not.toMatch(/filter\(m => m\.signId\s*\n?\s*&& \(!isTerminalStatus/);
  });

  it('no second fetch architecture was introduced — the badge still reads the projection', () => {
    const tab = stripComments(read('src/components/caseTabs/MeetingsTab.jsx'));
    // The row badge is derived from the meeting projection, synchronously. It
    // does not fetch, and the signed-copy snapshot loader is still only used by
    // the modal that opens on demand.
    expect(tab).toContain('confirmationSemanticsFor(m.signStatus, m)');
    const row = tab.slice(tab.indexOf('const sem = confirmationSemanticsFor'), tab.indexOf('const sem =') + 2000);
    expect(row).not.toMatch(/await |fetch\(|loadSignedSnapshot\(/);
    // THREE signing reads in the whole app, unchanged by this patch: the
    // on-demand signed-copy snapshot (loadSignedSnapshot), the reminder-time
    // status check, and the sync effect. This patch adds none — it changes WHEN
    // the existing one runs, not how many there are. A per-row fetch would push
    // this number up.
    expect(app.match(/\/api\/signing\?signId=/g) || []).toHaveLength(3);
  });
});
