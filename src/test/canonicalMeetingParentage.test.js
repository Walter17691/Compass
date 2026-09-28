import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MEETING_SUBJECT_KIND, STANDALONE_REFUSAL, planStandaloneCreate,
  newStandaloneMeetingRow, meetingRowToObject, isEmployeeOwnedMeeting,
} from '../lib/standaloneMeetings.js';
import { DISCOVERY_COLUMNS } from '../lib/meetingTableGateway.js';
import { compileSubjectData } from '../lib/dsarCompile.js';

// ─────────────────────────────────────────────────────────────────────────
// Phase E2 — CANONICAL MEETING PARENTAGE.
//
// The question this phase answers is "whose meeting is this?", and the reason it
// needed answering is that public.meetings.employee_name held two different
// people: the subject normally, and the WITNESS when a case was linked.
//
// So most of what follows is about the difference between three things that all
// look like "the employee on this meeting":
//   the SUBJECT     — whose employment history this is
//   the PARTICIPANT — who was in the room
//   the OWNER       — whose Employee File it belongs to
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
// Two views of every file, and the distinction matters.
//
// The RAW text is what a reviewer reads, so prose assertions run against it. The
// STRIPPED text is executable content only, so a "this must not appear" assertion
// cannot be satisfied — or defeated — by a comment. An earlier version of this
// file stripped `//` from SQL and left every `--` block intact, which meant the
// rollback comment at the bottom of the migration counted as code.
// LINE-BASED, matching the convention the other suites use. A regex that spans
// `/* ... */` across a 12,000-line file will happily swallow real code the moment
// a string or regex literal contains `/*` — and a strip that deletes code makes
// every "must not appear" assertion pass for the wrong reason.
const stripJs = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');
const stripSql = src => src.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

const migration = read('supabase/canonical_meeting_parentage_2026-09-28.sql');
const migrationCode = stripSql(migration);
const standaloneRaw = read('src/lib/standaloneMeetings.js');
const standalone = stripJs(standaloneRaw);
const writes = stripJs(read('src/lib/standaloneMeetingWrites.js'));
const appRaw = read('src/App.jsx');
const appCode = stripJs(appRaw);
const homeMeetingRaw = read('src/screens/HomeMeetingScreen.jsx');
const homeMeeting = stripJs(homeMeetingRaw);
const dsar = stripJs(read('src/lib/dsarCompile.js'));
const employeeFileRaw = read('src/lib/employeeFile.js');
const prepScreen = stripJs(read('src/screens/PrepScreen.jsx'));
const employeeFile = stripJs(employeeFileRaw);

// Slices out one named constraint's own definition. Asserting that a constraint
// NAME appears proves nothing: `check (true)` under the right name passes. The
// predicate is the thing.
const constraintDef = name => {
  const i = migrationCode.indexOf(`add constraint ${name}`);
  if (i < 0) return '';
  return migrationCode.slice(i, migrationCode.indexOf(';', i));
};

const ORG = 'org-1';
const CREATOR = 'user-1';
const JOHN = 'emp-john';

describe('E2 — the parentage vocabulary', () => {
  it('names exactly three kinds, matching the database CHECK', () => {
    expect(Object.values(MEETING_SUBJECT_KIND).sort())
      .toEqual(['employee', 'legacy_unreconciled', 'process_witness']);
    ['employee', 'process_witness', 'legacy_unreconciled'].forEach(kind => {
      expect(migrationCode).toContain(`'${kind}'`);
    });
  });

  it('only an employee-owned meeting with an id is employee-owned', () => {
    expect(isEmployeeOwnedMeeting({ subjectKind: 'employee', employeeId: JOHN })).toBe(true);
    // The witness case, which is the whole point.
    expect(isEmployeeOwnedMeeting({ subjectKind: 'process_witness', employeeId: null })).toBe(false);
    expect(isEmployeeOwnedMeeting({ subjectKind: 'legacy_unreconciled', employeeId: null })).toBe(false);
    // A name is never enough, however complete it looks.
    expect(isEmployeeOwnedMeeting({ subjectKind: 'employee', employeeId: null, employeeName: 'John Smith' })).toBe(false);
  });
});

describe('E2 — no loose meetings', () => {
  const base = { meetingTypeId: 'informal', orgId: ORG, createdBy: CREATOR };

  it('an employee meeting is refused without a canonical employee', () => {
    const plan = planStandaloneCreate({ ...base, subjectKind: MEETING_SUBJECT_KIND.EMPLOYEE });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe(STANDALONE_REFUSAL.EMPLOYEE_REQUIRED);
  });

  it('a typed name is not an employee', () => {
    const plan = planStandaloneCreate({
      ...base, subjectKind: MEETING_SUBJECT_KIND.EMPLOYEE, employeeId: '   ',
    });
    expect(plan.ok).toBe(false);
  });

  it('stating no parentage at all is refused, not defaulted', () => {
    expect(planStandaloneCreate({ ...base }).reason).toBe(STANDALONE_REFUSAL.PARENTAGE_REQUIRED);
    // And LEGACY is not selectable: it describes what already exists, and a
    // create path that could choose it would recreate loose meetings.
    expect(planStandaloneCreate({ ...base, subjectKind: MEETING_SUBJECT_KIND.LEGACY }).ok).toBe(false);
  });

  it('a row built without a stated kind falls to the DEFAULT the policy forbids', () => {
    // The failure mode of forgetting is a REFUSED WRITE, not a loose meeting.
    const row = newStandaloneMeetingRow({ id: 'm1', orgId: ORG, createdBy: CREATOR, meetingTypeId: 'informal' });
    expect(row.subject_kind).toBeUndefined();
    expect(migrationCode).toMatch(/subject_kind text not null default 'legacy_unreconciled'/);
    const insert = migrationCode.slice(migrationCode.indexOf('for insert'));
    expect(insert).toMatch(/subject_kind in \('employee', 'process_witness'\)/);
    expect(insert).not.toContain("'legacy_unreconciled'");
  });

  it('the employee meeting carries the id, and the name is only a snapshot', () => {
    const plan = planStandaloneCreate({ ...base, subjectKind: MEETING_SUBJECT_KIND.EMPLOYEE, employeeId: JOHN });
    expect(plan.ok).toBe(true);
    const row = newStandaloneMeetingRow({
      id: 'm1', orgId: ORG, createdBy: CREATOR, meetingTypeId: 'informal',
      subjectKind: plan.subjectKind, employeeId: plan.employeeId, employeeName: 'John Smith',
    });
    expect(row.employee_id).toBe(JOHN);
    expect(row.subject_kind).toBe('employee');
    expect(row.witness).toBeNull();
  });
});

describe('E2 — a witness is a participant, never an owner', () => {
  const base = { meetingTypeId: 'investigation', orgId: ORG, createdBy: CREATOR };

  it('a witness interview owns no Employee File', () => {
    const plan = planStandaloneCreate({
      ...base, subjectKind: MEETING_SUBJECT_KIND.PROCESS_WITNESS, witness: { name: 'Emma Brown' },
    });
    expect(plan.ok).toBe(true);
    expect(plan.employeeId).toBeNull();
  });

  it('ownership and participation cannot arrive together', () => {
    const plan = planStandaloneCreate({
      ...base, subjectKind: MEETING_SUBJECT_KIND.PROCESS_WITNESS,
      witness: { name: 'Emma Brown' }, employeeId: 'emp-emma',
    });
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe(STANDALONE_REFUSAL.PARENTAGE_REQUIRED);
  });

  it('a witness meeting must say who was interviewed', () => {
    expect(planStandaloneCreate({ ...base, subjectKind: MEETING_SUBJECT_KIND.PROCESS_WITNESS }).reason)
      .toBe(STANDALONE_REFUSAL.WITNESS_REQUIRED);
    expect(planStandaloneCreate({
      ...base, subjectKind: MEETING_SUBJECT_KIND.PROCESS_WITNESS, witness: { name: '  ' },
    }).reason).toBe(STANDALONE_REFUSAL.WITNESS_REQUIRED);
  });

  it('an EXTERNAL witness needs no employee record — no fake employees', () => {
    const plan = planStandaloneCreate({
      ...base, subjectKind: MEETING_SUBJECT_KIND.PROCESS_WITNESS,
      witness: { name: 'External Contractor', external: true },
    });
    expect(plan.ok).toBe(true);
    expect(plan.employeeId).toBeNull();
    // Nothing anywhere creates an employee to hold a witness's name.
    expect(appCode).not.toMatch(/witness[\s\S]{0,120}(createEmployee|upsertEmployee)/i);
  });

  it('the database makes the witness exception a CHECK, not a convention', () => {
    // Scoped to each constraint's own predicate: `check (true)` under the right
    // name would otherwise satisfy a name-only assertion.
    const shape = constraintDef('meetings_parentage_shape');
    expect(shape).toMatch(/subject_kind = 'employee'\s+and employee_id is not null/);
    expect(shape).toMatch(/subject_kind = 'process_witness'\s+and employee_id is null/);
    expect(shape).toMatch(/subject_kind = 'legacy_unreconciled'\s+and employee_id is null/);

    // A witness meeting must name who was interviewed...
    const identified = constraintDef('meetings_witness_identified');
    expect(identified).toMatch(/witness is not null/);
    expect(identified).toMatch(/btrim\(witness->>'name'\)/);
    expect(identified).not.toMatch(/or true/);

    // ...and witness identity may not ride along on an employee-owned meeting.
    const onlyWitness = constraintDef('meetings_witness_only_on_witness_meeting');
    expect(onlyWitness).toMatch(/subject_kind = 'process_witness' or witness is null/);
    expect(onlyWitness).not.toMatch(/check \(true\)/);

    // And the INSERT policy enforces the same shape independently.
    const insert = migrationCode.slice(migrationCode.indexOf('for insert'), migrationCode.indexOf('for select'));
    expect(insert).toMatch(/subject_kind = 'employee'\s+and employee_id is not null/);
    // BOTH arms. The CHECK constraint would still refuse a witness meeting that
    // claimed ownership, but the policy is the layer a hand-rolled request meets
    // first and it must not be the weaker statement of the same rule.
    expect(insert).toMatch(/subject_kind = 'process_witness' and employee_id is null/);
    expect(insert).not.toMatch(/or true/);
  });

  it('the UI asks a different question when it is a witness interview', () => {
    // The single overloaded field is gone: the labels are no longer a ternary on
    // the same input, they are two different inputs collecting two different
    // things.
    expect(homeMeeting).not.toMatch(/linkedCaseId\?"Witness name":"Employee name"/);
    expect(homeMeeting).toContain('meeting-witness-name');
    expect(homeMeetingRaw).toMatch(/Who is this meeting with\?/);
    // And it says where the interview lands, because that is the user's
    // misconception to prevent.
    expect(homeMeeting).toMatch(/will not appear on their Employee File/);
    expect(homeMeeting).toMatch(/do not need to be an employee/i);
  });

  it('the witness path explicitly nulls the subject', () => {
    // The DERIVATION, not just the branches: a meeting reached with a case in
    // mind IS the witness interview, and hard-coding that false would quietly
    // make every witness interview employee-owned.
    expect(appCode).toMatch(/const isWitnessInterview = !!linkedCaseId;/);
    expect(appCode).toMatch(/PROCESS_WITNESS\s*\n?\s*: MEETING_SUBJECT_KIND\.EMPLOYEE/);
    // The form branches on the same fact.
    expect(homeMeeting).toMatch(/\{meetingSetup\.linkedCaseId \? \(/);
    expect(appCode).toMatch(/employeeId: isWitnessInterview \? null : employeeId/);
    expect(appCode).toMatch(/witness: isWitnessInterview \? \{ name: \(employee \|\| ""\)\.trim\(\) \} : null/);
    expect(homeMeeting).toMatch(/employeeId:meetingSetup\.linkedCaseId\?null:/);
  });
});

describe('E2 — identity is a uuid, never a name', () => {
  it('the create path takes an id and the form cannot type one', () => {
    // HomeMeetingScreen used a free-text input with a datalist built from case
    // subject names. The canonical selector returns a uuid and selects nothing on
    // typing alone.
    expect(homeMeeting).toContain('EmployeeSelect');
    expect(homeMeeting).not.toContain('datalist');
    expect(homeMeeting).not.toContain('employee-list');
  });

  it('the last name-equality read in an active screen is gone', () => {
    expect(homeMeeting).not.toMatch(/cs\.employeeName===meetingSetup\.employee/);
    // Replaced by identity, with NO name fallback.
    expect(homeMeeting).toMatch(/cs\.employeeId===meetingSetup\.employeeId/);
  });

  it('Start is disabled until parentage exists, per path', () => {
    expect(homeMeeting).toMatch(/parentageMissing = meetingSetup\.linkedCaseId/);
    expect(homeMeeting).toMatch(/: !meetingSetup\.employeeId;/);
  });

  it('cross-organisation parentage is unstorable, not merely refused', () => {
    expect(migrationCode).toMatch(
      /foreign key \(employee_id, org_id\)\s+references public\.employee_records\(id, org_id\)/
    );
  });

  it('employee_name is documented as a snapshot and not authority', () => {
    expect(migration).toMatch(/HISTORICAL\/DISPLAY SNAPSHOT ONLY/);
    expect(standaloneRaw).toMatch(/employeeName is a DISPLAY SNAPSHOT and not identity/);
  });

  it('discovery can tell whose meeting it is without reading a name', () => {
    expect(DISCOVERY_COLUMNS).toContain('employee_id');
    expect(DISCOVERY_COLUMNS).toContain('subject_kind');
    // Needed so a surface can separate a witness interview from an employee's
    // own meeting BEFORE deciding where to show it.
    expect(DISCOVERY_COLUMNS).toContain('witness');
    // Still no meeting CONTENT in discovery.
    ['transcript', 'record', 'review_draft', 'advisor_notes', 'summary'].forEach(c => {
      expect(DISCOVERY_COLUMNS).not.toContain(c);
    });
  });

  it('the mapping reads identity from the COLUMN, with no snapshot fallback', () => {
    const mapping = standalone.slice(standalone.indexOf('export function meetingRowToObject'), standalone.indexOf('export function newStandaloneMeetingRow'));
    expect(mapping).toMatch(/employeeId: row\.employee_id \?\? null,/);
    // An employeeSnapshot fallback would make a NAME the identity again.
    expect(mapping).not.toMatch(/employee_snapshot/);
    expect(mapping).not.toMatch(/employeeSnapshot/);
    // A row with no canonical employee stays null rather than borrowing a name.
    expect(meetingRowToObject({ id: 'm', employee_name: 'John Smith', subject_kind: 'legacy_unreconciled' }).employeeId).toBeNull();
  });

  it('the row mapping exposes parentage to the app', () => {
    const obj = meetingRowToObject({
      id: 'm1', org_id: ORG, subject_kind: 'employee', employee_id: JOHN,
      witness: null, employee_name: 'John Smith', status: 'in_progress',
    });
    expect(obj.employeeId).toBe(JOHN);
    expect(obj.subjectKind).toBe('employee');
  });
});

describe('E2 — every creation route can establish identity', () => {
  it('PrepScreen no longer collects the employee as free text', () => {
    // It has its own "Start meeting", so it is a creation route. Collecting a
    // name there left employeeId pointing at whoever was selected earlier while
    // the snapshot said something else — and a visitor with no canonical employee
    // could type a name, press Start, and be refused with no way to put it right.
    expect(prepScreen).not.toMatch(/placeholder="e\.g\. Sarah Johnson" value=\{caseInfo\.employee\}/);
    expect(prepScreen).not.toMatch(/setCaseInfo\(p=>\(\{\.\.\.p,employee:e\.target\.value\}\)\)/);
    expect(prepScreen).toContain('EmployeeSelect');
    // Known employee: show who, and do not ask again.
    expect(prepScreen).toMatch(/caseInfo\.employeeId \?/);
  });

  it('the standalone write refuses rather than trusting the screen', () => {
    // Both doors. The UI disables Start, and the handler still checks.
    expect(appCode).toMatch(/if \(!isWitnessInterview && !employeeId\)/);
    expect(appCode).toMatch(/STANDALONE_FAILURE\.EMPLOYEE_REQUIRED/);
  });
});

describe('E2 — parentage immutability', () => {
  it('the kind of parentage can never change', () => {
    expect(migrationCode).toMatch(/new\.subject_kind is distinct from old\.subject_kind/);
    expect(migration).toMatch(/cannot change what kind of parentage it has/);
  });

  it('a meeting that has begun cannot be reparented', () => {
    expect(migrationCode).toMatch(
      /new\.employee_id is distinct from old\.employee_id\s+and old\.status <> 'scheduled'/
    );
    expect(migration).toMatch(/already begun and cannot be reparented/);
  });

  it('parentage is not patchable from the application at all', () => {
    // The patch allow-list is the second, structural half: even before the guard
    // is consulted, no patch can express a change of employee or kind.
    const patchable = standalone.slice(standalone.indexOf('const PATCHABLE'), standalone.indexOf('export function meetingPatchToRow'));
    expect(patchable).not.toContain('employeeId');
    expect(patchable).not.toContain('subjectKind');
    expect(patchable).not.toContain('witness');
  });

  it('a subject meeting cannot be linked to a case about someone else', () => {
    expect(migrationCode).toMatch(/case_employee <> new\.employee_id/);
    expect(migration).toMatch(/case about a different employee/);
  });

  it('every pre-E2 guard rule survives', () => {
    // A guard that loses a clause during a rewrite is the failure mode here.
    [
      /if new\.case_id is not null then\s*\n\s*raise exception 'A meeting cannot be created already linked to a case/,
      /A meeting id cannot be changed/,
      /A meeting cannot move between organisations/,
      /created_by\/created_at are immutable/,
      /cannot be returned to standalone/,
      /cannot be moved between cases/,
      /Link provenance is immutable once set/,
    ].forEach(rule => expect(migration).toMatch(rule));
  });
});

describe('E2 — access follows the parent, and authorship is not a parent', () => {
  it('an employee-owned meeting is bounded by Employee File access', () => {
    const fn = migrationCode.slice(
      migrationCode.indexOf('function public.can_access_employee_owned_meeting'),
      migrationCode.indexOf('grant execute on function public.can_access_employee_owned_meeting')
    );
    // The upper bound is mandatory and outside the OR list.
    expect(fn).toMatch(/can_access_employee\(p_org_id, public\.effective_employee_location\(p_employee_id\)\)\s+and \(/);
    // Effective location, so a pending transfer does not move meeting access
    // early — the E1.7/E1.7A rule, reused rather than re-derived.
    expect(fn).toContain('effective_employee_location');
    // An authorised Location Manager is in the capability list...
    expect(fn).toContain('is_location_manager_for');
    // ...and no role beyond HR / creator / chair / authorised LM was added.
    expect(fn).not.toContain('auditor');
    expect(fn).not.toContain('line_manager');
  });

  it('case-linked meetings still follow CASE access, untouched', () => {
    // Formal process confidentiality is not weakened because it is not touched.
    expect(migrationCode).not.toMatch(/drop policy[^\n]*Case-linked meetings/);
    expect(migration).toMatch(/DELIBERATELY UNTOUCHED/);
  });

  it('a witness interview does not fall back to an employee boundary', () => {
    // Its only employee identity is the witness's, so inheriting an employee
    // boundary from it would be exactly backwards.
    const sel = migrationCode.slice(migrationCode.indexOf('for select to authenticated'));
    expect(sel).toMatch(/when 'process_witness' then\s+public\.can_access_standalone_meeting/);
  });

  it('the pre-E2 rule let the creator keep access forever', () => {
    // Recorded so the change is legible: this is why the employee bound exists.
    expect(migration).toMatch(/permanent access path/i);
  });
});

describe('E2 — DSAR', () => {
  const compile = (standaloneMeetings, canonicalEmployeeId = JOHN) =>
    compileSubjectData('John Smith', { canonicalEmployeeId, standaloneMeetings });

  it('includes the subject\'s own meeting, by id', () => {
    const out = compile([
      { id: 'm1', subjectKind: 'employee', employeeId: JOHN, employeeName: 'John Smith', transcript: [] },
    ]);
    expect(out.standaloneMeetings.map(m => m.id)).toEqual(['m1']);
    expect(out.identityBasisByCollection.standaloneMeetings).toBe('employee_id');
  });

  it('excludes a same-named OTHER employee\'s meeting', () => {
    const out = compile([
      { id: 'm-other', subjectKind: 'employee', employeeId: 'emp-other-john', employeeName: 'John Smith', transcript: [] },
    ]);
    expect(out.standaloneMeetings).toEqual([]);
  });

  it('does NOT treat a witness interview as the witness\'s own record', () => {
    // The defect: a witness interview stored the WITNESS in employee_name, so a
    // DSAR by that witness returned someone else's investigation as their own.
    const out = compile([
      { id: 'm-wit', subjectKind: 'process_witness', employeeId: null,
        employeeName: 'John Smith', witness: { name: 'John Smith' }, transcript: [] },
    ]);
    expect(out.standaloneMeetings).toEqual([]);
    expect(out.standaloneMeetingsDisposition.witnessInterviewsExcluded).toBe(1);
    expect(out.standaloneMeetingsDisposition.excludedCount).toBe(1);
  });

  it('a witness interview naming the subject is still reported, not silently dropped', () => {
    // It must not fall out of BOTH the owned set and the third-party scan.
    const out = compile([
      { id: 'm-wit', subjectKind: 'process_witness', employeeId: null,
        employeeName: 'John Smith', witness: { name: 'Someone Else' },
        record: 'John Smith was described as present.', transcript: [] },
    ]);
    expect(out.standaloneMeetings).toEqual([]);
    const flagged = JSON.stringify(out.subjectMentionsAsThirdParty || []);
    expect(flagged).toContain('m-wit');
  });

  it('an employee-owned meeting is never claimed by name', () => {
    // With no canonical id for the subject we cannot know the meeting is theirs.
    // An employee-owned row ALWAYS has an id, so a name fallback here could only
    // ever attach one employee's meeting to another's package.
    const out = compile([
      { id: 'm1', subjectKind: 'employee', employeeId: JOHN, employeeName: 'John Smith', transcript: [] },
    ], null);
    expect(out.standaloneMeetings).toEqual([]);
    expect(out.standaloneMeetingsDisposition.canonicallyAttributable).toBe(false);
  });

  it('a legacy pre-E2 row keeps the historical name behaviour', () => {
    const out = compile([
      { id: 'm-legacy', subjectKind: 'legacy_unreconciled', employeeId: null, employeeName: 'John Smith', transcript: [] },
    ]);
    expect(out.standaloneMeetings.map(m => m.id)).toEqual(['m-legacy']);
    expect(out.standaloneMeetingsDisposition.legacyUnreconciled).toBe(1);
  });

  it('never matches a meeting by name when identity exists', () => {
    expect(dsar).not.toMatch(/standaloneMeetings\.filter\(m => nameMatchesSubject\(m\?\.employeeName\)\)/);
    expect(dsar).toMatch(/isSubjectsOwnStandaloneMeeting/);
    // The third-party mirror uses the exact complement of the owned set.
    expect(dsar).toMatch(/standaloneMeetings\.filter\(m => !isSubjectsOwnStandaloneMeeting\(m\)\)/);
    expect(dsar).not.toMatch(/m\?\.employeeName !== employeeName/);
  });
});

describe('E2 — the Employee File prohibition', () => {
  it('a witness interview cannot appear on the witness\'s file, structurally', () => {
    // Not a display rule: the row carries no employee_id, so no projection keyed
    // on the employee can reach it.
    expect(migrationCode).toMatch(/subject_kind = 'process_witness'\s+and employee_id is null/);
    expect(employeeFileRaw).toMatch(/WITNESS INTERVIEW can never/);
  });

  it('the Employee File still reaches meetings only through the case', () => {
    expect(employeeFileRaw).toMatch(/Meetings are reached THROUGH the case/);
    expect(employeeFile).not.toMatch(/standaloneMeetings/);
    expect(employeeFile).not.toMatch(/subjectKind/);
  });
});

describe('E2 — preserved production state', () => {
  it('no employee_id is backfilled anywhere in the migration', () => {
    expect(migrationCode).not.toMatch(/update public\.meetings/i);
    expect(migrationCode).not.toMatch(/set employee_id/i);
    // And certainly not from a name or a snapshot.
    expect(migrationCode).not.toMatch(/employee_name\s*=\s*er\.name/i);
    expect(migrationCode).not.toMatch(/employeeSnapshot/);
  });

  it('the two preserved UAT rows become legacy, owned by nobody', () => {
    expect(migrationCode).toMatch(/default 'legacy_unreconciled'/);
    expect(migration).toMatch(/preserved/i);
  });

  it('the jsonb formal-meeting domain is not restructured', () => {
    // `cases.meetings` DOES appear, inside a pre-E2 error message this migration
    // preserves verbatim, so its presence proves nothing. What matters is that no
    // statement reads, rewrites or migrates the jsonb.
    expect(migrationCode).not.toMatch(/jsonb_array_elements/);
    expect(migrationCode).not.toMatch(/alter table public\.cases/i);
    expect(migrationCode).not.toMatch(/update public\.cases/i);
    expect(migration).toMatch(/890/);
  });

  it('nothing else is touched', () => {
    ['employee_activities', 'employee_employment_events', 'leaver_instances'].forEach(t => {
      expect(migrationCode).not.toMatch(new RegExp(`(update|delete from|alter table)\\s+public\\.${t}`, 'i'));
    });
    expect(migrationCode).not.toMatch(/drop policy[^\n]*on public\.cases/);
  });

  it('the meeting type model is not invented into', () => {
    // 1:1 is already representable as 'informal'. No organisation-level meeting
    // type is encoded before those process domains exist (AD-001).
    const types = migrationCode.match(/array\['informal', 'return', 'investigation'\]/g) || [];
    expect(types.length).toBeGreaterThan(0);
    ['whistleblow', 'redundancy', 'grievance', 'capability', 'attendance'].forEach(t => {
      expect(migrationCode).not.toContain(t);
    });
  });

  it('no new sensitive meeting cache is introduced', () => {
    // E1.5B recorded compass_meeting_draft as existing debt. E2 must not add to it.
    const newKeys = (appCode.match(/orgLsSet\("compass_meeting_[a-z_]*"/g) || []);
    expect([...new Set(newKeys)]).toEqual(['orgLsSet("compass_meeting_draft"']);
    expect(appCode).not.toMatch(/orgLsSet\("compass_meetings?"/);
  });
});

describe('E2 — the live meeting product is unchanged', () => {
  it('Start is still idempotent on the same id', () => {
    // The CONDITION, not the constant: `if (false)` leaves both names in place
    // and silently reintroduces the duplicate-meeting bug NEW-45 fixed.
    expect(writes).toMatch(/if \(error\.code === PG_UNIQUE_VIOLATION\)/);
    expect(writes).toMatch(/outcome: STANDALONE_WRITE\.ALREADY_EXISTS/);
  });

  it('started_at is still unreachable by any patch', () => {
    const patchable = standalone.slice(standalone.indexOf('const PATCHABLE'), standalone.indexOf('export function meetingPatchToRow'));
    expect(patchable).not.toContain('startedAt');
  });

  it('the single insert remains the single insert', () => {
    expect((writes.match(/\.insert\(/g) || []).length).toBe(1);
    // And no surface talks to the table directly.
    ['src/App.jsx', 'src/screens/HomeMeetingScreen.jsx'].forEach(p => {
      expect(read(p)).not.toContain("from('meetings')");
    });
  });
});
