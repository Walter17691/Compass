import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACTIVITY_TYPES, RECORD_TYPES, activityTypeLabel, recordTypeLabel, isActivityType, isRecordType,
  CONVERSATION_STATES, CONCERN_STATES, usesConcernLifecycle, activityStateLabel,
  isActivityOpen, isOpenConcern, isLetterOfConcern, letterOfConcernSummary,
  buildActivityEntries, activityAttention,
} from '../lib/employeeActivities.js';
import {
  createEmployeeActivity, addActivityRecord, updateEmployeeActivity,
  resolveManagementConcern, describeActivityOutcome, ACTIVITY_RESULT,
  mapActivityRow, mapActivityRecordRow,
} from '../lib/employeeActivityWrites.js';
import { buildEmployeeFile, EMPLOYEE_FILE_TABS, deriveCurrentWarnings } from '../lib/employeeFile.js';
import { compileSubjectData } from '../lib/dsarCompile.js';
import { ORG_SCOPED_TABLES } from '../lib/dataInventory.js';

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.6 — Employee Activities.
//
// Not everything is a case. The database integrity rules and the RLS boundary
// were proven directly against production inside rolled-back transactions (16
// integrity assertions, 15 security assertions; see the phase report). These
// tests cover the domain, the projection, and the separations that must never
// erode — above all that no informal activity can become a formal warning.
// ═══════════════════════════════════════════════════════════════════════════

const read = f => readFileSync(f, 'utf8');
const strip = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const MIGRATION = read('supabase/employee_activities_2026-09-27.sql');
const migrationCode = MIGRATION.replace(/--[^\n]*/g, '');
const appCode = strip(read('src/App.jsx'));

const EMP = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const EMP2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const concern = (over = {}) => ({
  id: 'act-1', orgId: ORG, employeeId: EMP, activityType: 'management_concern',
  title: 'Timekeeping', concernState: 'open', lifecycleState: null,
  occurredAt: '2026-09-15T09:00:00.000Z', createdAt: '2026-09-27T10:00:00.000Z',
  managerName: 'Alex Manager', updatedAt: '2026-09-27T10:00:00.000Z', ...over,
});
const oneToOne = (over = {}) => ({
  id: 'act-2', orgId: ORG, employeeId: EMP, activityType: 'one_to_one',
  lifecycleState: 'completed', concernState: null,
  occurredAt: '2026-09-20T09:00:00.000Z', createdAt: '2026-09-20T09:30:00.000Z',
  managerName: 'Alex Manager', updatedAt: '2026-09-20T09:30:00.000Z', ...over,
});

// ── Domain: the four types and their language ───────────────────────────────
describe('activity types and product language', () => {
  it('has exactly the four approved types', () => {
    expect(ACTIVITY_TYPES.map(t => t.id)).toEqual(
      ['one_to_one', 'return_to_work', 'conversation', 'management_concern']);
  });

  it('shows natural labels, never database enum names', () => {
    expect(activityTypeLabel('one_to_one')).toBe('1:1');
    expect(activityTypeLabel('return_to_work')).toBe('Return to Work');
    expect(activityTypeLabel('conversation')).toBe('Conversation');
    expect(activityTypeLabel('management_concern')).toBe('Management Concern');
    ACTIVITY_TYPES.forEach(t => expect(t.label).not.toContain('_'));
  });

  it('never calls an ordinary activity a case, hearing or investigation', () => {
    const words = /case|hearing|investigation|disciplinary meeting|proceeding|sanction/i;
    ACTIVITY_TYPES.forEach(t => {
      expect(t.label, t.id).not.toMatch(words);
      expect(t.blurb, t.id).not.toMatch(/\bcase\b|hearing|investigation|proceeding/i);
    });
  });

  it('rejects an unknown type rather than inventing a label', () => {
    expect(isActivityType('disciplinary')).toBe(false);
    expect(isActivityType('')).toBe(false);
    expect(activityTypeLabel('disciplinary')).toBe('Activity');
  });

  it('has the smallest useful record-type set', () => {
    expect(RECORD_TYPES.map(r => r.id)).toEqual(
      ['conversation', 'follow_up', 'note', 'letter_of_concern', 'communication']);
    expect(recordTypeLabel('letter_of_concern')).toBe('Letter of Concern');
    expect(isRecordType('first_written_warning')).toBe(false);
  });
});

// ── Lifecycle semantics are NOT conflated ──────────────────────────────────
describe('lifecycle semantics differ by activity type', () => {
  it('a concern uses open/resolved; a conversation uses the conversation lifecycle', () => {
    expect(CONCERN_STATES).toEqual(['open', 'resolved']);
    expect(CONVERSATION_STATES).toEqual(['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']);
    expect(usesConcernLifecycle('management_concern')).toBe(true);
    ['one_to_one', 'return_to_work', 'conversation'].forEach(t =>
      expect(usesConcernLifecycle(t), t).toBe(false));
  });

  it('a completed 1:1 is NOT described as resolved', () => {
    const label = activityStateLabel(oneToOne());
    expect(label).toBe('Recorded');
    expect(label).not.toMatch(/resolved/i);
  });

  it('a completed Return to Work is NOT described as resolved', () => {
    expect(activityStateLabel(oneToOne({ activityType: 'return_to_work' }))).not.toMatch(/resolved/i);
  });

  it('a management concern is NOT described as completed', () => {
    expect(activityStateLabel(concern())).toBe('Open');
    expect(activityStateLabel(concern({ concernState: 'resolved' }))).toBe('Resolved');
    expect(activityStateLabel(concern())).not.toMatch(/completed/i);
  });

  it('a recorded 1:1 is not an open item; an open concern is', () => {
    expect(isActivityOpen(oneToOne())).toBe(false);
    expect(isActivityOpen(concern())).toBe(true);
    expect(isActivityOpen(concern({ concernState: 'resolved' }))).toBe(false);
    expect(isOpenConcern(concern())).toBe(true);
    expect(isOpenConcern(oneToOne())).toBe(false);
  });

  it('a scheduled conversation IS still open — it has not happened yet', () => {
    expect(isActivityOpen(oneToOne({ lifecycleState: 'scheduled' }))).toBe(true);
    expect(isActivityOpen(oneToOne({ lifecycleState: 'cancelled' }))).toBe(false);
  });

  it('the database makes the wrong pairing unstorable, not merely discouraged', () => {
    // The CHECK constraint is the real guarantee; this asserts it exists in the
    // migration so the JS above can never be the only thing standing in the way.
    expect(migrationCode).toMatch(/activity_type = 'management_concern'[\s\S]{0,200}lifecycle_state is null/);
    expect(migrationCode).toMatch(/activity_type <> 'management_concern'[\s\S]{0,240}concern_state is null/);
  });
});

// ── occurred_at vs created_at ──────────────────────────────────────────────
describe('retrospective history', () => {
  it('occurred_at carries the employment-history date, created_at the system truth', () => {
    const [entry] = buildActivityEntries({ activities: [concern()] });
    expect(entry.occurredAt).toBe('2026-09-15T09:00:00.000Z');
    expect(entry.recordedAt).toBe('2026-09-27T10:00:00.000Z');
    expect(new Date(entry.occurredAt) < new Date(entry.recordedAt)).toBe(true);
  });

  it('a record written up later is flagged, not disguised', () => {
    const [late] = buildActivityEntries({ activities: [concern()] });
    expect(late.recordedLater).toBe(true);
    const [sameDay] = buildActivityEntries({ activities: [oneToOne()] });
    expect(sameDay.recordedLater).toBe(false);
  });

  it('nothing back-dates created_at to simulate history', () => {
    // created_at is a database default and is never sent by the client.
    const src = strip(read('src/lib/employeeActivityWrites.js'));
    expect(src).not.toMatch(/created_at:/);
    expect(src).toMatch(/occurred_at:/);
  });
});

// ── Letter of Concern is NOT a warning ─────────────────────────────────────
describe('Letter of Concern separation', () => {
  const letter = { id: 'r1', activityId: 'act-1', recordType: 'letter_of_concern', occurredAt: '2026-09-22T09:00:00.000Z' };

  it('is recognised as informal, and says so', () => {
    expect(isLetterOfConcern(letter)).toBe(true);
    const s = letterOfConcernSummary(letter);
    expect(s.label).toBe('Letter of Concern');
    expect(s.isFormalWarning).toBe(false);
    expect(s.expiresAt).toBeNull();
  });

  it('carries no expiry, because none was invented for it', () => {
    expect(letterOfConcernSummary(letter).expiresAt).toBeNull();
    // And no expiry is derivable anywhere in the domain module.
    const src = strip(read('src/lib/employeeActivities.js'));
    expect(src).not.toMatch(/warningExpires/);
    // Counted, not pattern-matched: `expiresAt:\s*[^n]` looks like it forbids a
    // non-null value, but \s* backtracks to zero width and the class then matches
    // the space — the same trap an earlier phase already fell into once.
    const mentions = src.match(/expiresAt:[^,\n]*/g) || [];
    expect(mentions).toEqual(['expiresAt: null']);
    expect(src).not.toMatch(/First Written|Final Written/i);
  });

  it('the database has no warning column to put it in', () => {
    // Structural, not a label: employee_activity_records has body/record_type and
    // nothing resembling a sanction.
    expect(migrationCode).not.toMatch(/warning_expires_at|warning_duration_months/);
    const recordsTable = migrationCode.slice(
      migrationCode.indexOf('create table public.employee_activity_records'),
      migrationCode.indexOf(');', migrationCode.indexOf('create table public.employee_activity_records')));
    expect(recordsTable).not.toMatch(/warning|sanction|expiry|expires/i);
  });

  it('a formal warning is not even a valid record type', () => {
    ['first_written_warning', 'final_written_warning', 'warning'].forEach(t =>
      expect(isRecordType(t), t).toBe(false));
  });
});

// ── Current Warnings must stay untouched ───────────────────────────────────
describe('Current Warnings regression — no activity can populate it', () => {
  const warningCase = {
    id: 'c1', employeeId: EMP, caseType: 'misconduct', stage: 'closed',
    outcome: 'First written warning', outcomeIssuedAt: '2026-09-11T00:00:00.000Z',
    warningExpiresAt: '2027-03-11', meetings: [],
  };

  it('derives warnings from cases only — activities are not an input', () => {
    // deriveCurrentWarnings' signature takes cases and allegations. There is no
    // parameter an activity could arrive through.
    expect(deriveCurrentWarnings.length).toBeLessThanOrEqual(3);
    const warnings = deriveCurrentWarnings([warningCase], [], new Date('2026-09-27'));
    expect(warnings).toHaveLength(1);
  });

  it('an employee whose ONLY history is activities has no current warnings', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [{ id: EMP, name: 'Sam', orgId: ORG }],
      cases: [], allegations: [],
      employeeActivities: [concern(), oneToOne()],
      employeeActivityRecords: [
        { id: 'r1', activityId: 'act-1', employeeId: EMP, recordType: 'letter_of_concern', occurredAt: '2026-09-22T09:00:00.000Z' },
      ],
      now: new Date('2026-09-27'),
    }, { isHR: true });
    expect(file.currentWarnings).toEqual([]);
    // The activity history IS there — it simply is not a warning.
    expect(file.activityEntries.length).toBe(2);
    expect(file.activityEntries.some(e => e.hasLetterOfConcern)).toBe(true);
  });

  it('a Letter of Concern does not change an existing warning list', () => {
    const base = { employeeRecords: [{ id: EMP, name: 'Sam', orgId: ORG }], cases: [warningCase], allegations: [], now: new Date('2026-09-27') };
    const without = buildEmployeeFile(EMP, base, { isHR: true }).currentWarnings;
    const withLetter = buildEmployeeFile(EMP, {
      ...base,
      employeeActivities: [concern()],
      employeeActivityRecords: [{ id: 'r1', activityId: 'act-1', employeeId: EMP, recordType: 'letter_of_concern', occurredAt: '2026-09-22T09:00:00.000Z' }],
    }, { isHR: true }).currentWarnings;
    expect(withLetter).toEqual(without);
    expect(withLetter).toHaveLength(1);
  });

  it('no informal activity increases a sanction automatically', () => {
    const src = strip(read('src/lib/employeeActivities.js'));
    expect(src).not.toMatch(/escalat/i);
    expect(src).not.toMatch(/sanction/i);
  });
});

// ── Identity ───────────────────────────────────────────────────────────────
describe('canonical identity', () => {
  it('activities are selected by employee_id, never by name', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [{ id: EMP, name: 'John Smith', orgId: ORG }, { id: EMP2, name: 'John Smith', orgId: ORG }],
      cases: [],
      employeeActivities: [concern(), oneToOne({ id: 'act-3', employeeId: EMP2 })],
      employeeActivityRecords: [],
    }, { isHR: true });
    expect(file.activities.map(a => a.id)).toEqual(['act-1']);
  });

  it('two same-named employees keep separate activity histories', () => {
    const data = {
      employeeRecords: [{ id: EMP, name: 'John Smith', orgId: ORG }, { id: EMP2, name: 'John Smith', orgId: ORG }],
      cases: [],
      employeeActivities: [concern(), oneToOne({ id: 'act-3', employeeId: EMP2 })],
      employeeActivityRecords: [],
    };
    expect(buildEmployeeFile(EMP, data, { isHR: true }).activities).toHaveLength(1);
    expect(buildEmployeeFile(EMP2, data, { isHR: true }).activities).toHaveLength(1);
    expect(buildEmployeeFile(EMP, data, { isHR: true }).activities[0].id).toBe('act-1');
    expect(buildEmployeeFile(EMP2, data, { isHR: true }).activities[0].id).toBe('act-3');
  });

  it('no name fallback exists in the domain or the writes', () => {
    [strip(read('src/lib/employeeActivities.js')), strip(read('src/lib/employeeActivityWrites.js'))]
      .forEach(src => {
        expect(src).not.toMatch(/employeeName/);
        expect(src).not.toMatch(/employee_name/);
      });
  });

  // Asserted per FUNCTION and per POLICY, never across the whole file. The two
  // guard functions contain the identical employee/org line, so a file-wide match
  // passes while one of them is gutted — the same blind spot an earlier phase hit.
  const sqlBlock = (startMarker, endMarker) => {
    const from = migrationCode.indexOf(startMarker);
    expect(from, startMarker).toBeGreaterThan(-1);
    const rest = migrationCode.slice(from);
    const end = rest.indexOf(endMarker, startMarker.length);
    return rest.slice(0, end === -1 ? rest.length : end);
  };

  it('parentage is immutable, enforced per guard function', () => {
    const activityGuard = sqlBlock('function public.employee_activity_parentage_guard()', '$$;');
    expect(activityGuard).toMatch(/new\.org_id is distinct from old\.org_id/);
    expect(activityGuard).toMatch(/new\.employee_id is distinct from old\.employee_id/);
    expect(activityGuard).not.toMatch(/if false then/);

    const recordGuard = sqlBlock('function public.employee_activity_record_parentage_guard()', '$$;');
    expect(recordGuard).toMatch(/new\.employee_id is distinct from old\.employee_id/);
    expect(recordGuard).toMatch(/new\.activity_id is distinct from old\.activity_id/);
    expect(recordGuard).not.toMatch(/if false then/);
  });

  it('the activity carries a composite employee FK, so cross-org is unstorable', () => {
    expect(migrationCode).toMatch(
      /foreign key \(employee_id, org_id\)\s*references public\.employee_records\(id, org_id\)/);
    // And the location snapshot gets the same treatment.
    expect(migrationCode).toMatch(
      /foreign key \(location_id, org_id\)\s*references public\.locations\s*\(id, org_id\)/);
  });

  it('activity RLS inherits the employee boundary rather than settling for own-org', () => {
    // An org-only predicate would hand every Location Manager the whole
    // organisation's management history.
    const sel = sqlBlock('create policy employee_activities_select', ';');
    expect(sel).toMatch(/exists \(\s*select 1 from public\.employee_records er/);
    expect(sel).toMatch(/er\.id = employee_activities\.employee_id/);
    ['employee_activities_insert', 'employee_activities_update'].forEach(pol => {
      const block = sqlBlock(`create policy ${pol}`, ';');
      expect(block, pol).toMatch(/exists \(\s*select 1 from public\.employee_records er/);
    });
  });

  it('child records inherit from the ACTIVITY, so they cannot be read around it', () => {
    ['employee_activity_records_select', 'employee_activity_records_insert', 'employee_activity_records_update']
      .forEach(pol => {
        const block = sqlBlock(`create policy ${pol}`, ';');
        expect(block, pol).toMatch(/exists \(\s*select 1 from public\.employee_activities a/);
        expect(block, pol).toMatch(/a\.id = employee_activity_records\.activity_id/);
      });
  });

  it('there is no DELETE policy — employment history is not removable', () => {
    expect(migrationCode).not.toMatch(/create policy employee_activit\w*_delete/);
    expect(migrationCode).not.toMatch(/for delete/);
  });

  it('records carry org and employee so the composite FK can verify the parent', () => {
    expect(migrationCode).toMatch(/foreign key \(activity_id, org_id, employee_id\)\s*references public\.employee_activities\(id, org_id, employee_id\)/);
  });

});

// ── The Activity projection ────────────────────────────────────────────────
describe('the Activity projection', () => {
  const cases = [{
    id: 'c1', employeeId: EMP, caseType: 'misconduct', stage: 'open', createdAt: '2026-08-01T00:00:00.000Z',
    meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-05' }],
  }];

  it('merges activities, process milestones and case meetings into one chronology', () => {
    const entries = buildActivityEntries({ activities: [concern(), oneToOne()], activityRecords: [], cases });
    expect(entries.map(e => e.kind).sort()).toEqual(['activity', 'activity', 'meeting', 'process']);
    // Newest first.
    const dates = entries.map(e => new Date(e.occurredAt || 0).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('nests an activity\'s chronology in date order', () => {
    const records = [
      { id: 'r2', activityId: 'act-1', recordType: 'letter_of_concern', occurredAt: '2026-09-22T09:00:00.000Z' },
      { id: 'r1', activityId: 'act-1', recordType: 'conversation', occurredAt: '2026-09-15T09:00:00.000Z' },
    ];
    const [entry] = buildActivityEntries({ activities: [concern()], activityRecords: records });
    expect(entry.records.map(r => r.id)).toEqual(['r1', 'r2']);
    expect(entry.hasLetterOfConcern).toBe(true);
  });

  it('shows no internal database terminology', () => {
    const entries = buildActivityEntries({ activities: [concern(), oneToOne()], cases });
    entries.forEach(e => {
      expect(e.typeLabel).not.toMatch(/_/);
      if (e.stateLabel) expect(e.stateLabel).not.toMatch(/_/);
    });
  });

  it('a meeting outside a case is absent — it has no canonical employee', () => {
    const entries = buildActivityEntries({ activities: [], cases: [{ id: 'c2', employeeId: EMP, meetings: [] }] });
    expect(entries.filter(e => e.kind === 'meeting')).toHaveLength(0);
  });
});

// ── Attention ──────────────────────────────────────────────────────────────
describe('needs your attention', () => {
  it('an open concern needs attention', () => {
    const items = activityAttention([concern()], new Date('2026-09-27'));
    expect(items).toHaveLength(1);
    expect(items[0].label).toMatch(/Open management concern — Timekeeping/);
  });

  it('a recorded 1:1 never needs attention', () => {
    expect(activityAttention([oneToOne()], new Date('2026-09-27'))).toEqual([]);
  });

  it('a follow-up that has come due needs attention; a future one does not', () => {
    const due = activityAttention([oneToOne({ followUpDate: '2026-09-20' })], new Date('2026-09-27'));
    expect(due).toHaveLength(1);
    expect(due[0].label).toMatch(/Follow-up due/);
    expect(activityAttention([oneToOne({ followUpDate: '2026-12-01' })], new Date('2026-09-27'))).toEqual([]);
  });

  it('a resolved concern stops needing attention but keeps its history', () => {
    const resolved = concern({ concernState: 'resolved', resolvedAt: '2026-10-20T00:00:00.000Z', followUpDate: '2026-09-20' });
    expect(activityAttention([resolved], new Date('2026-09-27'))).toEqual([]);
    const [entry] = buildActivityEntries({ activities: [resolved],
      activityRecords: [{ id: 'r1', activityId: 'act-1', recordType: 'conversation', occurredAt: '2026-09-15T09:00:00.000Z' }] });
    expect(entry.records).toHaveLength(1);
    expect(entry.stateLabel).toBe('Resolved');
  });

  it('activity attention reaches the Employee File attention list', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [{ id: EMP, name: 'Sam', orgId: ORG }], cases: [],
      employeeActivities: [concern()], employeeActivityRecords: [], now: new Date('2026-09-27'),
    }, { isHR: true });
    expect(file.attention.some(a => /Open management concern/.test(a.label))).toBe(true);
    expect(file.openConcerns).toHaveLength(1);
  });
});

// ── Employee File IA ───────────────────────────────────────────────────────
describe('Employee File information architecture', () => {
  it('is the approved four-tab model', () => {
    expect(EMPLOYEE_FILE_TABS.map(t => t.id)).toEqual(['overview', 'activity', 'processes', 'documents']);
    expect(EMPLOYEE_FILE_TABS.map(t => t.label)).toEqual(['Overview', 'Activity', 'HR Processes', 'Documents']);
  });

  it('Timeline and Meetings are no longer separate tabs', () => {
    const ids = EMPLOYEE_FILE_TABS.map(t => t.id);
    expect(ids).not.toContain('timeline');
    expect(ids).not.toContain('meetings');
  });

  it('Overview keeps what it had', () => {
    const file = buildEmployeeFile(EMP, {
      employeeRecords: [{ id: EMP, name: 'Sam', orgId: ORG }], cases: [], employeeActivities: [], employeeActivityRecords: [],
    }, { isHR: true });
    ['attention', 'currentWarnings', 'employmentDetails', 'recentActivity', 'currentProcess'].forEach(k =>
      expect(file, k).toHaveProperty(k));
  });
});

// ── Writes and concurrency ─────────────────────────────────────────────────
describe('writes', () => {
  const okClient = (captured) => ({
    from: () => ({
      insert: (row) => { captured.row = row; return { select: () => ({ single: async () => ({ data: { id: 'new', ...row }, error: null }) }) }; },
    }),
  });

  it('creates an activity with occurred_at and never created_at', async () => {
    const captured = {};
    const out = await createEmployeeActivity({
      supabase: okClient(captured), orgId: ORG, employeeId: EMP, activityType: 'one_to_one',
      lifecycleState: 'completed', occurredAt: '2026-09-15T09:00:00.000Z', recordedBy: USER,
    });
    expect(out.result).toBe(ACTIVITY_RESULT.OK);
    expect(captured.row.occurred_at).toBe('2026-09-15T09:00:00.000Z');
    expect(captured.row).not.toHaveProperty('created_at');
    expect(captured.row.employee_id).toBe(EMP);
    expect(captured.row.recorded_by).toBe(USER);
  });

  it('refuses to call the database without canonical identity', async () => {
    const calls = { n: 0 };
    const client = { from: () => { calls.n += 1; return { insert: () => ({ select: () => ({ single: async () => ({}) }) }) }; } };
    expect((await createEmployeeActivity({ supabase: client, orgId: ORG, employeeId: '', activityType: 'one_to_one', occurredAt: 'x', recordedBy: USER })).result)
      .toBe(ACTIVITY_RESULT.INVALID);
    expect((await addActivityRecord({ supabase: client, activityId: 'a', orgId: ORG, employeeId: '', recordType: 'note', occurredAt: 'x', recordedBy: USER })).result)
      .toBe(ACTIVITY_RESULT.INVALID);
    expect(calls.n).toBe(0);
  });

  it('a record carries org and employee so the parent can be verified', async () => {
    const captured = {};
    await addActivityRecord({
      supabase: okClient(captured), activityId: 'act-1', orgId: ORG, employeeId: EMP,
      recordType: 'letter_of_concern', occurredAt: '2026-09-22T09:00:00.000Z', recordedBy: USER,
    });
    expect(captured.row.org_id).toBe(ORG);
    expect(captured.row.employee_id).toBe(EMP);
    expect(captured.row.activity_id).toBe('act-1');
  });

  it('an update is conditional on the version last read', async () => {
    const seen = {};
    const client = { from: () => ({ update: (p) => { seen.patch = p; return { eq: (c, v) => { seen[c] = v; return { eq: (c2, v2) => { seen[c2] = v2; return { select: async () => ({ data: [{}], error: null }) }; } }; } }; } }) };
    const out = await updateEmployeeActivity({ supabase: client, activityId: 'act-1', updatedAt: 'v1', patch: { title: 'x' } });
    expect(out.result).toBe(ACTIVITY_RESULT.OK);
    expect(seen.id).toBe('act-1');
    expect(seen.updated_at).toBe('v1');
  });

  it('a lost race is reported as a conflict, and blames nobody', async () => {
    const client = { from: () => ({ update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }) }) };
    const out = await updateEmployeeActivity({ supabase: client, activityId: 'act-1', updatedAt: 'v1', patch: { title: 'x' } });
    expect(out.result).toBe(ACTIVITY_RESULT.CONFLICT);
    const { tone, message } = describeActivityOutcome(out);
    expect(tone).toBe('error');
    expect(message).toMatch(/Someone else updated this record/);
  });

  it('resolving a concern sets resolved_at in the same statement', async () => {
    const seen = {};
    const client = { from: () => ({ update: (p) => { seen.patch = p; return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{}], error: null }) }) }) }; } }) };
    await resolveManagementConcern({ supabase: client, activityId: 'act-1', updatedAt: 'v1', resolvedBy: USER, now: new Date('2026-10-20') });
    expect(seen.patch.concern_state).toBe('resolved');
    expect(seen.patch.resolved_at).toBeTruthy();
    expect(seen.patch.resolved_by).toBe(USER);
    // Nothing is deleted.
    expect(Object.keys(seen.patch)).not.toContain('records');
  });

  it('maps rows without inventing fields', () => {
    const a = mapActivityRow({ id: 'a', org_id: ORG, employee_id: EMP, activity_type: 'one_to_one', lifecycle_state: 'completed', occurred_at: 'o', created_at: 'c', updated_at: 'u' });
    expect(a).toMatchObject({ id: 'a', employeeId: EMP, activityType: 'one_to_one', lifecycleState: 'completed', occurredAt: 'o', createdAt: 'c', updatedAt: 'u' });
    expect(a.concernState).toBeNull();
    const r = mapActivityRecordRow({ id: 'r', activity_id: 'a', org_id: ORG, employee_id: EMP, record_type: 'note', occurred_at: 'o' });
    expect(r).toMatchObject({ id: 'r', activityId: 'a', recordType: 'note' });
  });
});

// ── DSAR ───────────────────────────────────────────────────────────────────
describe('DSAR', () => {
  const activities = [concern(), oneToOne({ id: 'act-3', employeeId: EMP2 })];
  const records = [
    { id: 'r1', activityId: 'act-1', employeeId: EMP, recordType: 'letter_of_concern', occurredAt: '2026-09-22T09:00:00.000Z' },
    { id: 'r9', activityId: 'act-3', employeeId: EMP2, recordType: 'note', occurredAt: '2026-09-22T09:00:00.000Z' },
  ];
  const base = {
    canonicalEmployeeId: EMP,
    employeeRecords: [{ id: EMP, name: 'John Smith' }, { id: EMP2, name: 'John Smith' }],
    cases: [], employeeActivities: activities, employeeActivityRecords: records,
  };

  it('includes the subject\'s activities and their chronology', () => {
    const out = compileSubjectData('John Smith', base);
    expect(out.employeeActivities.map(a => a.id)).toEqual(['act-1']);
    expect(out.employeeActivityRecords.map(r => r.id)).toEqual(['r1']);
  });

  it('identity basis is employee_id, with no name alternative', () => {
    const out = compileSubjectData('John Smith', base);
    expect(out.identityBasisByCollection.employeeActivities).toBe('employee_id');
    expect(out.identityBasisByCollection.employeeActivityRecords).toBe('employee_id');
  });

  it('two same-named employees stay separate', () => {
    const forEmp2 = compileSubjectData('John Smith', { ...base, canonicalEmployeeId: EMP2 });
    expect(forEmp2.employeeActivities.map(a => a.id)).toEqual(['act-3']);
    expect(forEmp2.employeeActivityRecords.map(r => r.id)).toEqual(['r9']);
  });

  it('with no canonical id, NO activity is attached by name', () => {
    const out = compileSubjectData('John Smith', { ...base, canonicalEmployeeId: null });
    expect(out.employeeActivities).toEqual([]);
    expect(out.employeeActivityRecords).toEqual([]);
  });

  it('erasure covers both tables', () => {
    expect(ORG_SCOPED_TABLES).toContain('employee_activities');
    expect(ORG_SCOPED_TABLES).toContain('employee_activity_records');
  });
});

// ── Privacy ────────────────────────────────────────────────────────────────
describe('privacy — activities are not persisted client-side', () => {
  it('activity state is never seeded from or written to localStorage', () => {
    const i = appCode.indexOf('const [employeeActivities, setEmployeeActivities]');
    expect(i).toBeGreaterThan(-1);
    expect(appCode.slice(i, appCode.indexOf('\n', i))).toMatch(/useState\(\[\]\)/);
    expect(appCode).not.toMatch(/compass_activities|compass_employee_activities/);
    expect(appCode).not.toMatch(/orgLsSet\([^)]*[Aa]ctivit/);
  });

  it('a failed activity load fails closed', () => {
    const i = appCode.indexOf('const loadEmployeeActivities');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect((body.match(/setEmployeeActivities\(\[\]\)/g) || []).length).toBe(2);
    expect(body).toMatch(/markLoadIssue\('employee activities'\)/);
  });

  it('the domain modules touch no storage at all', () => {
    ['src/lib/employeeActivities.js', 'src/lib/employeeActivityWrites.js',
     'src/screens/employeeFile/EmployeeActivityPanel.jsx']
      .forEach(f => expect(strip(read(f)), f).not.toMatch(/localStorage|sessionStorage|indexedDB/));
  });
});

// ── Not a case ─────────────────────────────────────────────────────────────
describe('activities are not cases', () => {
  it('no activity type is a case_type, and no write touches the cases table', () => {
    const src = strip(read('src/lib/employeeActivityWrites.js'));
    expect(src).not.toMatch(/from\('cases'\)/);
    expect(src).toMatch(/from\('employee_activities'\)/);
    expect(src).toMatch(/from\('employee_activity_records'\)/);
  });

  it('the activity handlers in App.jsx never create a case', () => {
    const i = appCode.indexOf('const createActivityForEmployee');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).not.toMatch(/from\('cases'\)/);
    expect(body).not.toMatch(/caseType/);
    expect(body).not.toMatch(/informal/);
  });

  it('the migration creates no case row and migrates nothing', () => {
    expect(migrationCode).not.toMatch(/insert into public\.cases/i);
    expect(migrationCode).not.toMatch(/insert into public\.employee_activities/i);
    expect(migrationCode).not.toMatch(/\bupdate public\.(cases|meetings|employee_records|wellbeing_notes)\b/i);
  });

  it('public.meetings is untouched', () => {
    expect(migrationCode).not.toMatch(/\bmeetings\b/);
  });
});
