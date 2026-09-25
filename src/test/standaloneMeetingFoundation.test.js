import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isStandaloneEligible, STANDALONE_ELIGIBLE_TYPE_IDS, STANDALONE_REFUSAL,
  planStandaloneCreate, meetingRowToObject, newStandaloneMeetingRow,
  meetingPatchToRow, linkToCaseRow, TABLE_HOME,
} from '../lib/standaloneMeetings.js';
import {
  MEETING_HOME, meetingHome, isTableResident, partitionByHome,
  meetingsForCase, allKnownMeetings, assertNoTableResident,
  caseForPersistence, TableResidentInCaseError,
} from '../lib/meetingStore.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';
import { ORG_SCOPED_TABLES } from '../lib/dataInventory.js';
import { compileSubjectData } from '../lib/dsarCompile.js';
import { MEETING_TYPES } from '../constants.js';

// Phase 4C.1 — standalone meeting persistence + security foundation.
//
// Covers supabase/standalone_meetings_2026-09-25.sql, lib/standaloneMeetings.js,
// lib/meetingStore.js and the DSAR/erasure/platform-admin registrations.
//
// Two kinds of proof live here, and the distinction matters:
//
//   * PURE-JS MIRRORS of the SQL trigger and RLS predicates, tested
//     exhaustively. Defined only in this file, not exported, not added to any
//     production module — the same approach as appealHearingChairIntegrity.test.js.
//     These catch a rule being changed in the migration without the intended
//     behaviour being thought through.
//
//   * SQL TEXT assertions against the migration, which protect the actual
//     deployed rules from being quietly weakened.
//
// Neither can prove RLS actually behaves as written — only the database can do
// that. Those proofs were run as rolled-back transactions against production
// (recorded in the 4C.1 report); a unit test on a predicate proves nothing about
// the policy unless the policy is what evaluates it.

const sql = readFileSync('supabase/standalone_meetings_2026-09-25.sql', 'utf8');
// The header deliberately names the things this migration must NOT do, so
// prohibitions are asserted against executable SQL only.
const sqlCode = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

const ORG_A = 'dbe871c5-e6fe-45d8-8bc4-201e487579be';
const ORG_B = 'f381bfa6-7b27-497f-9af7-46a82c8f8f4c';
const HR = 'f2851899-4608-4f8c-b63e-02b2dc418876';
const MANAGER = '11111111-1111-4111-8111-111111111111';
const OTHER_MANAGER = '22222222-2222-4222-8222-222222222222';

// ── Mirror of public.can_access_standalone_meeting ─────────────────────────
// Every branch requires membership of the meeting's own org, which is what makes
// tenancy independent of the access reason.
function canAccessStandalone({ orgId, createdBy, chairUserId }, viewer, members) {
  const membership = members.find(m => m.orgId === orgId && m.userId === viewer);
  if (!membership) return false;
  return membership.role === 'hr_director' || membership.role === 'hr_manager'
    || viewer === createdBy || viewer === chairUserId;
}

// ── Mirror of public.meetings_parentage_guard ──────────────────────────────
function parentageGuard(op, oldRow, newRow, { caseOrgById = {} } = {}) {
  if (op === 'INSERT') {
    if (newRow.caseId != null) return { ok: false, error: 'born_linked' };
    return { ok: true, row: { ...newRow, linkedAt: null, linkedBy: null } };
  }
  if (newRow.id !== oldRow.id) return { ok: false, error: 'id_changed' };
  if (newRow.orgId !== oldRow.orgId) return { ok: false, error: 'org_changed' };
  if (newRow.createdBy !== oldRow.createdBy) return { ok: false, error: 'creator_changed' };

  if (oldRow.caseId == null && newRow.caseId != null) {
    const targetOrg = caseOrgById[newRow.caseId];
    if (targetOrg === undefined) return { ok: false, error: 'case_missing' };
    if (targetOrg !== newRow.orgId) return { ok: false, error: 'cross_org_link' };
    return { ok: true, row: { ...newRow, linkedAt: newRow.linkedAt ?? 'now', linkedBy: newRow.linkedBy ?? 'actor' } };
  }
  if (oldRow.caseId != null && newRow.caseId == null) return { ok: false, error: 'unlink_forbidden' };
  if (oldRow.caseId != null && newRow.caseId !== oldRow.caseId) return { ok: false, error: 'reparent_forbidden' };
  if (oldRow.caseId != null && (newRow.linkedAt !== oldRow.linkedAt || newRow.linkedBy !== oldRow.linkedBy)) {
    return { ok: false, error: 'link_provenance_immutable' };
  }
  return { ok: true, row: newRow };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('D. type eligibility — only the approved standalone set', () => {
  it('10/11/12. accepts informal, return and investigation', () => {
    ['informal', 'return', 'investigation'].forEach(id => {
      expect(isStandaloneEligible(id), id).toBe(true);
      expect(planStandaloneCreate({ meetingTypeId: id, orgId: ORG_A, createdBy: MANAGER }).ok, id).toBe(true);
    });
  });

  it('8. refuses every CASE_REQUIRED type, with that reason', () => {
    const required = ['disciplinary', 'appeal-disciplinary', 'appeal-grievance', 'appeal-dismissal',
      'redundancy-atrisk', 'redundancy-consult', 'redundancy-outcome', 'redundancy-appeal'];
    required.forEach(id => {
      const plan = planStandaloneCreate({ meetingTypeId: id, orgId: ORG_A, createdBy: MANAGER });
      expect(plan.ok, id).toBe(false);
      expect(plan.reason, id).toBe(STANDALONE_REFUSAL.CASE_REQUIRED);
    });
  });

  it('9. refuses every appeal type specifically — no appeal meeting may be born standalone', () => {
    MEETING_TYPES.filter(t => t.group === 'appeal').forEach(t => {
      expect(isStandaloneEligible(t.id), t.id).toBe(false);
      expect(STANDALONE_ELIGIBLE_TYPE_IDS).not.toContain(t.id);
    });
    // Belt and braces: nothing whose id merely mentions appeal slips through.
    STANDALONE_ELIGIBLE_TYPE_IDS.forEach(id => expect(id).not.toMatch(/appeal/i));
  });

  it('refuses DEFERRED types (formal, grievance) as not-yet-classified, NOT as case-required', () => {
    ['formal', 'grievance'].forEach(id => {
      const plan = planStandaloneCreate({ meetingTypeId: id, orgId: ORG_A, createdBy: MANAGER });
      expect(plan.ok, id).toBe(false);
      // The distinction is the whole point of Phase 4B's two messages: Compass
      // must not claim a type inherently needs a case when it has simply not
      // decided yet.
      expect(plan.reason, id).toBe(STANDALONE_REFUSAL.NOT_YET_CLASSIFIED);
    });
  });

  it('leaves the dev group ineligible and untouched (NEW-20 FULL)', () => {
    ['probation', 'appraisal', 'pip-review', 'pdp'].forEach(id => {
      expect(isStandaloneEligible(id), id).toBe(false);
    });
  });

  it('covers every registry type — no type is unclassified by omission', () => {
    MEETING_TYPES.forEach(t => {
      expect(typeof isStandaloneEligible(t.id), t.id).toBe('boolean');
    });
    expect(STANDALONE_ELIGIBLE_TYPE_IDS).toEqual(['informal', 'return', 'investigation']);
  });

  it('requires explicit org and creator — neither can be inherited from a case that does not exist', () => {
    expect(planStandaloneCreate({ meetingTypeId: 'informal', createdBy: MANAGER }).reason).toBe(STANDALONE_REFUSAL.ORG_REQUIRED);
    expect(planStandaloneCreate({ meetingTypeId: 'informal', orgId: ORG_A }).reason).toBe(STANDALONE_REFUSAL.CREATOR_REQUIRED);
    expect(planStandaloneCreate({}).reason).toBe(STANDALONE_REFUSAL.TYPE_REQUIRED);
  });

  it('the database CHECK encodes the SAME set as the JS gate', () => {
    expect(sqlCode).toContain("check (meeting_type_id in ('informal', 'return', 'investigation'))");
    // If the JS set ever grows, this fails until the migration grows with it —
    // the two cannot drift, which is the only real protection when SQL cannot
    // import JavaScript.
    STANDALONE_ELIGIBLE_TYPE_IDS.forEach(id => expect(sqlCode).toContain(`'${id}'`));
    ['disciplinary', 'appeal-disciplinary', 'redundancy-atrisk', 'probation'].forEach(id => {
      expect(sqlCode).not.toContain(`'${id}'`);
    });
  });

  it('persists the stable registry id, never the human label', () => {
    expect(sqlCode).toContain('meeting_type_id text not null');
    // Labels must not appear as database values anywhere in the schema.
    ['Informal / 1-1', 'Return to Work', 'Investigation', 'Disciplinary'].forEach(label => {
      expect(sqlCode).not.toContain(`'${label}'`);
    });
    const row = newStandaloneMeetingRow({ id: 'meeting_x', orgId: ORG_A, createdBy: MANAGER, meetingTypeId: 'informal' });
    expect(row.meeting_type_id).toBe('informal');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B/C. identity and the content model', () => {
  it('B. the primary key is TEXT, not uuid — 854 legacy ids are bare millis', () => {
    expect(sqlCode).toContain('id text primary key');
    expect(sqlCode).not.toMatch(/id uuid primary key/);
  });

  it('B. no row default mints an id — ids come from newId(\'meeting\') in the app', () => {
    // gen_random_uuid() as a default would produce a bare uuid with no
    // meeting_ prefix, silently diverging from every id the app creates.
    expect(sqlCode).not.toMatch(/id text primary key default/);
    expect(sqlCode).not.toContain('Date.now');
  });

  it('C. carries tenancy, parentage, creator and link provenance', () => {
    ['org_id uuid not null', 'case_id uuid references public.cases(id)',
      'created_by uuid not null', 'created_at timestamptz not null',
      'updated_at timestamptz not null', 'linked_at timestamptz', 'linked_by uuid',
    ].forEach(frag => expect(sqlCode).toContain(frag));
  });

  it('E. uses the existing lifecycle vocabulary and invents no sixth state', () => {
    expect(sqlCode).toContain("check (status in ('scheduled', 'in_progress', 'review_draft', 'completed', 'cancelled'))");
    const declared = Object.values(MEETING_STATUS);
    declared.forEach(s => expect(sqlCode).toContain(`'${s}'`));
    expect(declared).toHaveLength(5);
  });

  it('F. can hold every canonical field later phases need', () => {
    ['transcript jsonb', 'record text', 'summary text', 'risk jsonb', 'review_draft jsonb',
      'schedule jsonb', 'calendar jsonb', 'preparation jsonb', 'participants jsonb',
      'started_at timestamptz', 'ended_at timestamptz', 'advisor_notes text',
    ].forEach(frag => expect(sqlCode).toContain(frag));
  });

  it('F. does NOT fabricate an invitation field — the real model is a separate letter entry', () => {
    // The audit established that embedded `invitation` is initialised to null and
    // never written, and that invitation truth lives as a letterType:'invite'
    // entry. A tidier peer column here would be a model the app does not have.
    expect(sqlCode).not.toMatch(/^\s*invitation\s+jsonb/m);
    expect(sql).toContain('deliberately ABSENT');
    expect(sql).toContain('4C.4');
  });

  it('maps a row to a meeting object and marks its home', () => {
    const obj = meetingRowToObject({
      id: 'meeting_a', org_id: ORG_A, case_id: null, meeting_type_id: 'informal',
      status: 'completed', employee_name: 'Dana', transcript: [{ speaker: 'A', text: 'hi' }],
      record: 'r', created_by: MANAGER, created_at: 't0', updated_at: 't1',
    });
    expect(obj).toMatchObject({
      id: 'meeting_a', caseId: null, orgId: ORG_A, storageHome: TABLE_HOME,
      meetingTypeId: 'informal', status: 'completed', employeeName: 'Dana', record: 'r',
    });
    expect(obj.transcript).toHaveLength(1);
    expect(meetingRowToObject(null)).toBeNull();
  });

  it('the patch allow-list cannot be tricked into offering an immutable column', () => {
    const row = meetingPatchToRow({
      status: 'in_progress', record: 'x',
      id: 'hacked', orgId: ORG_B, caseId: 'some-case', createdBy: OTHER_MANAGER,
      createdAt: 'then', linkedAt: 'now', linkedBy: OTHER_MANAGER, org_id: ORG_B, case_id: 'c',
    });
    expect(row).toEqual({ status: 'in_progress', record: 'x' });
    ['id', 'org_id', 'case_id', 'created_by', 'created_at', 'linked_at', 'linked_by']
      .forEach(col => expect(row).not.toHaveProperty(col));
  });

  it('a link changes case_id and nothing else', () => {
    expect(linkToCaseRow('case-1')).toEqual({ case_id: 'case-1' });
    expect(Object.keys(linkToCaseRow('case-1'))).toEqual(['case_id']);
  });

  it('a new row never carries a case or link provenance', () => {
    const row = newStandaloneMeetingRow({ id: 'm1', orgId: ORG_A, createdBy: MANAGER, meetingTypeId: 'return' });
    expect(row).not.toHaveProperty('case_id');
    expect(row).not.toHaveProperty('linked_at');
    expect(row).not.toHaveProperty('linked_by');
    expect(row.status).toBe(MEETING_STATUS.SCHEDULED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('H. parentage immutability', () => {
  const caseOrgById = { 'case-A': ORG_A, 'case-A2': ORG_A, 'case-B': ORG_B };
  const base = { id: 'meeting_1', orgId: ORG_A, createdBy: MANAGER, caseId: null, linkedAt: null, linkedBy: null };

  it('13. NULL -> a permitted same-org case is allowed, and stamps provenance', () => {
    const r = parentageGuard('UPDATE', base, { ...base, caseId: 'case-A' }, { caseOrgById });
    expect(r.ok).toBe(true);
    expect(r.row.caseId).toBe('case-A');
    expect(r.row.linkedAt).toBeTruthy();
    expect(r.row.linkedBy).toBeTruthy();
  });

  it('14. case id -> NULL is rejected', () => {
    const linked = { ...base, caseId: 'case-A', linkedAt: 't', linkedBy: HR };
    expect(parentageGuard('UPDATE', linked, { ...linked, caseId: null }, { caseOrgById }))
      .toEqual({ ok: false, error: 'unlink_forbidden' });
  });

  it('15. case A -> case B is rejected, even within the same org', () => {
    const linked = { ...base, caseId: 'case-A', linkedAt: 't', linkedBy: HR };
    expect(parentageGuard('UPDATE', linked, { ...linked, caseId: 'case-A2' }, { caseOrgById }))
      .toEqual({ ok: false, error: 'reparent_forbidden' });
  });

  it('3. cross-organisation linking is rejected', () => {
    expect(parentageGuard('UPDATE', base, { ...base, caseId: 'case-B' }, { caseOrgById }))
      .toEqual({ ok: false, error: 'cross_org_link' });
  });

  it('rejects linking to a case that does not exist', () => {
    expect(parentageGuard('UPDATE', base, { ...base, caseId: 'nope' }, { caseOrgById }))
      .toEqual({ ok: false, error: 'case_missing' });
  });

  it('16. the meeting id survives the permitted fill unchanged', () => {
    const r = parentageGuard('UPDATE', base, { ...base, caseId: 'case-A' }, { caseOrgById });
    expect(r.row.id).toBe(base.id);
    expect(r.row.createdBy).toBe(base.createdBy);
    expect(r.row.orgId).toBe(base.orgId);
  });

  it('rejects any attempt to change id, org or creator', () => {
    expect(parentageGuard('UPDATE', base, { ...base, id: 'meeting_2' }, { caseOrgById }).error).toBe('id_changed');
    expect(parentageGuard('UPDATE', base, { ...base, orgId: ORG_B }, { caseOrgById }).error).toBe('org_changed');
    expect(parentageGuard('UPDATE', base, { ...base, createdBy: OTHER_MANAGER }, { caseOrgById }).error).toBe('creator_changed');
  });

  it('a meeting cannot be born already linked', () => {
    expect(parentageGuard('INSERT', null, { ...base, caseId: 'case-A' }, { caseOrgById }))
      .toEqual({ ok: false, error: 'born_linked' });
    expect(parentageGuard('INSERT', null, base, { caseOrgById }).ok).toBe(true);
  });

  it('link provenance is immutable once set', () => {
    const linked = { ...base, caseId: 'case-A', linkedAt: 't', linkedBy: HR };
    expect(parentageGuard('UPDATE', linked, { ...linked, linkedBy: OTHER_MANAGER }, { caseOrgById }).error)
      .toBe('link_provenance_immutable');
  });

  it('the migration enforces all three directions as a TRIGGER, not only in RLS', () => {
    // RLS is not evaluated for the table owner or the service role, so the
    // parentage contract has to be a trigger to be a guarantee.
    expect(sqlCode).toContain('create trigger meetings_parentage_guard_trg');
    expect(sqlCode).toContain('before insert or update on public.meetings');
    expect(sqlCode).toContain('cannot be returned to standalone');
    expect(sqlCode).toContain('cannot be moved between cases');
    expect(sqlCode).toContain('cannot be created already linked');
    expect(sqlCode).toContain('to a case in a different organisation');
  });

  it('I. delete behaviour cascades with the case and never silently unlinks', () => {
    expect(sqlCode).toContain('case_id uuid references public.cases(id) on delete cascade');
    expect(sqlCode).not.toMatch(/on delete set null/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. the RLS access model', () => {
  const members = [
    { orgId: ORG_A, userId: HR, role: 'hr_director' },
    { orgId: ORG_A, userId: MANAGER, role: 'manager' },
    { orgId: ORG_A, userId: OTHER_MANAGER, role: 'manager' },
    { orgId: ORG_B, userId: 'org-b-hr', role: 'hr_director' },
  ];
  const meeting = { orgId: ORG_A, createdBy: MANAGER, chairUserId: null };

  it('5/6. HR Director and HR Manager see standalone meetings across their org', () => {
    expect(canAccessStandalone(meeting, HR, members)).toBe(true);
    const withHrManager = [...members, { orgId: ORG_A, userId: 'hrm', role: 'hr_manager' }];
    expect(canAccessStandalone(meeting, 'hrm', withHrManager)).toBe(true);
  });

  it('4. an ordinary org member does NOT get access through org membership alone', () => {
    // The case_tasks caseless branch (`org_id IN my_org_ids()`) would return true
    // here. That is exactly the model this design rejects.
    expect(canAccessStandalone(meeting, OTHER_MANAGER, members)).toBe(false);
  });

  it('the creator and the chair see their own meeting', () => {
    expect(canAccessStandalone(meeting, MANAGER, members)).toBe(true);
    const chaired = { ...meeting, createdBy: OTHER_MANAGER, chairUserId: MANAGER };
    expect(canAccessStandalone(chaired, MANAGER, members)).toBe(true);
  });

  it('1. Org A cannot read Org B standalone meetings, by any route', () => {
    const orgBMeeting = { orgId: ORG_B, createdBy: 'org-b-manager', chairUserId: null };
    [HR, MANAGER, OTHER_MANAGER].forEach(v => {
      expect(canAccessStandalone(orgBMeeting, v, members), v).toBe(false);
    });
    // Even being the named creator does not help without membership of that org.
    expect(canAccessStandalone({ orgId: ORG_B, createdBy: MANAGER, chairUserId: null }, MANAGER, members)).toBe(false);
  });

  it('a non-member of any org sees nothing', () => {
    expect(canAccessStandalone(meeting, 'stranger', members)).toBe(false);
    expect(canAccessStandalone(meeting, null, members)).toBe(false);
  });

  it('being NAMED grants nothing — participants is never consulted', () => {
    // The predicate's signature cannot even see participants, which is the point:
    // there is no code path in which a name could confer access.
    expect(canAccessStandalone.length).toBe(3);
    const sqlPolicySection = sqlCode.slice(sqlCode.indexOf('can_access_standalone_meeting'));
    expect(sqlPolicySection).not.toContain('participants');
    expect(sqlPolicySection).not.toContain('employee_name');
    expect(sqlPolicySection).not.toContain('manager)');
  });

  it('uses explicit per-command policies and never FOR ALL', () => {
    expect(sqlCode).not.toMatch(/for all/i);
    ['for select', 'for insert', 'for update', 'for delete'].forEach(cmd => {
      expect(sqlCode).toContain(cmd);
    });
    expect(sqlCode).toContain('alter table public.meetings enable row level security');
  });

  it('every policy branch enforces org membership or org scope', () => {
    // No branch may rely on case access alone, or a cross-tenant case reference
    // would become a tenancy hole.
    const policyBlocks = sqlCode.split('create policy').slice(1);
    expect(policyBlocks.length).toBeGreaterThanOrEqual(6);
    policyBlocks.forEach(block => {
      const scoped = block.includes('can_access_standalone_meeting')
        || block.includes('my_org_ids()')
        || block.includes('om.org_id = meetings.org_id');
      expect(scoped, `policy without org scoping: ${block.slice(0, 80)}`).toBe(true);
    });
  });

  it('2. insert is constrained to the caller\'s own org and own creator id', () => {
    expect(sqlCode).toContain('created_by = auth.uid()');
    expect(sqlCode).toContain('org_id in (select public.my_org_ids())');
    expect(sqlCode).toContain('case_id is null\n    and linked_at is null');
  });

  it('the case-linked branch composes with case RLS and matches orgs', () => {
    expect(sqlCode).toContain('where c.id = meetings.case_id and c.org_id = meetings.org_id');
  });

  it('does NOT copy the broad caseless case_tasks model', () => {
    // case_tasks: (case_id IS NULL AND org_id IN (SELECT my_org_ids())).
    expect(sqlCode).not.toMatch(/case_id is null\s*\n?\s*and org_id in \(select public\.my_org_ids\(\)\)\s*\)/);
    expect(sql).toContain('deliberately NOT copied');
  });

  it('20. introduces no service-role content route', () => {
    // No policy grants service_role, and no api/ route touches the table. The
    // only SECURITY DEFINER functions are the RLS helpers, which is the
    // established pattern (my_org_ids is itself SECURITY DEFINER) — they read
    // org_members on the caller's behalf and return a boolean, never content.
    expect(sqlCode).not.toMatch(/service_role/i);
    expect(sqlCode).not.toMatch(/grant .* on public\.meetings/i);
    const definerFns = sqlCode.match(/create or replace function[\s\S]*?\$\$/g) || [];
    expect(definerFns).toHaveLength(2);
    definerFns.forEach(fn => expect(fn).toContain("set search_path to 'public'"));
  });

  it('20. no api/ route reads or writes the meetings table', () => {
    const apiFiles = ['api/chat.js', 'api/send-letter.js', 'api/send-for-signature.js',
      'api/signing.js', 'api/delete-member.js', 'api/_supabase.js'];
    apiFiles.forEach(path => {
      const code = readFileSync(path, 'utf8').split('\n')
        .filter(l => !l.trim().startsWith('//')).join('\n');
      expect(code, path).not.toMatch(/from\(['"]meetings['"]\)/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('L/21. one authoritative storage home', () => {
  const tableMeeting = { id: 'meeting_t', storageHome: TABLE_HOME, caseId: null };
  const linkedTableMeeting = { id: 'meeting_t2', storageHome: TABLE_HOME, caseId: 'case-1' };
  const embedded = { id: '1786221627942', record: 'legacy' };

  it('classifies by an explicit marker, never by the absence of a caseId', () => {
    expect(meetingHome(tableMeeting)).toBe(MEETING_HOME.TABLE);
    expect(meetingHome(embedded)).toBe(MEETING_HOME.EMBEDDED);
    // 884 legacy meetings have no caseId at all. Inferring "no caseId therefore
    // standalone" would misclassify every one of them.
    expect(meetingHome({ id: 'x' })).toBe(MEETING_HOME.EMBEDDED);
    expect(meetingHome(null)).toBeNull();
    expect(meetingHome([])).toBeNull();
    expect(isTableResident(tableMeeting)).toBe(true);
    expect(isTableResident(embedded)).toBe(false);
    // A meeting carrying a caseId is still embedded unless it says otherwise —
    // parentage and storage home are independent facts.
    expect(isTableResident({ id: 'x', caseId: 'case-1' })).toBe(false);
  });

  it('21. the persistence guard THROWS on a table-resident meeting', () => {
    expect(() => assertNoTableResident([embedded, tableMeeting])).toThrow(TableResidentInCaseError);
    expect(() => assertNoTableResident([embedded, tableMeeting])).toThrow(/meeting_t/);
    expect(() => assertNoTableResident([embedded])).not.toThrow();
    expect(() => assertNoTableResident([])).not.toThrow();
    expect(() => assertNoTableResident(undefined)).not.toThrow();
  });

  it('21. caseForPersistence strips a table-resident meeting before it can be written', () => {
    const contaminated = { id: 'case-1', meetings: [embedded, tableMeeting, linkedTableMeeting] };
    const safe = caseForPersistence(contaminated);
    expect(safe.meetings).toEqual([embedded]);
    expect(() => assertNoTableResident(safe.meetings)).not.toThrow();
    // The original is never mutated.
    expect(contaminated.meetings).toHaveLength(3);
  });

  it('returns the identical reference when there is nothing to strip', () => {
    // Every case in production today has only embedded meetings, so this must be
    // free and must change nothing.
    const clean = { id: 'case-1', meetings: [embedded] };
    expect(caseForPersistence(clean)).toBe(clean);
    expect(caseForPersistence({ id: 'c', meetings: [] })).toEqual({ id: 'c', meetings: [] });
    expect(caseForPersistence(null)).toBeNull();
  });

  it('the union is a separate list and is never assigned to case.meetings', () => {
    const caseObj = { id: 'case-1', meetings: [embedded] };
    const combined = meetingsForCase(caseObj, [linkedTableMeeting, tableMeeting]);
    expect(combined).toHaveLength(2);
    expect(combined[0]).toBe(embedded);               // embedded order preserved
    expect(combined[1]).toBe(linkedTableMeeting);     // only the one linked to THIS case
    // The case object is untouched — the union cannot leak back into the column.
    expect(caseObj.meetings).toEqual([embedded]);
  });

  it('partitions a mixed list without mutating it', () => {
    const list = [embedded, tableMeeting];
    const { embedded: e, table: t } = partitionByHome(list);
    expect(e).toEqual([embedded]);
    expect(t).toEqual([tableMeeting]);
    expect(list).toHaveLength(2);
  });

  it('allKnownMeetings covers both homes and backfills caseId for embedded rows', () => {
    const cases = [{ id: 'case-1', meetings: [embedded] }, { id: 'case-2', meetings: [] }];
    const all = allKnownMeetings(cases, [tableMeeting]);
    expect(all).toHaveLength(2);
    expect(all.find(m => m.id === embedded.id).caseId).toBe('case-1');
    expect(all.find(m => m.id === 'meeting_t').caseId).toBeNull();
    expect(allKnownMeetings()).toEqual([]);
  });

  it('the store module declares the invariant and forbids reconciliation', () => {
    const store = readFileSync('src/lib/meetingStore.js', 'utf8');
    expect(store).toContain('must NEVER contain a meeting whose authoritative home');
    expect(store).toContain('No dual-write');
    // The module must stay a rule, not a mechanism: no persistence, no network.
    const code = store.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    ['supabase', 'saveCases', 'await ', 'fetch('].forEach(f => expect(code).not.toContain(f));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('K/19. erasure and data inventory', () => {
  it('19. organisation erasure includes the new table', () => {
    expect(ORG_SCOPED_TABLES).toContain('meetings');
  });

  it('is actively deleted rather than left to the cases cascade', () => {
    // case_id is nullable, so the cases cascade reaches only linked meetings; a
    // genuinely standalone meeting would survive "Delete all data" forever.
    expect(sqlCode).toContain('case_id uuid references public.cases(id) on delete cascade');
    expect(ORG_SCOPED_TABLES.indexOf('meetings')).toBeGreaterThan(-1);
  });

  it('the renamed fossil is not registered — it has no org_id and holds nothing', () => {
    expect(ORG_SCOPED_TABLES).not.toContain('meetings_legacy_unused');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A. the fossil table is renamed, not dropped', () => {
  it('renames rather than drops, so the change is reversible', () => {
    expect(sqlCode).toContain('alter table public.meetings rename to meetings_legacy_unused');
    expect(sqlCode).not.toMatch(/drop table (if exists )?public\.meetings\b/);
  });

  it('documents a complete rollback including the rename back', () => {
    expect(sql).toContain('ROLLBACK');
    expect(sql).toContain('alter table public.meetings_legacy_unused rename to meetings');
    expect(sql).toContain('drop function if exists public.meetings_parentage_guard()');
    expect(sql).toContain('drop function if exists public.can_access_standalone_meeting(uuid, uuid, uuid)');
  });

  it('M. touches nothing about existing case-linked meetings', () => {
    // No migration of the 884, no rewrite of cases.meetings, no change to the
    // appeal-chair trigger on public.cases.
    expect(sqlCode).not.toMatch(/update public\.cases/i);
    expect(sqlCode).not.toMatch(/insert into public\.meetings\b/i);
    expect(sqlCode).not.toMatch(/alter table public\.cases/i);
    expect(sqlCode).not.toContain('appeal_hearing_chair');
    expect(sqlCode).not.toMatch(/jsonb_array_elements/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('N. DSAR includes standalone meeting content', () => {
  const standalone = [
    {
      id: 'meeting_s1', caseId: null, orgId: ORG_A, storageHome: TABLE_HOME,
      meetingTypeId: 'informal', employeeName: 'Dana Keys', status: 'completed',
      record: 'Dana raised workload. Priya Shah was mentioned as a comparator.',
      summary: 'Workload discussion.',
      transcript: [{ speaker: 'Manager', text: 'How are things?' }, { speaker: 'Dana Keys', text: 'Priya Shah has fewer cases.' }],
      schedule: { date: '2026-09-20' },
    },
    {
      id: 'meeting_s2', caseId: null, orgId: ORG_A, storageHome: TABLE_HOME,
      meetingTypeId: 'return', employeeName: 'Priya Shah', status: 'completed',
      record: 'Return to work. Dana Keys covered the workload during absence.',
      transcript: [], schedule: { date: '2026-09-21' },
    },
  ];
  const employeeRecords = [{ name: 'Dana Keys' }, { name: 'Priya Shah' }];

  it('includes the subject\'s own standalone meetings as a top-level category', () => {
    const out = compileSubjectData('Dana Keys', { standaloneMeetings: standalone, employeeRecords });
    expect(out.standaloneMeetings).toHaveLength(1);
    expect(out.standaloneMeetings[0].id).toBe('meeting_s1');
  });

  it('does NOT fold them into cases — they have no case, and pretending otherwise misreports the record', () => {
    const out = compileSubjectData('Dana Keys', { standaloneMeetings: standalone, employeeRecords });
    expect(out.cases).toEqual([]);
    expect(out).toHaveProperty('standaloneMeetings');
  });

  it('flags third parties named inside a standalone record and transcript', () => {
    const out = compileSubjectData('Dana Keys', { standaloneMeetings: standalone, employeeRecords });
    const flagged = out.flaggedThirdPartyMentions.filter(f => f.standalone);
    expect(flagged.length).toBeGreaterThanOrEqual(2);
    expect(flagged.map(f => f.field)).toContain('record');
    expect(flagged.some(f => f.field.startsWith('transcript['))).toBe(true);
    expect(flagged.every(f => f.meetingId === 'meeting_s1')).toBe(true);
    expect(flagged.every(f => f.mentionedName === 'Priya Shah')).toBe(true);
  });

  it('flags the subject named inside SOMEONE ELSE\'s standalone meeting as a third-party decision', () => {
    const out = compileSubjectData('Dana Keys', { standaloneMeetings: standalone, employeeRecords });
    const asThirdParty = out.subjectMentionsAsThirdParty.filter(f => f.standalone);
    expect(asThirdParty.some(f => f.meetingId === 'meeting_s2')).toBe(true);
    // Never auto-included: it stays a human review decision, matching this
    // compiler's established philosophy for other people's records.
    expect(out.standaloneMeetings.map(m => m.id)).not.toContain('meeting_s2');
  });

  it('is unchanged when no standalone meetings exist — the default is empty, not undefined', () => {
    const out = compileSubjectData('Dana Keys', { employeeRecords });
    expect(out.standaloneMeetings).toEqual([]);
    expect(out.flaggedThirdPartyMentions.filter(f => f.standalone)).toEqual([]);
  });

  it('records a date a reviewer can use to find the source', () => {
    const out = compileSubjectData('Dana Keys', { standaloneMeetings: standalone, employeeRecords });
    out.flaggedThirdPartyMentions.filter(f => f.standalone).forEach(f => {
      expect(f.date).toBe('2026-09-20');
      expect(f.meetingType).toBe('informal');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('J/7. platform-admin isolation', () => {
  it('7. meetings is named in the content prohibition', () => {
    const guard = readFileSync('api/_platformAdmin.js', 'utf8');
    expect(guard).toContain('meetings');
    expect(guard).toMatch(/never query cases[\s\S]{0,200}meetings/);
  });

  it('7. no platform-admin route queries the meetings table', () => {
    const routes = ['api/_platformAdmin.js', 'api/team/[...action].js', 'api/billing/[...action].js'];
    routes.forEach(path => {
      const src = readFileSync(path, 'utf8');
      const code = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect(code, path).not.toMatch(/from\(['"]meetings['"]\)/);
      expect(code, path).not.toMatch(/\bmeetings\?/);
    });
  });

  it('7. the RLS model grants platform admins nothing by construction', () => {
    // Every branch requires an org_members row for auth.uid(); platform admin
    // status is deliberately independent of org_members.
    expect(sqlCode).not.toContain('platform_admins');
    expect(sqlCode).toContain('om.user_id = auth.uid()');
  });
});
