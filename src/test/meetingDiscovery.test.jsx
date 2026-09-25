import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import {
  DISCOVERY_GROUP, DISCOVERY_GROUP_LABEL, discoveryGroupFor, displayTypeFor,
  potentialActionFor, toDiscoveryEntry, groupForDiscovery, resolveMeetingRef,
  meetingRouteFor, ACTIVATED_ACTIONS,
} from '../lib/meetingDiscovery.js';
import {
  DISCOVERY_COLUMNS, GATEWAY_FAILURE, fetchDiscoverableMeetings, describeGatewayFailure,
} from '../lib/meetingTableGateway.js';
import { MEETING_HOME, caseForPersistence, assertNoTableResident, TableResidentInCaseError } from '../lib/meetingStore.js';
import { TABLE_HOME } from '../lib/standaloneMeetings.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';
import { MeetingsScreen } from '../screens/MeetingsScreen.jsx';

// Phase 4C.2 — standalone meeting discovery foundation.
//
// Items 1–8 of the required matrix are ACCESS questions, and access lives in
// RLS. They are proven against the real public.meetings table with real JWT
// impersonation (recorded in the 4C.2 report), because a unit test on a
// JavaScript predicate cannot prove anything about a Postgres policy. What IS
// asserted here is the complementary code-level guarantee: that discovery
// contains no client-side access filter which could drift from the policy in
// either direction.

const tableMeeting = (over = {}) => ({
  id: 'meeting_aaa', storageHome: TABLE_HOME, caseId: null, orgId: 'org-a',
  meetingTypeId: 'informal', status: MEETING_STATUS.COMPLETED,
  employeeName: 'Dana Keys', manager: 'Sam Lee', chairUserId: null,
  schedule: null, startedAt: '2026-09-20T09:00:00Z', endedAt: '2026-09-20T10:00:00Z',
  createdAt: '2026-09-19T09:00:00Z', updatedAt: '2026-09-20T10:00:00Z', linkedAt: null,
  ...over,
});

const fakeClient = (result) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve(result),
      }),
    }),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
describe('9–13. the information hierarchy', () => {
  it('9. scheduled classifies as Upcoming', () => {
    expect(discoveryGroupFor({ status: MEETING_STATUS.SCHEDULED })).toBe(DISCOVERY_GROUP.UPCOMING);
    expect(DISCOVERY_GROUP_LABEL[DISCOVERY_GROUP.UPCOMING]).toBe('Upcoming');
  });

  it('10. in_progress classifies as Needs your attention', () => {
    expect(discoveryGroupFor({ status: MEETING_STATUS.IN_PROGRESS })).toBe(DISCOVERY_GROUP.ATTENTION);
    expect(DISCOVERY_GROUP_LABEL[DISCOVERY_GROUP.ATTENTION]).toBe('Needs your attention');
  });

  it('11. review_draft classifies as Needs your attention', () => {
    expect(discoveryGroupFor({ status: MEETING_STATUS.REVIEW_DRAFT })).toBe(DISCOVERY_GROUP.ATTENTION);
  });

  it('12. completed classifies as Recent', () => {
    expect(discoveryGroupFor({ status: MEETING_STATUS.COMPLETED })).toBe(DISCOVERY_GROUP.RECENT);
  });

  it('13. cancelled is its own group and never reads as active or upcoming', () => {
    expect(discoveryGroupFor({ status: MEETING_STATUS.CANCELLED })).toBe(DISCOVERY_GROUP.CANCELLED);
    const grouped = groupForDiscovery([tableMeeting({ id: 'm_c', status: MEETING_STATUS.CANCELLED })]);
    expect(grouped[DISCOVERY_GROUP.UPCOMING]).toEqual([]);
    expect(grouped[DISCOVERY_GROUP.ATTENTION]).toEqual([]);
    expect(grouped[DISCOVERY_GROUP.RECENT]).toEqual([]);
    expect(grouped[DISCOVERY_GROUP.CANCELLED]).toHaveLength(1);
  });

  it('invents no sixth state, and refuses to guess a bucket for a legacy row', () => {
    // 884 embedded production meetings have no declared status. Guessing one into
    // a bucket would silently pull historical records into a surface about the
    // new lifecycle.
    expect(discoveryGroupFor({ record: 'legacy, no status' })).toBeNull();
    expect(discoveryGroupFor({})).toBeNull();
    expect(discoveryGroupFor(null)).toBeNull();
    expect(discoveryGroupFor({ status: 'standalone_draft' })).toBeNull();
    expect(Object.keys(DISCOVERY_GROUP)).toHaveLength(4);
  });

  it('a legacy row is dropped from the grouped output rather than shown unplaced', () => {
    const grouped = groupForDiscovery([{ id: 'legacy_1', record: 'x' }, tableMeeting()]);
    const all = Object.values(grouped).flat();
    expect(all.map(e => e.id)).toEqual(['meeting_aaa']);
  });

  it('orders Upcoming soonest-first and everything else most-recent-first', () => {
    const grouped = groupForDiscovery([
      tableMeeting({ id: 'later',   status: MEETING_STATUS.SCHEDULED, schedule: { date: '2026-10-05', time: '09:00' } }),
      tableMeeting({ id: 'sooner',  status: MEETING_STATUS.SCHEDULED, schedule: { date: '2026-10-01', time: '09:00' } }),
      tableMeeting({ id: 'old',   status: MEETING_STATUS.COMPLETED, endedAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' }),
      tableMeeting({ id: 'newer', status: MEETING_STATUS.COMPLETED, endedAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z' }),
    ]);
    expect(grouped[DISCOVERY_GROUP.UPCOMING].map(e => e.id)).toEqual(['sooner', 'later']);
    expect(grouped[DISCOVERY_GROUP.RECENT].map(e => e.id)).toEqual(['newer', 'old']);
  });

  it('places an undated scheduled meeting last rather than at the epoch', () => {
    const grouped = groupForDiscovery([
      tableMeeting({ id: 'undated', status: MEETING_STATUS.SCHEDULED, schedule: null }),
      tableMeeting({ id: 'dated',   status: MEETING_STATUS.SCHEDULED, schedule: { date: '2026-10-01', time: '09:00' } }),
    ]);
    expect(grouped[DISCOVERY_GROUP.UPCOMING].map(e => e.id)).toEqual(['dated', 'undated']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('17. the read model preserves provenance', () => {
  it('17. every entry carries its authoritative storage home, explicitly', () => {
    const entry = toDiscoveryEntry(tableMeeting());
    expect(entry.storageHome).toBe(MEETING_HOME.TABLE);
    expect(entry.isStandalone).toBe(true);
    expect(entry.caseId).toBeNull();
  });

  it('17. a case-linked table meeting stays table-resident and stops being standalone', () => {
    const entry = toDiscoveryEntry(tableMeeting({ caseId: 'case-1', linkedAt: '2026-09-21T09:00:00Z' }));
    expect(entry.storageHome).toBe(MEETING_HOME.TABLE);
    expect(entry.isStandalone).toBe(false);
    expect(entry.caseId).toBe('case-1');
    expect(entry.linkedAt).toBe('2026-09-21T09:00:00Z');
  });

  it('17. storage home is never inferred from an employee name or a meeting label', () => {
    // An embedded-shaped object with the same employee and a human label must
    // still read as embedded.
    const embedded = { id: '1786221627942', type: 'Informal / 1-1', employeeName: 'Dana Keys', status: MEETING_STATUS.COMPLETED };
    expect(toDiscoveryEntry(embedded).storageHome).toBe(MEETING_HOME.EMBEDDED);
    const code = readFileSync('src/lib/meetingDiscovery.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/employeeName\s*===/);
    expect(code).not.toContain('toLowerCase');
  });

  it('carries every field the discovery contract requires', () => {
    const entry = toDiscoveryEntry(tableMeeting({
      status: MEETING_STATUS.SCHEDULED, schedule: { date: '2026-10-01', time: '14:30', method: 'Microsoft Teams' },
    }));
    ['id', 'storageHome', 'isStandalone', 'caseId', 'meetingTypeId', 'displayType',
      'employeeName', 'manager', 'chairUserId', 'status', 'group',
      'scheduledDate', 'scheduledTime', 'scheduledMethod',
      'startedAt', 'endedAt', 'createdAt', 'updatedAt', 'primaryAction',
    ].forEach(k => expect(entry, k).toHaveProperty(k));
    expect(entry.scheduledDate).toBe('2026-10-01');
    expect(entry.scheduledTime).toBe('14:30');
    expect(entry.scheduledMethod).toBe('Microsoft Teams');
  });

  it('derives the display label from the registry id, never persisting a label', () => {
    expect(displayTypeFor('informal')).toBe('Informal / 1-1');
    expect(displayTypeFor('return')).toBe('Return to Work');
    expect(displayTypeFor('investigation')).toBe('Investigation');
    expect(displayTypeFor(null, 'Informal / 1-1')).toBe('Informal / 1-1');
    expect(displayTypeFor('nope')).toBe('Meeting');
  });

  it('rejects non-objects rather than shaping garbage', () => {
    expect(toDiscoveryEntry(null)).toBeNull();
    expect(toDiscoveryEntry([])).toBeNull();
    expect(toDiscoveryEntry('meeting')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('14–16. the reopen contract', () => {
  const list = [
    tableMeeting({ id: 'meeting_one', employeeName: 'Dana Keys' }),
    tableMeeting({ id: 'meeting_two', employeeName: 'Dana Keys' }),
  ];

  it('14. resolves by stable meeting id', () => {
    expect(resolveMeetingRef(list, { id: 'meeting_two' }).id).toBe('meeting_two');
    expect(meetingRouteFor(toDiscoveryEntry(list[1]))).toEqual({
      meetingId: 'meeting_two', storageHome: MEETING_HOME.TABLE,
    });
  });

  it('15. two meetings sharing an employee, type and date resolve distinctly by id', () => {
    // The reason name-based resolution is banned: these are indistinguishable by
    // every human-readable detail.
    expect(list[0].employeeName).toBe(list[1].employeeName);
    expect(resolveMeetingRef(list, { id: 'meeting_one' }).id).toBe('meeting_one');
    expect(resolveMeetingRef(list, { id: 'meeting_two' }).id).toBe('meeting_two');
  });

  it('15. never resolves from a name, a label, a case or a position', () => {
    expect(resolveMeetingRef(list, { id: 'Dana Keys' })).toBeNull();
    expect(resolveMeetingRef(list, { id: 'Informal / 1-1' })).toBeNull();
    expect(resolveMeetingRef(list, { id: '' })).toBeNull();
    expect(resolveMeetingRef(list, { id: null })).toBeNull();
    expect(resolveMeetingRef(list, {})).toBeNull();
  });

  it('14. honours storage provenance when asked, so the two homes cannot be confused', () => {
    const mixed = [
      tableMeeting({ id: 'shared_id' }),
      { id: 'shared_id', status: MEETING_STATUS.COMPLETED, record: 'embedded twin' },
    ];
    expect(resolveMeetingRef(mixed, { id: 'shared_id', storageHome: MEETING_HOME.TABLE }).storageHome).toBe(TABLE_HOME);
    expect(resolveMeetingRef(mixed, { id: 'shared_id', storageHome: MEETING_HOME.EMBEDDED }).record).toBe('embedded twin');
    // Ambiguous without provenance: refused, not guessed by position.
    expect(resolveMeetingRef(mixed, { id: 'shared_id' })).toBeNull();
  });

  it('16. an inaccessible meeting resolves to exactly the same null as a nonexistent one', () => {
    // RLS has already removed rows the caller may not see, so "hidden" and
    // "absent" are the same input here — and must produce the same output, or a
    // failed lookup becomes a probe for another tenant's data.
    const hidden = resolveMeetingRef(list, { id: 'meeting_in_org_b' });
    const absent = resolveMeetingRef(list, { id: 'meeting_never_existed' });
    expect(hidden).toBeNull();
    expect(absent).toBeNull();
    expect(hidden).toEqual(absent);
  });

  it('16. a route is never invented for a case that does not exist', () => {
    expect(meetingRouteFor(toDiscoveryEntry(tableMeeting()))).not.toHaveProperty('caseId');
    expect(meetingRouteFor(toDiscoveryEntry(tableMeeting({ caseId: 'case-9' })))).toHaveProperty('caseId', 'case-9');
    expect(meetingRouteFor(null)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('3/8. access is RLS, not presentation', () => {
  const code = readFileSync('src/lib/meetingDiscovery.js', 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  it('the read model contains no creator, chair, HR or org access filter', () => {
    // If discovery filtered client-side, it could drift from the policy in
    // either direction: hiding rows the database would serve, or (worse, once
    // someone "fixes" that) becoming the thing people trust instead of RLS.
    ['createdBy ===', 'created_by ===', 'auth.uid', 'is_hr', 'isHR',
      'canAccess', 'my_org_ids', 'org_id ===', 'orgId ===',
    ].forEach(f => expect(code, f).not.toContain(f));
  });

  it('8. participants are never consulted anywhere in discovery', () => {
    // Being named in a meeting is a fact about the meeting, not a permission.
    const gateway = readFileSync('src/lib/meetingTableGateway.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('participants');
    // The gateway does not even fetch the column.
    expect(DISCOVERY_COLUMNS).not.toContain('participants');
    expect(gateway).not.toMatch(/participants.*auth|auth.*participants/);
  });

  it('discovery fetches metadata only — no transcript, record, summary, risk or draft', () => {
    ['transcript', 'record', 'summary', 'risk', 'review_draft', 'advisor_notes']
      .forEach(col => expect(DISCOVERY_COLUMNS, col).not.toContain(col));
    // The columns it does need.
    ['id', 'org_id', 'case_id', 'meeting_type_id', 'status', 'employee_name', 'schedule']
      .forEach(col => expect(DISCOVERY_COLUMNS, col).toContain(col));
  });

  it('the org filter is scope, not security, and is documented as such', () => {
    const gateway = readFileSync('src/lib/meetingTableGateway.js', 'utf8');
    expect(gateway).toContain('RLS IS THE ACCESS BOUNDARY');
    expect(gateway).toContain('SCOPE filter, not a');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('18. discovery cannot feed a table meeting into embedded persistence', () => {
  it('18. a discovery entry is a read model and is not a persistable meeting', () => {
    const entry = toDiscoveryEntry(tableMeeting());
    // It carries no content fields at all, so it cannot be mistaken for the
    // meeting object a persistence path would write.
    ['record', 'transcript', 'summary', 'risk', 'reviewDraft', 'advisorNotes']
      .forEach(k => expect(entry, k).not.toHaveProperty(k));
  });

  it('18. the 4C.1 guard still rejects a table meeting placed in cases.meetings', () => {
    const contaminated = { id: 'case-1', meetings: [{ id: 'legacy' }, tableMeeting()] };
    expect(() => assertNoTableResident(contaminated.meetings)).toThrow(TableResidentInCaseError);
    expect(caseForPersistence(contaminated).meetings).toEqual([{ id: 'legacy' }]);
  });

  it('18. no discovery module can write anything', () => {
    ['src/lib/meetingDiscovery.js', 'src/lib/meetingTableGateway.js'].forEach(path => {
      const src = readFileSync(path, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
      ['saveCases', 'saveCaseToDB', 'persistMeeting', 'transitionMeeting',
        '.insert(', '.update(', '.upsert(', '.delete(',
      ].forEach(f => expect(src, `${path}: ${f}`).not.toContain(f));
    });
  });

  it('18. the discovery surface performs no write either', () => {
    const src = readFileSync('src/screens/MeetingsScreen.jsx', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    ['.insert(', '.update(', '.upsert(', '.delete(', 'saveCases', 'persistMeeting', 'transitionMeeting']
      .forEach(f => expect(src, f).not.toContain(f));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the potential-action model (write paths still off)', () => {
  it('names each status its eventual action', () => {
    expect(potentialActionFor({ status: MEETING_STATUS.SCHEDULED }).action).toBe('start');
    expect(potentialActionFor({ status: MEETING_STATUS.IN_PROGRESS }).action).toBe('resume');
    expect(potentialActionFor({ status: MEETING_STATUS.REVIEW_DRAFT }).action).toBe('continue_review');
    expect(potentialActionFor({ status: MEETING_STATUS.COMPLETED }).action).toBe('view_record');
  });

  it('4C.3 — enables exactly Resume and Continue review, and nothing else', () => {
    expect(potentialActionFor({ status: MEETING_STATUS.IN_PROGRESS }).enabled).toBe(true);
    expect(potentialActionFor({ status: MEETING_STATUS.REVIEW_DRAFT }).enabled).toBe(true);
    // Start belongs to 4C.4 (scheduling); there is still no standalone record
    // viewer, so view_record stays off even though it is only a read.
    expect(potentialActionFor({ status: MEETING_STATUS.SCHEDULED }).enabled).toBe(false);
    expect(potentialActionFor({ status: MEETING_STATUS.COMPLETED }).enabled).toBe(false);
    expect(potentialActionFor({ status: MEETING_STATUS.CANCELLED }).enabled).toBe(false);
    expect(ACTIVATED_ACTIONS).toEqual(['resume', 'continue_review']);
  });

  it('activation is an explicit allow-list, so each action turns on when its screen exists', () => {
    expect(potentialActionFor({ status: MEETING_STATUS.SCHEDULED }, { enabledActions: ['start'] }).enabled).toBe(true);
    expect(potentialActionFor({ status: MEETING_STATUS.IN_PROGRESS }, { enabledActions: [] }).enabled).toBe(false);
    expect(potentialActionFor({ status: MEETING_STATUS.COMPLETED }, { enabledActions: ['view_record'] }).enabled).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the gateway', () => {
  it('maps rows to meeting objects carrying their storage home', async () => {
    const result = await fetchDiscoverableMeetings(fakeClient({
      data: [{ id: 'meeting_x', org_id: 'org-a', case_id: null, meeting_type_id: 'informal',
               status: 'completed', employee_name: 'Dana', created_by: 'u1' }],
      error: null,
    }), { orgId: 'org-a' });
    expect(result.ok).toBe(true);
    expect(result.meetings).toHaveLength(1);
    expect(result.meetings[0].storageHome).toBe(TABLE_HOME);
    expect(result.meetings[0].caseId).toBeNull();
  });

  it('distinguishes "no meetings" from "could not check"', async () => {
    const empty = await fetchDiscoverableMeetings(fakeClient({ data: [], error: null }), { orgId: 'org-a' });
    expect(empty).toEqual({ ok: true, meetings: [] });
    const failed = await fetchDiscoverableMeetings(fakeClient({ data: null, error: { message: 'boom' } }), { orgId: 'org-a' });
    expect(failed).toEqual({ ok: false, reason: GATEWAY_FAILURE.QUERY_FAILED });
  });

  it('refuses to query without an org or a client', async () => {
    expect(await fetchDiscoverableMeetings(fakeClient({ data: [], error: null }), {})).toEqual({ ok: false, reason: GATEWAY_FAILURE.NO_ORG });
    expect(await fetchDiscoverableMeetings(null, { orgId: 'org-a' })).toEqual({ ok: false, reason: GATEWAY_FAILURE.NO_CLIENT });
  });

  it('16. never leaks a database error message to the user', () => {
    const message = describeGatewayFailure(GATEWAY_FAILURE.QUERY_FAILED);
    expect(message).toBe("Couldn't load meetings just now. Try again in a moment.");
    // "meetings" is the domain word and belongs in user-facing copy; what must
    // never appear is database internals — a table/column/policy name or the
    // shape of the failure.
    ['org_id', 'policy', 'permission', 'row-level', 'rls', 'relation', 'sql']
      .forEach(leak => expect(message.toLowerCase(), leak).not.toContain(leak));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the discovery surface', () => {
  it('shows a truthful empty state that does not invite creation', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: [], error: null })} />);
    await waitFor(() => expect(screen.getByText('No standalone meetings yet')).toBeTruthy());
    const body = document.body.textContent;
    // Must not imply the feature is available.
    [/create a standalone meeting/i, /new standalone meeting/i, /start a meeting/i, /schedule one/i]
      .forEach(p => expect(body, String(p)).not.toMatch(p));
  });

  it('renders the approved hierarchy, in order, with no invented headings', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: [
      { id: 'm1', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'scheduled', employee_name: 'A', schedule: { date: '2026-10-01', time: '09:00' }, created_by: 'u' },
      { id: 'm2', org_id: 'org-a', case_id: null, meeting_type_id: 'return', status: 'review_draft', employee_name: 'B', created_by: 'u' },
      { id: 'm3', org_id: 'org-a', case_id: null, meeting_type_id: 'investigation', status: 'completed', employee_name: 'C', created_by: 'u' },
    ], error: null })} />);
    await waitFor(() => expect(screen.getByText('Upcoming')).toBeTruthy());
    const body = document.body.textContent;
    expect(body.indexOf('Upcoming')).toBeLessThan(body.indexOf('Needs your attention'));
    expect(body.indexOf('Needs your attention')).toBeLessThan(body.indexOf('Recent'));
    // No dashboard/analytics language.
    [/total/i, /average/i, /this month/i, /trend/i, /top \d/i, /league/i]
      .forEach(p => expect(body, String(p)).not.toMatch(p));
  });

  it('omits a heading that has nothing under it, including Cancelled', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: [
      { id: 'm1', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'completed', employee_name: 'A', created_by: 'u' },
    ], error: null })} />);
    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy());
    expect(screen.queryByText('Cancelled')).toBeNull();
    expect(screen.queryByText('Upcoming')).toBeNull();
  });

  it('13. still retrieves a cancelled meeting, under its own heading', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: [
      { id: 'm1', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'cancelled', employee_name: 'A', created_by: 'u' },
    ], error: null })} />);
    // "Cancelled" appears twice by design — once as the section heading and once
    // as the row's own status — so this asserts both rendered rather than using a
    // single-match query that would throw on the duplicate.
    await waitFor(() => expect(screen.getAllByText('Cancelled')).toHaveLength(2));
    expect(screen.queryByText('Upcoming')).toBeNull();
    expect(screen.queryByText('Needs your attention')).toBeNull();
    expect(screen.queryByText('Recent')).toBeNull();
  });

  it('4C.3 — offers Resume on a live meeting, routed by stable id', async () => {
    const seen = [];
    render(<MeetingsScreen orgId="org-a" onResume={id => seen.push(['resume', id])}
      client={fakeClient({ data: [
        { id: 'm_live', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'in_progress', employee_name: 'A', created_by: 'u' },
      ], error: null })} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy());
    screen.getByRole('button', { name: 'Resume' }).click();
    expect(seen).toEqual([['resume', 'm_live']]);
  });

  it('4C.3 — offers Continue review on a review_draft, routed by stable id', async () => {
    const seen = [];
    render(<MeetingsScreen orgId="org-a" onContinueReview={id => seen.push(['review', id])}
      client={fakeClient({ data: [
        { id: 'm_draft', org_id: 'org-a', case_id: null, meeting_type_id: 'return', status: 'review_draft', employee_name: 'B', created_by: 'u' },
      ], error: null })} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue review' })).toBeTruthy());
    screen.getByRole('button', { name: 'Continue review' }).click();
    expect(seen).toEqual([['review', 'm_draft']]);
  });

  it('still offers NO control for a state whose destination has not shipped', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: [
      { id: 'm_done', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'completed', employee_name: 'A', created_by: 'u' },
      { id: 'm_sched', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'scheduled', employee_name: 'A', created_by: 'u', schedule: { date: '2026-10-01', time: '09:00' } },
    ], error: null })} />);
    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy());
    // No greyed control to guess about, and no button that goes nowhere.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.body.textContent).toMatch(/arrives with the next update/i);
  });

  it('says nothing about future updates when every row on screen has its action', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: [
      { id: 'm_live', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'in_progress', employee_name: 'A', created_by: 'u' },
    ], error: null })} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/arrives with the next update/i);
  });

  it('tells the user plainly when the load failed, without leaking why', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: null, error: { message: 'permission denied for table meetings' } })} />);
    await waitFor(() => expect(screen.getByText(/Couldn't load meetings just now/)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/permission denied/i);
  });

  it('shows provenance on each row', async () => {
    render(<MeetingsScreen orgId="org-a" client={fakeClient({ data: [
      { id: 'm1', org_id: 'org-a', case_id: null, meeting_type_id: 'informal', status: 'completed', employee_name: 'Dana Keys', created_by: 'u' },
    ], error: null })} />);
    await waitFor(() => expect(screen.getByText(/Not linked to a case/)).toBeTruthy());
    expect(document.body.textContent).toContain('Informal / 1-1');
    expect(document.body.textContent).toContain('Dana Keys');
  });

  it('shows no stale frame when the organisation changes', async () => {
    // The loaded result carries the org it was loaded FOR, so a switch reads as
    // loading rather than briefly showing the previous organisation's meetings.
    // This is the behaviour the set-state-in-effect fix was built to preserve, so
    // it gets an assertion rather than a claim.
    const clientFor = orgId => ({
      from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({
        data: [{ id: `m_${orgId}`, org_id: orgId, case_id: null, meeting_type_id: 'informal',
                 status: 'completed', employee_name: `Employee of ${orgId}`, created_by: 'u' }],
        error: null }) }) }) }),
    });
    const { rerender } = render(<MeetingsScreen orgId="org-a" client={clientFor('org-a')} />);
    await waitFor(() => expect(screen.getByText(/Employee of org-a/)).toBeTruthy());
    rerender(<MeetingsScreen orgId="org-b" client={clientFor('org-b')} />);
    // Immediately after the switch, org A's row is gone — not still on screen.
    expect(screen.queryByText(/Employee of org-a/)).toBeNull();
    expect(document.body.textContent).toContain('Loading');
    await waitFor(() => expect(screen.getByText(/Employee of org-b/)).toBeTruthy());
    expect(screen.queryByText(/Employee of org-a/)).toBeNull();
  });

  it('uses Archivo only, adds no serif, and no emoji', () => {
    const src = readFileSync('src/screens/MeetingsScreen.jsx', 'utf8');
    expect(src).not.toMatch(/serif/);
    expect(src).not.toMatch(/font-family:\s*(?!Archivo)/i);
    // Emoji are not part of the product's visual language.
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('navigation and the activation gate', () => {
  it('registers exactly one new destination, inside the existing Work group', () => {
    const sidebar = readFileSync('src/components/AppSidebar.jsx', 'utf8');
    expect(sidebar).toContain('SCREENS.MEETINGS');
    expect(sidebar).toContain('l:"Meetings"');
    // Placed next to Calendar, not given a new group or tier.
    const work = sidebar.slice(sidebar.indexOf('label:"Work"'), sidebar.indexOf('label:"Intelligence"'));
    expect(work).toContain('SCREENS.MEETINGS');
  });

  it('the screen is self-contained, so App.jsx gains no new function callee', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain('const MeetingsScreen = lazy(');
    expect(app).toContain('<MeetingsScreen orgId={org?.id||null}');
    // The guarantee: the screen still loads its OWN rows. No discovery library
    // is called from App.jsx, so the 10,700-line component gains no callee from
    // this surface — only the two action handlers it owns anyway.
    ['fetchDiscoverableMeetings', 'groupForDiscovery', 'toDiscoveryEntry', 'resolveMeetingRef']
      .forEach(f => expect(app, f).not.toContain(f));
  });

  it('4C.2 enables no creation, scheduling, start, prepare or linking path', () => {
    const src = readFileSync('src/screens/MeetingsScreen.jsx', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    ['newId(', 'newStandaloneMeetingRow', 'linkToCaseRow', 'planStandaloneCreate',
      'beginMeeting', 'scheduleMeeting', 'startScheduledMeeting', 'createCase',
    ].forEach(f => expect(src, f).not.toContain(f));
  });

  it('the hard 4C.3 activation gate is still recorded', () => {
    const register = readFileSync('docs/release-1-defect-register.md', 'utf8');
    expect(register).toContain('HARD ACTIVATION GATE');
    expect(register).toMatch(/MUST NOT ENABLE STANDALONE MEETING CREATION UNTIL/i);
    expect(register).toContain('assertNoTableResident');
  });
});
