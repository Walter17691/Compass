import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EMPLOYMENT_EVENT_TYPES, CHANGEABLE_EVENT_TYPES, DOCUMENTATION_STATUSES,
  employmentEventLabel, isEmploymentEventType, asDateOnly, isEffective, isPending,
  resolveEffectiveEmployee, isCurrentEmployee, effectiveLeavingDate, upcomingChanges,
  describeEmploymentEvent, buildEmploymentEventEntries, employmentAttention, mapEmploymentEventRow,
} from '../lib/employmentEvents.js';
import {
  recordEmploymentEvent, markEmployeeAsLeaver, correctEmploymentEvent,
  cancelEmploymentEvent, setDocumentationStatus, describeEventOutcome, EVENT_RESULT,
} from '../lib/employmentEventWrites.js';
import { buildEmployeeFile, deriveCurrentWarnings } from '../lib/employeeFile.js';
import { buildEmployeeRoster } from '../lib/employeeContext.js';
import { compileSubjectData } from '../lib/dsarCompile.js';
import { ORG_SCOPED_TABLES } from '../lib/dataInventory.js';

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.7 — Employment Events, leavers and Archive.
//
// The central rule: current state is RESOLVED from the base record plus the
// events whose effective date has arrived. Nothing is written ahead of time and
// no scheduler applies anything. The database enforces the same rule for RLS
// (effective_employee_location / effective_employment_status), proven directly
// against production — 28 assertions including the London/Manchester transfer
// matrix. These tests cover the read model and the separations.
// ═══════════════════════════════════════════════════════════════════════════

const read = f => readFileSync(f, 'utf8');
const strip = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const MIGRATION = read('supabase/employment_events_2026-09-27.sql');
const migrationCode = MIGRATION.replace(/--[^\n]*/g, '');
const appCode = strip(read('src/App.jsx'));

const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const EMP = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const EMP2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LON = '11111111-1111-1111-1111-111111111111';
const MAN = '22222222-2222-2222-2222-222222222222';
const USER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TODAY = new Date('2026-09-27T12:00:00.000Z');
const employee = (over = {}) => ({
  id: EMP, orgId: ORG, name: 'John Smith', jobTitle: 'Team Member',
  department: 'Operations', manager: 'Alex Manager', workingPattern: 'Full time',
  locationId: LON, employmentStatus: 'active', updatedAt: 'v1', ...over,
});
const ev = (over = {}) => ({
  id: 'ev-1', orgId: ORG, employeeId: EMP, eventType: 'job_title_changed',
  effectiveDate: '2026-11-01', oldText: 'Team Member', newText: 'Team Leader',
  oldLocationId: null, newLocationId: null, documentationStatus: 'not_required',
  cancelledAt: null, createdAt: '2026-09-27T10:00:00.000Z', updatedAt: 'v1', ...over,
});

// ── Event types: only what real fields support ──────────────────────────────
describe('supported event types', () => {
  it('covers exactly the changes backed by a real employee field', () => {
    expect(EMPLOYMENT_EVENT_TYPES.map(t => t.id)).toEqual([
      'job_title_changed', 'department_changed', 'manager_changed',
      'working_pattern_changed', 'location_changed', 'employment_ended',
    ]);
  });

  it('does NOT invent contractual hours — no such column exists', () => {
    expect(isEmploymentEventType('contractual_hours_changed')).toBe(false);
    // Asserted against the CHECK constraint's value list, not the whole file: the
    // migration's COMMENT ON deliberately names it to record WHY it is absent,
    // and a file-wide match would forbid explaining the decision.
    const check = migrationCode.slice(migrationCode.indexOf('employment_events_type_valid'));
    const values = check.slice(0, check.indexOf('),'));
    expect(values).not.toMatch(/contractual_hours/);
    expect(values).not.toMatch(/employment_started/);
    // And no such column exists to change.
    expect(migrationCode).not.toMatch(/contractual_hours\s+(int|numeric|decimal|text)/i);
  });

  it('does NOT invent employment_started — start_date is unusable legacy text', () => {
    expect(isEmploymentEventType('employment_started')).toBe(false);
    expect(migrationCode).not.toMatch(/'employment_started'/);
  });

  it('employment ending is not offered as an ordinary field change', () => {
    expect(CHANGEABLE_EVENT_TYPES.map(t => t.id)).not.toContain('employment_ended');
  });

  it('shows natural labels, never enum names', () => {
    expect(employmentEventLabel('job_title_changed')).toBe('Job title changed');
    expect(employmentEventLabel('location_changed')).toBe('Location changed');
    EMPLOYMENT_EVENT_TYPES.forEach(t => expect(t.label).not.toContain('_'));
  });

  it('documentation status is the smallest useful set', () => {
    expect(DOCUMENTATION_STATUSES.map(d => d.id)).toEqual(['sent', 'not_sent', 'not_required']);
  });
});

// ── Date semantics ─────────────────────────────────────────────────────────
describe('effective-date semantics are calendar dates, not instants', () => {
  it('reduces any input to a plain calendar date', () => {
    expect(asDateOnly('2026-11-01')).toBe('2026-11-01');
    expect(asDateOnly('2026-11-01T23:59:59.000Z')).toBe('2026-11-01');
    expect(asDateOnly(new Date(2026, 10, 1, 23, 30))).toBe('2026-11-01');
    expect(asDateOnly(null)).toBeNull();
  });

  it('a late-evening local time on the 1st is still the 1st, not the 2nd', () => {
    // toISOString() would push a UK evening into the next UTC day in summer.
    expect(asDateOnly(new Date(2026, 10, 1, 23, 45))).toBe('2026-11-01');
  });

  it('is effective ON the effective date, and not the day before', () => {
    const e = ev({ effectiveDate: '2026-11-01' });
    expect(isEffective(e, new Date('2026-10-31T23:59:00.000Z'))).toBe(false);
    expect(isEffective(e, new Date('2026-11-01T00:01:00.000Z'))).toBe(true);
    expect(isEffective(e, new Date('2026-11-02T00:00:00.000Z'))).toBe(true);
  });

  it('pending is the exact complement, and a cancelled event is neither', () => {
    const e = ev({ effectiveDate: '2026-11-01' });
    expect(isPending(e, new Date('2026-10-31'))).toBe(true);
    expect(isPending(e, new Date('2026-11-01'))).toBe(false);
    const cancelled = ev({ cancelledAt: '2026-09-28T00:00:00.000Z' });
    expect(isEffective(cancelled, new Date('2026-12-01'))).toBe(false);
    expect(isPending(cancelled, new Date('2026-10-01'))).toBe(false);
  });
});

// ── Effective state resolution ─────────────────────────────────────────────
describe('current state is resolved, never written ahead of time', () => {
  it('with no events, the base record IS the current state', () => {
    const r = resolveEffectiveEmployee(employee(), [], TODAY);
    expect(r.jobTitle).toBe('Team Member');
    expect(r.locationId).toBe(LON);
  });

  it('a FUTURE promotion does not apply early', () => {
    const r = resolveEffectiveEmployee(employee(), [ev()], TODAY);
    expect(r.jobTitle).toBe('Team Member');
  });

  it('the same promotion applies on its effective date', () => {
    const r = resolveEffectiveEmployee(employee(), [ev()], new Date('2026-11-01T09:00:00.000Z'));
    expect(r.jobTitle).toBe('Team Leader');
  });

  it('a FUTURE transfer does not apply early, and does apply later', () => {
    const transfer = ev({ id: 'ev-2', eventType: 'location_changed', oldText: null, newText: null,
      oldLocationId: LON, newLocationId: MAN, effectiveDate: '2026-11-01' });
    expect(resolveEffectiveEmployee(employee(), [transfer], TODAY).locationId).toBe(LON);
    expect(resolveEffectiveEmployee(employee(), [transfer], new Date('2026-11-01')).locationId).toBe(MAN);
  });

  it('the most recent EFFECTIVE change wins when several have passed', () => {
    const first = ev({ id: 'a', effectiveDate: '2026-01-01', newText: 'Supervisor' });
    const second = ev({ id: 'b', effectiveDate: '2026-06-01', newText: 'Team Leader' });
    expect(resolveEffectiveEmployee(employee(), [second, first], TODAY).jobTitle).toBe('Team Leader');
  });

  it('a cancelled event never contributes', () => {
    const cancelled = ev({ effectiveDate: '2026-01-01', cancelledAt: '2026-02-01T00:00:00.000Z' });
    expect(resolveEffectiveEmployee(employee(), [cancelled], TODAY).jobTitle).toBe('Team Member');
  });

  it('another employee\'s events never apply', () => {
    const theirs = ev({ employeeId: EMP2, effectiveDate: '2026-01-01', newText: 'Director' });
    expect(resolveEffectiveEmployee(employee(), [theirs], TODAY).jobTitle).toBe('Team Member');
  });

  it('resolution does not mutate the record it was given', () => {
    const base = employee();
    resolveEffectiveEmployee(base, [ev({ effectiveDate: '2026-01-01' })], TODAY);
    expect(base.jobTitle).toBe('Team Member');
  });

  it('nothing in the resolver depends on a timer or a scheduler', () => {
    const src = strip(read('src/lib/employmentEvents.js'));
    ['setTimeout', 'setInterval', 'cron', 'requestAnimationFrame'].forEach(bad =>
      expect(src, bad).not.toContain(bad));
  });
});

// ── Leaver and Archive ─────────────────────────────────────────────────────
describe('leavers and Archive are a projection, not a move', () => {
  const leaving = (date) => ev({ id: 'leave', eventType: 'employment_ended', effectiveDate: date,
    oldText: null, newText: null });

  it('a FUTURE leaving date keeps the employee current', () => {
    expect(isCurrentEmployee(employee(), [leaving('2026-12-31')], TODAY)).toBe(true);
    expect(resolveEffectiveEmployee(employee(), [leaving('2026-12-31')], TODAY).employmentStatus).toBe('active');
  });

  it('an EFFECTIVE leaving date makes them former', () => {
    expect(isCurrentEmployee(employee(), [leaving('2026-09-01')], TODAY)).toBe(false);
    expect(resolveEffectiveEmployee(employee(), [leaving('2026-09-01')], TODAY).employmentStatus).toBe('leaver');
  });

  it('on the leaving date itself they are former', () => {
    expect(isCurrentEmployee(employee(), [leaving('2026-09-27')], TODAY)).toBe(false);
  });

  it('People keeps a future leaver; Archive takes them only once effective', () => {
    const base = { cases: [], wellbeingNotes: [], concernReferrals: [], dsarRequests: [], now: TODAY };
    const future = buildEmployeeRoster({ ...base, employeeRecords: [employee()], employmentEvents: [leaving('2026-12-31')] });
    expect(future[0].isCurrent).toBe(true);
    const past = buildEmployeeRoster({ ...base, employeeRecords: [employee()], employmentEvents: [leaving('2026-09-01')] });
    expect(past[0].isCurrent).toBe(false);
    // Same canonical row either way — no second store, no copy.
    expect(future[0].id).toBe(EMP);
    expect(past[0].id).toBe(EMP);
  });

  it('the roster shows EFFECTIVE job title and location, not the raw record', () => {
    const base = { cases: [], wellbeingNotes: [], concernReferrals: [], dsarRequests: [], now: TODAY };
    const pastPromotion = ev({ effectiveDate: '2026-01-01' });
    const futurePromotion = ev({ id: 'future', effectiveDate: '2026-12-01', newText: 'Director' });
    const transfer = ev({ id: 'move', eventType: 'location_changed', oldText: null, newText: null,
      oldLocationId: LON, newLocationId: MAN, effectiveDate: '2026-02-01' });
    const [row] = buildEmployeeRoster({ ...base, employeeRecords: [employee()],
      employmentEvents: [pastPromotion, futurePromotion, transfer] });
    // The effective promotion and transfer are reflected…
    expect(row.jobTitle).toBe('Team Leader');
    expect(row.locationId).toBe(MAN);
    // …and the future one is not.
    expect(row.jobTitle).not.toBe('Director');
  });

  it('the leaving date is reported for both a pending and an effective leaver', () => {
    expect(effectiveLeavingDate(EMP, [leaving('2026-12-31')], TODAY)).toBe('2026-12-31');
    expect(effectiveLeavingDate(EMP, [leaving('2026-09-01')], TODAY)).toBe('2026-09-01');
    expect(effectiveLeavingDate(EMP, [], TODAY)).toBeNull();
  });

  it('a cancelled leaving event restores them to current', () => {
    const cancelled = { ...leaving('2026-09-01'), cancelledAt: '2026-09-02T00:00:00.000Z' };
    expect(isCurrentEmployee(employee(), [cancelled], TODAY)).toBe(true);
  });

  it('the Employee File is retained, with the same UUID and its history', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [],
      employeeActivities: [{ id: 'a1', employeeId: EMP, activityType: 'one_to_one', lifecycleState: 'completed', occurredAt: '2026-03-01T00:00:00.000Z', createdAt: '2026-03-01T00:00:00.000Z' }],
      employeeActivityRecords: [], employmentEvents: [leaving('2026-09-01')], now: TODAY,
    }, { isHR: true });
    expect(file.employee.id).toBe(EMP);
    expect(file.isCurrentEmployee).toBe(false);
    expect(file.leavingDate).toBe('2026-09-01');
    // History intact.
    expect(file.activityEntries.some(e => e.kind === 'activity')).toBe(true);
  });

  it('no archived employee store exists', () => {
    expect(migrationCode).not.toMatch(/archived_employees/);
    expect(ORG_SCOPED_TABLES).not.toContain('archived_employees');
    // And the projection is a filter over the one roster.
    const people = strip(read('src/screens/PeopleScreen.jsx'));
    expect(people).toMatch(/archived \? !p\.isCurrent : p\.isCurrent/);
  });
});

// ── Upcoming changes / Overview ────────────────────────────────────────────
describe('Overview shows what is true now, and what is coming', () => {
  it('employment details use the EFFECTIVE values', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [], employmentEvents: [ev({ effectiveDate: '2026-01-01' })], now: TODAY,
    }, { isHR: true });
    expect(file.effectiveEmployee.jobTitle).toBe('Team Leader');
    expect(JSON.stringify(file.employmentDetails)).toContain('Team Leader');
  });

  it('a future change is listed as upcoming and does NOT change the current value', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [], employmentEvents: [ev()], now: TODAY,
    }, { isHR: true });
    expect(file.effectiveEmployee.jobTitle).toBe('Team Member');
    expect(file.pendingChanges).toHaveLength(1);
    expect(file.pendingChanges[0]).toMatchObject({ label: 'Job title changed', effectiveDate: '2026-11-01', newValue: 'Team Leader' });
  });

  it('upcomingChanges lists only pending ones, soonest first', () => {
    const later = ev({ id: 'later', effectiveDate: '2026-12-01', newText: 'Manager' });
    const sooner = ev({ id: 'sooner', effectiveDate: '2026-10-01', newText: 'Team Leader' });
    const past = ev({ id: 'past', effectiveDate: '2026-01-01' });
    const up = upcomingChanges(EMP, [later, sooner, past], TODAY);
    expect(up.map(u => u.id)).toEqual(['sooner', 'later']);
  });
});

// ── Old → new ──────────────────────────────────────────────────────────────
describe('old and new values are both preserved', () => {
  it('a text change keeps both sides', () => {
    expect(describeEmploymentEvent(ev())).toEqual({ label: 'Job title changed', from: 'Team Member', to: 'Team Leader' });
  });

  it('a location change resolves both sides to names', () => {
    const transfer = ev({ eventType: 'location_changed', oldText: null, newText: null, oldLocationId: LON, newLocationId: MAN });
    const names = { [LON]: 'London', [MAN]: 'Manchester' };
    expect(describeEmploymentEvent(transfer, { locationName: id => names[id] }))
      .toEqual({ label: 'Location changed', from: 'London', to: 'Manchester' });
  });

  it('the database refuses an event that does not carry its own value pair', () => {
    expect(migrationCode).toMatch(/event_type = 'location_changed'\s*\n?\s*and new_location_id is not null/);
    expect(migrationCode).toMatch(/and new_text is not null/);
  });

  it('"Promoted" with no values is not representable — new_text is required', () => {
    const check = migrationCode.slice(migrationCode.indexOf('employment_events_values_match_type'));
    expect(check.slice(0, 700)).toMatch(/new_text is not null/);
  });
});

// ── Activity projection ────────────────────────────────────────────────────
describe('employment events appear in Activity, dated by effective date', () => {
  it('an entry is dated by effective_date, not created_at', () => {
    const [entry] = buildEmploymentEventEntries([ev()], { today: TODAY });
    expect(entry.occurredAt).toBe('2026-11-01');
    expect(entry.recordedAt).toBe('2026-09-27T10:00:00.000Z');
  });

  it('a pending change says it is pending; a cancelled one says it was cancelled', () => {
    const [pending] = buildEmploymentEventEntries([ev()], { today: TODAY });
    expect(pending.pending).toBe(true);
    expect(pending.cancelled).toBe(false);
    const [cancelled] = buildEmploymentEventEntries([ev({ cancelledAt: '2026-09-28T00:00:00.000Z' })], { today: TODAY });
    expect(cancelled.cancelled).toBe(true);
  });

  it('events join the one chronology alongside activities and processes', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [],
      employeeActivities: [{ id: 'a1', employeeId: EMP, activityType: 'one_to_one', lifecycleState: 'completed', occurredAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' }],
      employeeActivityRecords: [], employmentEvents: [ev()], now: TODAY,
    }, { isHR: true });
    const kinds = file.activityEntries.map(e => e.kind);
    expect(kinds).toContain('activity');
    expect(kinds).toContain('employment_event');
    // Newest first.
    const dates = file.activityEntries.map(e => new Date(e.occurredAt || 0).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('employment events stay their own domain — not merged into activities', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [], employeeActivities: [], employeeActivityRecords: [],
      employmentEvents: [ev()], now: TODAY,
    }, { isHR: true });
    expect(file.employmentEvents).toHaveLength(1);
    expect(file.activities).toHaveLength(0);
  });
});

// ── Historical activity location must not be rewritten ─────────────────────
describe('historical activity location is immutable', () => {
  it('a January 1:1 in London stays London after a March move to Manchester', () => {
    const januaryOneToOne = {
      id: 'a1', employeeId: EMP, activityType: 'one_to_one', lifecycleState: 'completed',
      occurredAt: '2026-01-15T09:00:00.000Z', createdAt: '2026-01-15T09:00:00.000Z',
      locationId: LON,
    };
    const march = ev({ id: 'move', eventType: 'location_changed', oldText: null, newText: null,
      oldLocationId: LON, newLocationId: MAN, effectiveDate: '2026-03-01' });
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [],
      employeeActivities: [januaryOneToOne], employeeActivityRecords: [],
      employmentEvents: [march], now: TODAY,
    }, { isHR: true });
    // Current location has moved…
    expect(file.effectiveEmployee.locationId).toBe(MAN);
    // …and the January activity has NOT.
    const entry = file.activityEntries.find(e => e.id === 'a1');
    expect(entry.locationId).toBe(LON);
  });

  it('nothing in the codebase writes employee_activities.location_id after creation', () => {
    expect(appCode).not.toMatch(/update\(\{[^}]*location_id[^}]*\}\)[\s\S]{0,80}employee_activities/);
    const writes = strip(read('src/lib/employeeActivityWrites.js'));
    // Enumerated rather than sliced: mapActivityRow mentions location_id as a
    // READ, and slicing on a brace is unreliable when a signature spans lines.
    // There are exactly two mentions, and each is accounted for.
    const mentions = writes.match(/^.*location_id.*$/gm) || [];
    expect(mentions).toHaveLength(2);
    // The write: set once, at creation.
    expect(mentions.filter(l => /location_id:\s*locationId/.test(l))).toHaveLength(1);
    // The read: mapping a row back out.
    expect(mentions.filter(l => /row\.location_id/.test(l))).toHaveLength(1);
    // And no update payload anywhere mentions it.
    expect(writes).not.toMatch(/patch:\s*\{[^}]*location_id/);

    // No module anywhere may update employee_activities' location. Checked across
    // every write surface, not just the activity module — a transfer recorded in
    // the employment-event module is exactly where this temptation would appear.
    ['src/lib/employeeActivityWrites.js', 'src/lib/employmentEventWrites.js', 'src/App.jsx']
      .forEach(f => {
        const src = strip(read(f));
        expect(src, f).not.toMatch(/from\('employee_activities'\)[\s\S]{0,120}\.update\(/);
        expect(src, f).not.toMatch(/\.update\([^)]{0,120}location_id[^)]{0,120}\)[\s\S]{0,80}employee_activities/);
      });
  });
});

// ── Correction vs change ───────────────────────────────────────────────────
describe('correcting details is not an employment change', () => {
  it('a correction is audited and creates no employment event', () => {
    // The correction audit is a trigger on employee_records; it writes an audit row
    // and nothing else, and deliberately excludes location_id.
    expect(migrationCode).toMatch(/Employee details corrected/);
    const fn = migrationCode.slice(migrationCode.indexOf('function public.log_employee_detail_correction'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/insert into public\.audit_log/);
    expect(body).not.toMatch(/employee_employment_events/);
    expect(body).not.toMatch(/location_id/);
  });

  it('the correction trigger uses array_append, not the || operator', () => {
    // A live bug, found by post-deployment verification rather than the dry run:
    //   v_changed := v_changed || 'work_email'
    // looks like an append, but Postgres resolves the untyped literal against
    // anyarray||anyarray first and tries to parse it as an array literal —
    //   22P02 malformed array literal: "work_email"
    // — so EVERY employee detail edit raised. array_append is unambiguous.
    const fn = migrationCode.slice(migrationCode.indexOf('function public.log_employee_detail_correction'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/array_append\(v_changed, 'work_email'\)/);
    // The ambiguous form must appear nowhere in it.
    expect(body).not.toMatch(/v_changed \|\| '/);
    // All eight tracked fields use the safe form.
    expect((body.match(/array_append\(v_changed, '/g) || []).length).toBe(8);
  });

  it('recording a change never writes the new value into employee_records', () => {
    const writes = strip(read('src/lib/employmentEventWrites.js'));
    expect(writes).not.toMatch(/from\('employee_records'\)/);
    expect(writes).toMatch(/from\('employee_employment_events'\)/);
  });

  it('the two intentions are offered as two differently-named actions', () => {
    const screen = read('src/screens/EmployeeFileScreen.jsx');
    expect(screen).toContain('Correct details');
    expect(screen).toContain('Record employment change');
  });
});

// ── Writes, cancellation, concurrency ──────────────────────────────────────
describe('writes', () => {
  const capture = (out) => ({
    from: () => ({ insert: (row) => { out.row = row; return { select: () => ({ single: async () => ({ data: { id: 'new', ...row }, error: null }) }) }; } }),
  });

  it('records a plain calendar effective_date and no created_at', async () => {
    const out = {};
    const r = await recordEmploymentEvent({
      supabase: capture(out), orgId: ORG, employeeId: EMP, eventType: 'job_title_changed',
      effectiveDate: '2026-11-01', oldText: 'Team Member', newText: 'Team Leader', recordedBy: USER,
    });
    expect(r.result).toBe(EVENT_RESULT.OK);
    expect(out.row.effective_date).toBe('2026-11-01');
    expect(out.row).not.toHaveProperty('created_at');
    expect(out.row.old_text).toBe('Team Member');
    expect(out.row.new_text).toBe('Team Leader');
    expect(out.row.recorded_by).toBe(USER);
  });

  it('marking a leaver records an employment_ended event and nothing else', async () => {
    const out = {};
    await markEmployeeAsLeaver({ supabase: capture(out), orgId: ORG, employeeId: EMP, leavingDate: '2026-12-31', recordedBy: USER });
    expect(out.row.event_type).toBe('employment_ended');
    expect(out.row.effective_date).toBe('2026-12-31');
    expect(out.row.new_text).toBeNull();
    expect(out.row.new_location_id).toBeNull();
  });

  it('refuses to write without canonical identity', async () => {
    const calls = { n: 0 };
    const client = { from: () => { calls.n += 1; return { insert: () => ({ select: () => ({ single: async () => ({}) }) }) }; } };
    expect((await recordEmploymentEvent({ supabase: client, orgId: ORG, employeeId: '', eventType: 'job_title_changed', effectiveDate: 'x', recordedBy: USER })).result)
      .toBe(EVENT_RESULT.INVALID);
    expect(calls.n).toBe(0);
  });

  it('cancellation is metadata, never a delete', async () => {
    const seen = {};
    const client = { from: () => ({ update: (p) => { seen.patch = p; return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{}], error: null }) }) }) }; },
                                    delete: () => { seen.deleted = true; return { eq: async () => ({}) }; } }) };
    await cancelEmploymentEvent({ supabase: client, eventId: 'ev-1', updatedAt: 'v1', cancelledBy: USER, reason: 'wrong date' });
    expect(seen.patch.cancelled_at).toBeTruthy();
    expect(seen.patch.cancelled_by).toBe(USER);
    expect(seen.patch.cancellation_reason).toBe('wrong date');
    expect(seen.deleted).toBeUndefined();
  });

  it('every update is conditional on the version last read', async () => {
    const seen = {};
    const client = { from: () => ({ update: () => ({ eq: (c, v) => { seen[c] = v; return { eq: (c2, v2) => { seen[c2] = v2; return { select: async () => ({ data: [{}], error: null }) }; } }; } }) }) };
    await correctEmploymentEvent({ supabase: client, eventId: 'ev-1', updatedAt: 'v1', patch: { effective_date: '2026-12-01' } });
    expect(seen.id).toBe('ev-1');
    expect(seen.updated_at).toBe('v1');
    await setDocumentationStatus({ supabase: client, eventId: 'ev-1', updatedAt: 'v2', documentationStatus: 'sent' });
    expect(seen.updated_at).toBe('v2');
  });

  it('a lost race is a conflict, and blames nobody', async () => {
    const client = { from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }) }) };
    const out = await correctEmploymentEvent({ supabase: client, eventId: 'ev-1', updatedAt: 'v1', patch: { note: 'x' } });
    expect(out.result).toBe(EVENT_RESULT.CONFLICT);
    expect(describeEventOutcome(out).message).toMatch(/Someone else updated this record/);
  });

  it('the database refuses to rewrite an already-effective event', () => {
    const fn = migrationCode.slice(migrationCode.indexOf('function public.employment_event_guard'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/old\.effective_date <= current_date/);
    expect(body).toMatch(/new\.event_type is distinct from old\.event_type/);
    expect(body).toMatch(/old\.cancelled_at is not null and new\.cancelled_at is null/);
  });

  it('maps rows without inventing fields', () => {
    const m = mapEmploymentEventRow({ id: 'x', org_id: ORG, employee_id: EMP, event_type: 'location_changed',
      effective_date: '2026-11-01', new_location_id: MAN, documentation_status: 'not_sent' });
    expect(m).toMatchObject({ id: 'x', employeeId: EMP, eventType: 'location_changed', effectiveDate: '2026-11-01', newLocationId: MAN, documentationStatus: 'not_sent' });
    expect(m.cancelledAt).toBeNull();
  });
});

// ── Documentation follow-up ────────────────────────────────────────────────
describe('documentation follow-up', () => {
  it('outstanding documentation on an EFFECTIVE change needs attention', () => {
    const items = employmentAttention(EMP, [ev({ effectiveDate: '2026-09-01', documentationStatus: 'not_sent' })], TODAY);
    expect(items).toHaveLength(1);
    expect(items[0].label).toMatch(/Documentation not sent/);
  });

  it('a FUTURE change with outstanding documentation does not nag yet', () => {
    expect(employmentAttention(EMP, [ev({ documentationStatus: 'not_sent' })], TODAY)).toEqual([]);
  });

  it('sent and not_required never produce an item', () => {
    ['sent', 'not_required'].forEach(st =>
      expect(employmentAttention(EMP, [ev({ effectiveDate: '2026-09-01', documentationStatus: st })], TODAY), st).toEqual([]));
  });

  it('it reaches the Employee File attention list', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [],
      employmentEvents: [ev({ effectiveDate: '2026-09-01', documentationStatus: 'not_sent' })], now: TODAY,
    }, { isHR: true });
    expect(file.attention.some(a => /Documentation not sent/.test(a.label))).toBe(true);
  });

  it('not every employment event becomes a task', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [],
      employmentEvents: [ev({ effectiveDate: '2026-09-01', documentationStatus: 'sent' })], now: TODAY,
    }, { isHR: true });
    expect(file.attention.some(a => /Documentation/.test(a.label))).toBe(false);
  });
});

// ── Current Warnings must be untouched ─────────────────────────────────────
describe('Current Warnings regression', () => {
  it('no employment event can produce a warning', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [], allegations: [],
      employmentEvents: [
        ev({ effectiveDate: '2026-01-01' }),
        ev({ id: 'e2', eventType: 'location_changed', oldText: null, newText: null, oldLocationId: LON, newLocationId: MAN, effectiveDate: '2026-02-01' }),
        ev({ id: 'e3', eventType: 'employment_ended', oldText: null, newText: null, effectiveDate: '2026-09-01' }),
      ],
      now: TODAY,
    }, { isHR: true });
    expect(file.currentWarnings).toEqual([]);
  });

  it('warnings still derive from cases and allegations only', () => {
    expect(deriveCurrentWarnings.length).toBeLessThanOrEqual(3);
    const warned = deriveCurrentWarnings([{ id: 'c1', employeeId: EMP, caseType: 'misconduct', stage: 'closed',
      outcome: 'First written warning', outcomeIssuedAt: '2026-09-11T00:00:00.000Z', warningExpiresAt: '2027-03-11', meetings: [] }], [], TODAY);
    expect(warned).toHaveLength(1);
  });

  it('the event table has no warning or sanction column', () => {
    expect(migrationCode).not.toMatch(/warning|sanction/i);
  });

  it('an Activity entry for an employment event carries nothing warning-shaped', () => {
    // currentWarnings staying empty is necessary but not sufficient: a warning
    // field smuggled onto the projected entry would be read as one downstream.
    const [entry] = buildEmploymentEventEntries([ev()], { today: TODAY });
    Object.keys(entry).forEach(k => expect(k, k).not.toMatch(/warning|expires|sanction/i));
    const src = strip(read('src/lib/employmentEvents.js'));
    expect(src).not.toMatch(/warningExpires|expiresAt|isFormalWarning/);
  });
});

// ── Identity and rehire ────────────────────────────────────────────────────
describe('identity', () => {
  it('events are parented by UUID, never by name', () => {
    [strip(read('src/lib/employmentEvents.js')), strip(read('src/lib/employmentEventWrites.js'))].forEach(src => {
      expect(src).not.toMatch(/employeeName/);
      expect(src).not.toMatch(/employee_name/);
    });
  });

  it('two same-named employees keep separate employment histories', () => {
    const data = {
      employeeRecords: [employee(), employee({ id: EMP2, jobTitle: 'Team Member' })],
      cases: [], now: TODAY,
      employmentEvents: [ev({ effectiveDate: '2026-01-01' }), ev({ id: 'other', employeeId: EMP2, effectiveDate: '2026-01-01', newText: 'Director' })],
    };
    expect(buildEmployeeFile(EMP, data, { isHR: true }).effectiveEmployee.jobTitle).toBe('Team Leader');
    expect(buildEmployeeFile(EMP2, data, { isHR: true }).effectiveEmployee.jobTitle).toBe('Director');
  });

  it('composite FKs make cross-org employee and target location unstorable', () => {
    // Asserted here as well as for activities: the same class of protection has to
    // be pinned per table, or removing it from one goes unnoticed.
    expect(migrationCode).toMatch(
      /foreign key \(employee_id, org_id\)\s*references public\.employee_records\(id, org_id\)/);
    expect(migrationCode).toMatch(
      /foreign key \(new_location_id, org_id\)\s*references public\.locations\(id, org_id\)/);
    expect(migrationCode).toMatch(
      /foreign key \(old_location_id, org_id\)\s*references public\.locations\(id, org_id\)/);
  });

  it('parentage is immutable at the database level', () => {
    const fn = migrationCode.slice(migrationCode.indexOf('function public.employment_event_guard'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/new\.employee_id is distinct from old\.employee_id/);
    expect(body).toMatch(/new\.org_id is distinct from old\.org_id/);
  });

  it('nothing merges or creates an employee by name (rehire safeguard)', () => {
    const writes = strip(read('src/lib/employmentEventWrites.js'));
    expect(writes).not.toMatch(/upsert/);
    expect(writes).not.toMatch(/onConflict/);
  });
});

// ── Effective-state security shape ─────────────────────────────────────────
describe('the location/RLS architecture', () => {
  it('RLS reads the EFFECTIVE location, not the raw column', () => {
    const pol = migrationCode.slice(migrationCode.indexOf('create policy employee_records_select_scoped'));
    const expr = pol.slice(0, pol.indexOf(';'));
    expect(expr).toMatch(/can_access_employee\(org_id, public\.effective_employee_location\(id\)\)/);
    expect(expr).not.toMatch(/can_access_employee\(org_id, location_id\)/);
  });

  it('the resolver excludes future and cancelled events', () => {
    const fn = migrationCode.slice(migrationCode.indexOf('function public.effective_employee_location'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/effective_date <= current_date/);
    expect(body).toMatch(/cancelled_at is null/);
    // Falls back to the base column, so an employee with no events is unchanged.
    expect(body).toMatch(/er\.location_id from public\.employee_records er/);
  });

  it('a Location Manager cannot create a transfer while the rule is undecided', () => {
    const pol = migrationCode.slice(migrationCode.indexOf('create policy employment_events_insert'));
    const expr = pol.slice(0, pol.indexOf(';'));
    expect(expr).toMatch(/event_type <> 'location_changed'\s*\n?\s*or public\.is_hr_in_org\(org_id\)/);
  });

  it('event visibility inherits the employee boundary', () => {
    ['employment_events_select', 'employment_events_insert', 'employment_events_update'].forEach(p => {
      const pol = migrationCode.slice(migrationCode.indexOf(`create policy ${p}`));
      expect(pol.slice(0, pol.indexOf(';')), p).toMatch(/exists \(\s*select 1 from public\.employee_records er/);
    });
  });

  it('there is no DELETE policy on employment events', () => {
    expect(migrationCode).not.toMatch(/create policy employment_events_delete/);
    expect(migrationCode).not.toMatch(/for delete/);
  });

  it('no cron, scheduler or background job is introduced', () => {
    expect(migrationCode).not.toMatch(/pg_cron|cron\.schedule|pg_background/i);
  });
});

// ── DSAR ───────────────────────────────────────────────────────────────────
describe('DSAR', () => {
  const events = [ev({ effectiveDate: '2026-01-01' }), ev({ id: 'other', employeeId: EMP2, effectiveDate: '2026-01-01' })];
  const base = {
    canonicalEmployeeId: EMP,
    employeeRecords: [{ id: EMP, name: 'John Smith' }, { id: EMP2, name: 'John Smith' }],
    cases: [], employmentEvents: events,
  };

  it('includes the subject\'s employment events', () => {
    expect(compileSubjectData('John Smith', base).employmentEvents.map(e => e.id)).toEqual(['ev-1']);
  });

  it('identity basis is employee_id', () => {
    expect(compileSubjectData('John Smith', base).identityBasisByCollection.employmentEvents).toBe('employee_id');
  });

  it('two same-named employees stay separate', () => {
    expect(compileSubjectData('John Smith', { ...base, canonicalEmployeeId: EMP2 }).employmentEvents.map(e => e.id)).toEqual(['other']);
  });

  it('with no canonical id, NO event is attached by name', () => {
    expect(compileSubjectData('John Smith', { ...base, canonicalEmployeeId: null }).employmentEvents).toEqual([]);
  });

  it('erasure covers the table', () => {
    expect(ORG_SCOPED_TABLES).toContain('employee_employment_events');
  });
});

// ── Privacy ────────────────────────────────────────────────────────────────
describe('privacy', () => {
  it('employment events are never persisted to localStorage', () => {
    const i = appCode.indexOf('const [employmentEvents, setEmploymentEvents]');
    expect(i).toBeGreaterThan(-1);
    expect(appCode.slice(i, appCode.indexOf('\n', i))).toMatch(/useState\(\[\]\)/);
    expect(appCode).not.toMatch(/compass_employment_events/);
    expect(appCode).not.toMatch(/orgLsSet\([^)]*[Ee]mployment/);
  });

  it('a failed load fails closed', () => {
    const i = appCode.indexOf('const loadEmploymentEvents');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect((body.match(/setEmploymentEvents\(\[\]\)/g) || []).length).toBe(2);
  });

  it('the domain modules touch no storage', () => {
    ['src/lib/employmentEvents.js', 'src/lib/employmentEventWrites.js',
     'src/screens/employeeFile/EmploymentChangeForm.jsx']
      .forEach(f => expect(strip(read(f)), f).not.toMatch(/localStorage|sessionStorage|indexedDB/));
  });
});

// ── Not a case, and legacy leavers untouched ───────────────────────────────
describe('boundaries', () => {
  it('an employment event is never a case', () => {
    const writes = strip(read('src/lib/employmentEventWrites.js'));
    expect(writes).not.toMatch(/from\('cases'\)/);
    expect(migrationCode).not.toMatch(/insert into public\.cases/i);
  });

  it('legacy leaver data is not migrated or attached', () => {
    expect(migrationCode).not.toMatch(/leaver_instances/);
    expect(migrationCode).not.toMatch(/insert into public\.employee_employment_events/i);
  });

  it('start_date and end_date are not converted or rewritten', () => {
    expect(migrationCode).not.toMatch(/alter\s+column\s+start_date/i);
    expect(migrationCode).not.toMatch(/alter\s+column\s+end_date/i);
    expect(migrationCode).not.toMatch(/update public\.employee_records set (start_date|end_date)/i);
  });

  it('public.meetings is untouched', () => {
    expect(migrationCode).not.toMatch(/\bmeetings\b/);
  });

  it('employment_status on employee_records is not mass-updated', () => {
    expect(migrationCode).not.toMatch(/update public\.employee_records set employment_status/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.7A — employment lifecycle policy closure.
//
// Two decisions E1.7 deliberately left open are now closed, and the
// cancellation/edit capability E1.7 built is now reachable.
//
// The access behaviour itself is proven against production with impersonated
// JWT claims in rolled-back transactions (see the phase report): 11 assertions
// before applying and the full transfer/Archive matrix after. These tests pin
// the policy text and the UI so neither can quietly regress.
// ═══════════════════════════════════════════════════════════════════════════

const CLOSURE = read('supabase/employment_lifecycle_policy_closure_2026-09-27.sql');
const closureCode = CLOSURE.replace(/--[^\n]*/g, '');
const activityPanel = strip(read('src/screens/employeeFile/EmployeeActivityPanel.jsx'));

describe('E1.7A — Location Manager transfers', () => {
  const insertPolicy = () => {
    const i = closureCode.indexOf('create policy employment_events_insert');
    expect(i).toBeGreaterThan(-1);
    return closureCode.slice(i, closureCode.indexOf(';', i));
  };

  it('authority comes from the EMPLOYEE, never from the destination', () => {
    const p = insertPolicy();
    // Current employee authority, resolved through employee RLS.
    expect(p).toMatch(/exists \(\s*select 1 from public\.employee_records er/);
    // The destination is NOT checked against the actor's own locations. That is
    // the decision: a Manchester manager may send their employee to Birmingham.
    expect(p).not.toMatch(/is_location_manager_for\(org_id,\s*new_location_id\)/);
    expect(p).not.toMatch(/new_location_id = any/);
  });

  it('the HR-only clause on transfers is gone', () => {
    expect(insertPolicy()).not.toMatch(/event_type <> 'location_changed'/);
  });

  it('but creation still requires a lifecycle operator, not merely a reader', () => {
    // Deleting the HR-only clause on its own would have let a read-only auditor
    // transfer employees, because any role that can SEE the employee satisfied
    // the rest of the check. Verified against production before the change.
    const p = insertPolicy();
    expect(p).toMatch(/public\.is_hr_in_org\(org_id\)/);
    expect(p).toMatch(/public\.is_location_manager_for\(org_id, public\.effective_employee_location\(employee_id\)\)/);
  });

  it('amendment requires the same authority as creation', () => {
    const i = closureCode.indexOf('create policy employment_events_update');
    const p = closureCode.slice(i, closureCode.indexOf(';', i));
    expect(p).toMatch(/public\.is_hr_in_org\(org_id\)/);
    expect(p).toMatch(/is_location_manager_for\(org_id, public\.effective_employee_location\(employee_id\)\)/);
  });

  it('authorship is never an access path', () => {
    // recorded_by appears ONLY as an anti-impersonation check on insert, never in
    // a USING clause — so the manager who records a transfer out of their scope
    // loses the employee and the event when it takes effect.
    expect(insertPolicy()).toMatch(/recorded_by = auth\.uid\(\)/);
    const selectPol = closureCode.indexOf('create policy employment_events_select');
    expect(selectPol).toBe(-1);   // SELECT deliberately untouched
    const updatePol = closureCode.slice(closureCode.indexOf('create policy employment_events_update'));
    expect(updatePol.slice(0, updatePol.indexOf(';'))).not.toMatch(/recorded_by/);
  });

  it('the change is policy-only — no table, trigger, function or data touched', () => {
    expect(closureCode).not.toMatch(/\balter table\b|\bcreate table\b|\bcreate trigger\b/i);
    expect(closureCode).not.toMatch(/create (or replace )?function/i);
    expect(closureCode).not.toMatch(/\b(insert into|update |delete from)\b/i);
    // And no case policy is touched: case access remains AD-004's three-level model.
    expect(closureCode).not.toMatch(/on public\.cases/);
  });

  it('cross-org destination integrity is still the database\'s job, not the form\'s', () => {
    // Unchanged from E1.7, and relied upon by this decision.
    expect(migrationCode).toMatch(
      /foreign key \(new_location_id, org_id\)\s*references public\.locations\(id, org_id\)/);
  });

  it('the form offers every same-org location to HR and Location Managers alike', () => {
    expect(appCode).toMatch(/canChangeLocation=\{isHR \|\| member\?\.role === 'location_manager'\}/);
    const form = strip(read('src/screens/employeeFile/EmploymentChangeForm.jsx'));
    // The destination list is the organisation's locations, not a filtered subset.
    expect(form).toMatch(/locations\.map\(l => <option key=\{l\.id\} value=\{l\.id\}>/);
    expect(form).not.toMatch(/authorisedLocationIds/);
  });

  it('no general ability to update employee_records.location_id was granted', () => {
    const writes = strip(read('src/lib/employmentEventWrites.js'));
    expect(writes).not.toMatch(/from\('employee_records'\)/);
  });
});

describe('E1.7A — Archive uses the ordinary employee boundary', () => {
  it('no archive-specific policy or table exists', () => {
    expect(closureCode).not.toMatch(/archive/i);
    expect(migrationCode).not.toMatch(/archived_employees/);
    expect(ORG_SCOPED_TABLES).not.toContain('archived_employees');
  });

  it('Archive is a filter over the same roster, by effective status', () => {
    const people = strip(read('src/screens/PeopleScreen.jsx'));
    expect(people).toMatch(/archived \? !p\.isCurrent : p\.isCurrent/);
    // One roster builder, one security boundary: a single CALL site (the other
    // mention is the import), so People and Archive cannot drift apart.
    expect((people.match(/buildEmployeeRoster\(/g) || []).length).toBe(1);
  });

  it('an archived employee keeps the same Employee File and UUID', () => {
    const leaving = ev({ id: 'leave', eventType: 'employment_ended', effectiveDate: '2026-09-01',
      oldText: null, newText: null });
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [employee()], cases: [], employmentEvents: [leaving], now: TODAY,
    }, { isHR: true });
    expect(file.employee.id).toBe(EMP);
    expect(file.isCurrentEmployee).toBe(false);
  });

  it('archive access follows the EFFECTIVE location, so losing scope loses the file', () => {
    // The mechanism: employee RLS resolves the effective location, and Archive
    // adds nothing. Proven live; asserted here as the shape that makes it true.
    const pol = migrationCode.slice(migrationCode.indexOf('create policy employee_records_select_scoped'));
    expect(pol.slice(0, pol.indexOf(';'))).toMatch(/effective_employee_location\(id\)/);
  });
});

describe('E1.7A — cancelling and editing a pending change', () => {
  it('the actions are offered only while the change is pending', () => {
    expect(activityPanel).toMatch(/if \(!entry\.pending \|\| entry\.cancelled\) return null;/);
  });

  it('cancellation requires a reason and explains itself naturally', () => {
    expect(activityPanel).toMatch(/Cancel change/);
    expect(activityPanel).toMatch(/keeps the change in the employee's history but prevents it from taking effect/);
    // Anchored to the DISABLED prop, not to the string anywhere: `!reason.trim()`
    // also appears three times in the button's styling, so a bare match survives
    // the guard being removed from the only place it matters.
    expect(activityPanel).toMatch(/disabled=\{busy \|\| !reason\.trim\(\)\}/);
    // No technical cancellation fields are exposed.
    expect(activityPanel).not.toMatch(/cancelled_at|cancelled_by|cancellation_reason/);
  });

  it('a cancelled change is shown as Cancelled rather than disappearing', () => {
    expect(activityPanel).toMatch(/entry\.cancelled \? "Cancelled"/);
  });

  it('a pending change says it has not happened yet', () => {
    expect(activityPanel).toMatch(/Takes effect on this date/);
  });

  it('the handlers carry the version last read, so neither silently overwrites', () => {
    ['const cancelEmploymentChange', 'const editEmploymentChange'].forEach(fn => {
      const i = appCode.indexOf(fn);
      const body = appCode.slice(i, appCode.indexOf('\n  };', i));
      expect(body, fn).toMatch(/updatedAt: event\.updatedAt/);
      // A conflict reloads rather than reporting success.
      expect(body, fn).toMatch(/loadEmploymentEvents\(\)/);
    });
  });

  it('cancelling never deletes, and the database refuses reinstatement', () => {
    const writes = strip(read('src/lib/employmentEventWrites.js'));
    const i = writes.indexOf('export async function cancelEmploymentEvent');
    const body = writes.slice(i, writes.indexOf('export async function setDocumentationStatus'));
    expect(body).not.toMatch(/\.delete\(/);
    expect(body).toMatch(/cancelled_at/);
    // FILE-WIDE, not just this function: a delete helper added anywhere else in
    // the module would be just as destructive, and the database has no DELETE
    // policy to stop the attempt being written.
    expect(writes).not.toMatch(/\.delete\(/);
    expect(appCode).not.toMatch(/from\('employee_employment_events'\)[\s\S]{0,80}\.delete\(/);
    expect(migrationCode).not.toMatch(/create policy employment_events_delete/);
    const guard = migrationCode.slice(migrationCode.indexOf('function public.employment_event_guard'));
    expect(guard.slice(0, guard.indexOf('$$;'))).toMatch(/old\.cancelled_at is not null and new\.cancelled_at is null/);
  });

  it('a cancelled future change never becomes effective', () => {
    const cancelled = ev({ effectiveDate: '2026-01-01', cancelledAt: '2026-01-02T00:00:00.000Z' });
    expect(isEffective(cancelled, TODAY)).toBe(false);
    expect(resolveEffectiveEmployee(employee(), [cancelled], TODAY).jobTitle).toBe('Team Member');
    // But it is still in the history.
    const [entry] = buildEmploymentEventEntries([cancelled], { today: TODAY });
    expect(entry.cancelled).toBe(true);
  });

  it('an effective change offers no edit or cancel, by the same one-line rule', () => {
    const effective = ev({ effectiveDate: '2026-01-01' });
    const [entry] = buildEmploymentEventEntries([effective], { today: TODAY });
    expect(entry.pending).toBe(false);
    // The component returns null for anything not pending.
    expect(activityPanel).toMatch(/if \(!entry\.pending \|\| entry\.cancelled\) return null;/);
  });

  it('DSAR keeps a cancelled event — history is not removed by cancelling it', () => {
    const cancelled = ev({ effectiveDate: '2026-01-01', cancelledAt: '2026-01-02T00:00:00.000Z' });
    const out = compileSubjectData('John Smith', {
      canonicalEmployeeId: EMP,
      employeeRecords: [{ id: EMP, name: 'John Smith' }],
      cases: [], employmentEvents: [cancelled],
    });
    expect(out.employmentEvents.map(e => e.id)).toEqual(['ev-1']);
  });
});
