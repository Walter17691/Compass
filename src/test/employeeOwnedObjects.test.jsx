import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileSubjectData } from '../lib/dsarCompile.js';

// Phase E0.6 Part B/C/D — canonical parentage for employee-owned objects.
//
// The load-bearing decision here is NOT which tables got employee_id. It is which
// ones deliberately did NOT, and why — because "we looked and decided no" is the
// part a future reader would otherwise have to rediscover from scratch.

const sql = readFileSync('supabase/employee_owned_objects_2026-09-26.sql', 'utf8');
const sqlCode = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const wellbeing = readFileSync('src/screens/WellbeingScreen.jsx', 'utf8');
const dsarScreen = readFileSync('src/screens/DsarScreen.jsx', 'utf8');
const review = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
const compile = readFileSync('src/lib/dsarCompile.js', 'utf8');

// Prose assertions run against a whitespace-normalised view. A rationale
// sentence in a comment wraps across lines, and asserting an exact substring
// against the wrapped form is brittle in a way that has nothing to do with the
// guarantee being defended.
// Comment MARKERS are stripped too, not just newlines: a sentence spanning two
// `--` lines contains "-- " in the middle, which defeats a plain substring match.
const prose = (t, marker) => t.split('\n')
  .map(l => l.replace(marker, ''))
  .join(' ').replace(/\s+/g, ' ').trim();
const sqlProse = prose(sql, /^\s*--\s?/);
const dsarProse = prose(dsarScreen, /^\s*\/\/\s?/);

const EMP = { id: 'uuid-emp-1', name: 'Dana Keys' };
const OTHER = { id: 'uuid-emp-2', name: 'Dana Keys' };

// ═══════════════════════════════════════════════════════════════════════════
describe('classification — exactly three tables gained employee_id', () => {
  it('wellbeing_notes, dsar_requests and concern_referrals, and nothing else', () => {
    const added = [...sqlCode.matchAll(/alter table public\.(\w+)\s+add column if not exists employee_id/g)]
      .map(m => m[1]).sort();
    expect(added).toEqual(['concern_referrals', 'dsar_requests', 'wellbeing_notes']);
  });

  it('every adopted column is NULLABLE with ON DELETE RESTRICT', () => {
    // Nullable: historical rows stay unattributed, forever if need be.
    // RESTRICT: deleting an employee must never silently destroy their records.
    const adds = sqlCode.match(/add column if not exists employee_id uuid\s+references public\.employee_records\(id\) on delete restrict/g) || [];
    expect(adds).toHaveLength(3);
    // No NOT NULL column constraint. (`is not null` legitimately appears in the
    // partial-index predicates, so the check is on the column declaration.)
    expect(sqlCode).not.toMatch(/employee_id uuid[^;]*not null/i);
    expect(sqlCode).not.toContain('on delete cascade');
    expect(sqlCode).not.toContain('on delete set null');
  });

  it('CASE-OWNED objects were NOT given a second employee reference', () => {
    // One authoritative identity route per object. hr_review_requests already has
    // a case_id FK, so identity derives hr_review_requests -> case -> employee_id.
    // A second, independently mutable employee reference would be two truths.
    ['hr_review_requests', 'allegations', 'case_tasks', 'case_signals',
     'case_views', 'case_access', 'case_themes'].forEach(t => {
      expect(sqlCode).not.toContain(`alter table public.${t}`);
    });
  });

  it('signing_requests was NOT given employee_id — its real gap is meeting parentage', () => {
    expect(sqlCode).not.toContain('alter table public.signing_requests');
    // The reasoning is recorded, because the obvious-looking fix is the wrong one.
    expect(sql).toContain('signing_requests');
    expect(sqlProse).toContain('this table has NO case_id and NO meeting_id at all');
    expect(sqlProse).toContain('BLOCKED ON E2');
  });

  it('starter/leaver instances were NOT given employee_id — nothing writes them', () => {
    expect(sqlCode).not.toContain('alter table public.starter_instances');
    expect(sqlCode).not.toContain('alter table public.leaver_instances');
    expect(sqlProse).toContain('LEGACY READ-ONLY');
    expect(sqlProse).toContain('Neither table has ANY write path');
    // And the standing semantic separation is restated, not quietly dropped.
    expect(sqlProse).toContain("a leaver_instance is NOT the same fact as employment_status = 'leaver'");
  });

  it('portal accounts/invites were NOT merged with employee identity', () => {
    expect(sqlCode).not.toContain('alter table public.employee_portal_accounts');
    expect(sqlCode).not.toContain('alter table public.employee_portal_invites');
    expect(sqlProse).toContain('AUTH IDENTITY');
    // The audited weakness is reported rather than silently patched.
    expect(sqlProse).toContain('acceptance is bridged by EMAIL');
    expect(sqlProse).toContain('NOT an email join');
  });

  it('redundancy_cases was NOT given a scalar employee_id — it cannot take one', () => {
    expect(sqlCode).not.toContain('alter table public.redundancy_cases');
    expect(sqlProse).toContain('at_risk_employees jsonb');
    expect(sqlProse).toContain('redundancy_case_employees');
  });

  it('MEETINGS are untouched — hard deferred to E2', () => {
    expect(sqlCode).not.toContain('public.meetings');
    expect(sqlCode).not.toContain('cases.meetings');
    expect(sqlCode).not.toContain('alter table public.cases');
    expect(sqlProse).toContain('HARD DEFER');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('database invariants for every adopted relationship', () => {
  const guard = sqlCode.slice(sqlCode.indexOf('function public.employee_owned_parentage_guard'),
                              sqlCode.indexOf('drop trigger if exists wellbeing_notes_employee_parentage_trg'));

  it('one guard, attached to all three tables', () => {
    expect(guard).toContain('security definer');
    expect(guard).toContain("set search_path to 'public'");
    ['wellbeing_notes', 'dsar_requests', 'concern_referrals'].forEach(t => {
      expect(sqlCode).toContain(`create trigger ${t}_employee_parentage_trg`);
      expect(sqlCode).toContain(`before insert or update on public.${t}`);
      expect(sqlCode).toContain('for each row execute function public.employee_owned_parentage_guard();');
    });
  });

  it('cross-org parentage is rejected on INSERT and UPDATE, never exempted', () => {
    expect(guard).toContain("(tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id)");
    expect(guard).toContain('employee_org <> new.org_id');
    expect(guard).toContain('Cannot attach a % in org % to an employee in org %.');
  });

  it('the uuid is immutable through normal writes: no clear, no move', () => {
    expect(guard).toContain('The employee on this % cannot be cleared once set.');
    expect(guard).toContain('cannot be moved between employees');
  });

  it('historical NULL stays permitted — fill-once, not immutable-always', () => {
    // NULL -> value must work; only value -> anything-else is refused.
    const upd = guard.slice(guard.indexOf("if tg_op = 'UPDATE' then"));
    expect(upd).toContain('old.employee_id is not null and new.employee_id is null');
    expect(upd).toContain('old.employee_id is not null and new.employee_id is distinct from old.employee_id');
    // No branch refuses a NULL old value.
    expect(upd).not.toContain('old.employee_id is null and');
  });

  it('these tables get NO correction exemption — there is nothing to open it', () => {
    // The cases trigger carries a correction door because cases have a
    // correction operation. Copying that branch here would create a door with
    // no authorised key, which is worse than no door: a later reader would
    // assume one exists.
    expect(guard).not.toContain('current_setting');
    expect(guard).not.toContain('correcting');
    expect(sqlCode).not.toContain('compass.correcting');
  });

  it('employee_id GRANTS NO ACCESS — not one policy is touched', () => {
    ['create policy', 'drop policy', 'alter policy', 'enable row level security',
     'grant ', 'revoke '].forEach(t => {
      expect(sqlCode.toLowerCase()).not.toContain(t);
    });
    // And it is said out loud, because this is the easiest thing to get wrong
    // when an Employee File UI arrives.
    expect(sqlProse).toContain('employee_id GRANTS NO ACCESS');
    expect(sqlProse).toContain('Identity parentage and visibility are separate concerns');
  });

  it('applying the migration writes no data', () => {
    expect(sqlCode).not.toMatch(/update\s+public\.\w+\s+set/i);
    expect(sqlCode).not.toContain('insert into');
    expect(sqlCode).not.toMatch(/join\s+public\.employee_records[\s\S]{0,120}on[\s\S]{0,80}name/i);
    expect(sqlCode).not.toContain('lower(btrim(');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('new-write identity — no new name-only debt', () => {
  it('a wellbeing note requires a canonical employee, chosen from the roster', () => {
    // Was a bare text input on the most sensitive employee-owned record in the
    // product. It is now the ONE shared selector.
    expect(wellbeing).toContain('<EmployeeSelect');
    expect(wellbeing).toContain('inputId="wellbeing-employee-name"');
    expect(wellbeing).not.toContain('placeholder="e.g. James Wilson"');
    expect(appCode).toContain('if(!f.employeeId) { showToast("Select which employee this note is about.", "error"); return; }');
    // Persisted as identity; the name remains the display snapshot.
    expect(appCode).toContain('employee_id: note.employeeId ?? null,');
    expect(appCode).toContain('employee_name: note.employeeName,');
  });

  it('a DSAR records the canonical subject when one is chosen', () => {
    expect(dsarScreen).toContain('<EmployeeSelect');
    expect(appCode).toContain('employee_id: employeeId || null,');
    // Round-trips, so a reconciled subject survives a reload.
    expect(appCode).toContain('employeeId:r.employee_id||null');
    expect(appCode).toContain('employeeId:data.employee_id||null');
  });

  it('a DSAR can STILL be raised for someone not on the roster', () => {
    // Required, not a convenience: a DSAR may concern a former employee with no
    // record, or someone whose identity is precisely what is in dispute.
    // Blocking it would put a data-modelling preference above a legal duty.
    expect(dsarScreen).toContain('This person is not on the employee roster');
    expect(dsarScreen).toContain('Subject name (not on the roster)');
    expect(dsarScreen).toContain('Recorded by name only');
    // The escape is explicit, never inferred from an empty match.
    expect(dsarScreen).toContain('const [offRoster, setOffRoster] = useState(false);');
    // And taking it clears any id, so the two can never disagree.
    expect(dsarScreen).toContain('setForm(p=>({...p, employeeId:null, employeeName:""}))');
  });

  it('the old name-only DSAR datalist is gone', () => {
    // It listed roster names and threw every uuid away.
    expect(dsarScreen).not.toContain('<datalist id="dsar-employee-names">');
    expect(dsarScreen).not.toContain('list="dsar-employee-names"');
  });

  it('a referral records the canonical employee HR confirmed at TRIAGE', () => {
    // Not at submission: a referral is raised by any org member, commonly a line
    // manager with no roster access and therefore nobody to pick from.
    expect(appCode).toContain('{ linkedCaseId: newCase.id, employeeId: employee.id }');
    expect(appCode).toContain('employee_id: referral.employeeId ?? null,');
    // Submission is deliberately NOT gated on a uuid.
    expect(appCode).not.toContain('if(!concernForm.employeeId)');
  });

  it('nothing name-matches to invent an identity on any of these writes', () => {
    ['employee_id: findEmployeeByName', 'employee_id: employeeRecords.find'].forEach(t =>
      expect(appCode).not.toContain(t));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the hr_review_requests name-lookup defect is closed', () => {
  it('ReviewScreen no longer receives every case in the organisation', () => {
    // The prop existed ONLY to support a name lookup. Removing it makes the
    // mistake structurally unavailable rather than merely corrected.
    expect(review).not.toContain('isHR, cases, requestHrReview');
    expect(review).not.toContain('cases.find');
    expect(appCode).not.toContain('isHR={isHR} cases={cases} requestHrReview=');
  });

  it('parentage comes from the meeting\'s own authoritative identity', () => {
    expect(review).toContain('const caseId = caseInfo.caseId || caseInfo._linkedCaseId || null;');
    // And a request with no case is refused out loud, not written into a hole.
    expect(review).toContain('if(!caseId) {');
    expect(review).toContain('an HR review has to be attached to the case it concerns');
    expect(review).not.toContain('requestHrReview("record",cs?.id||null,null,reviewOutput)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Part D — DSAR canonical routes', () => {
  const wbNote = (over) => ({ id: 'w1', employeeName: 'Dana Keys', type: 'chat', date: '2026-01-01', ...over });
  const referral = (over) => ({ id: 'r1', employeeName: 'Dana Keys', concernType: 'conduct', status: 'new', ...over });

  it('wellbeing notes use the canonical route when one exists', () => {
    const out = compileSubjectData('Dana Keys', {
      canonicalEmployeeId: EMP.id, employeeRecords: [EMP],
      wellbeingNotes: [wbNote({ id: 'mine', employeeId: EMP.id }), wbNote({ id: 'theirs', employeeId: OTHER.id })],
    });
    expect(out.wellbeingNotes.map(n => n.id)).toEqual(['mine']);
    expect(out.identityBasisByCollection.wellbeingNotes).toBe('employee_id');
  });

  it('an UNATTRIBUTED same-name wellbeing note is neither absorbed nor hidden', () => {
    const out = compileSubjectData('Dana Keys', {
      canonicalEmployeeId: EMP.id, employeeRecords: [EMP],
      wellbeingNotes: [wbNote({ id: 'mine', employeeId: EMP.id }),
                       wbNote({ id: 'unknown', employeeId: null, content: 'SECRET' })],
    });
    expect(out.wellbeingNotes.map(n => n.id)).toEqual(['mine']);
    expect(out.unattributedWellbeingNotes).toHaveLength(1);
    expect(out.unattributedWellbeingNotes[0].id).toBe('unknown');
    // Metadata only — it may be somebody else's note.
    expect(JSON.stringify(out.unattributedWellbeingNotes)).not.toContain('SECRET');
    expect(Object.keys(out.unattributedWellbeingNotes[0]).sort())
      .toEqual(['date', 'employeeName', 'id', 'type']);
  });

  it('concern referrals behave identically', () => {
    const out = compileSubjectData('Dana Keys', {
      canonicalEmployeeId: EMP.id, employeeRecords: [EMP],
      concernReferrals: [referral({ id: 'mine', employeeId: EMP.id }),
                         referral({ id: 'untriaged', employeeId: null, description: 'SECRET' })],
    });
    expect(out.concernReferrals.map(r => r.id)).toEqual(['mine']);
    expect(out.unattributedConcernReferrals.map(r => r.id)).toEqual(['untriaged']);
    expect(JSON.stringify(out.unattributedConcernReferrals)).not.toContain('SECRET');
  });

  it('with NO canonical id, legacy name behaviour is unchanged', () => {
    const out = compileSubjectData('Dana Keys', {
      employeeRecords: [EMP],
      wellbeingNotes: [wbNote({ id: 'a', employeeId: null }), wbNote({ id: 'b', employeeId: EMP.id })],
      concernReferrals: [referral({ id: 'c', employeeId: null })],
    });
    expect(out.wellbeingNotes.map(n => n.id).sort()).toEqual(['a', 'b']);
    expect(out.concernReferrals.map(r => r.id)).toEqual(['c']);
    expect(out.unattributedWellbeingNotes).toEqual([]);
    expect(out.identityBasisByCollection.wellbeingNotes).toBe('employee_name');
  });

  it('the package states its identity basis per collection', () => {
    const out = compileSubjectData('Dana Keys', { canonicalEmployeeId: EMP.id, employeeRecords: [EMP] });
    const b = out.identityBasisByCollection;
    expect(b.cases).toBe('employee_id');
    expect(b.wellbeingNotes).toBe('employee_id');
    expect(b.concernReferrals).toBe('employee_id');
    // Case-owned collections derive identity through the case.
    expect(b.allegations).toBe('case_id');
    expect(b.hrReviewRequests).toBe('case_id');
    // Tables with no employee column remain honest about it.
    expect(b.signingRequests).toBe('employee_name');
    expect(b.onboarding).toBe('employee_name');
  });

  it('name matching everywhere is normalised, so it cannot fail open', () => {
    const out = compileSubjectData('Dana Keys', {
      employeeRecords: [{ id: 'e', name: '  dana keys ' }],
      wellbeingNotes: [{ id: 'w', employeeName: 'DANA KEYS' }],
    });
    expect(out.identityStatus).toBe('resolved');
    expect(out.wellbeingNotes.map(n => n.id)).toEqual(['w']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the standalone-meeting DSAR position, after E2A closed the gap', () => {
  // This block used to pin the OPPOSITE: that meetings held outside a case were
  // excluded, that the compiler would name-match them if ever passed, and that
  // the guarantee lived in NOT passing them. E2A is the phase that closed that
  // gap, so those assertions are replaced rather than relaxed — and what they
  // were protecting (never claim completeness you do not have, never attribute by
  // name) is asserted here in its post-E2A form.

  it('no meetings supplied is reported as exactly that, not as completeness', () => {
    const out = compileSubjectData('Dana Keys', { employeeRecords: [EMP] });
    const d = out.standaloneMeetingsDisposition;
    expect(d.excluded).toBe(true);
    expect(d.included).toBe(0);
    expect(d.readFailed).toBe(false);
    expect(d.note).toContain('No meetings held outside a case were found');
  });

  it('a FAILED read is a different fact from "there were none"', () => {
    const out = compileSubjectData('Dana Keys', { employeeRecords: [EMP], meetingFetchFailed: true });
    const d = out.standaloneMeetingsDisposition;
    expect(d.readFailed).toBe(true);
    expect(d.note).toContain('could not read');
    expect(d.note).toContain('Re-compile before responding');
  });

  it('the production screen now FETCHES and PASSES them', () => {
    // The gap was never in the compiler — it was that no caller supplied them.
    expect(dsarScreen).toContain('fetchDsarMeetings');
    expect(dsarScreen).toMatch(/standaloneMeetings,/);
    // Through the ordinary authenticated client, so RLS applies. Completeness is
    // not a reason to reach for the service role.
    expect(dsarScreen).toContain("from '../supabase'");
    expect(dsarScreen).not.toMatch(/dsar-lookup[^\n]*meetings/);
  });

  it('the reviewer is no longer told something untrue', () => {
    // The old notice said meetings were not included. They are.
    expect(dsarScreen).not.toContain('Meetings held outside a case are not included');
    expect(dsarScreen).not.toContain('will not attribute one by name');
    // What replaced it: a read failure, withheld internal analysis, and witness
    // interviews that are not the subject's own record.
    expect(dsarScreen).toContain('could not be read');
    expect(dsarScreen).toContain('has been held back');
    expect(dsarScreen).toContain("not\n                treated as this person's own record");
  });

  it('the compiler states WHY witness participation is not ownership', () => {
    // The reasoning has to survive in the file, because the next person to touch
    // this function will otherwise see a filter that looks over-cautious.
    expect(compile).toContain('WITNESS PARTICIPATION IS NOT OWNERSHIP');
    expect(compile).toContain('NO NAME FALLBACK where an id exists');
    // And the name-matching branch is reachable ONLY for legacy rows.
    const own = compile.slice(compile.indexOf('const isSubjectsOwnStandaloneMeeting'), compile.indexOf('const subjectStandaloneMeetings'));
    expect(own.match(/nameMatchesSubject/g)).toHaveLength(1);
  });

  it('the screen explains the new position to whoever reads the code', () => {
    expect(dsarProse).toContain('meetings held outside a case now reach the package');
    expect(dsarProse).toContain('completeness a reason to widen access');
  });

  it('canonical rows are never name-matched, and legacy rows still are', () => {
    const canonical = compileSubjectData('Dana Keys', {
      employeeRecords: [EMP], canonicalEmployeeId: EMP.id,
      standaloneMeetings: [
        { id: 'mine', subjectKind: 'employee', employeeId: EMP.id, employeeName: 'Dana Keys', transcript: [] },
        { id: 'theirs', subjectKind: 'employee', employeeId: 'someone-else', employeeName: 'Dana Keys', transcript: [] },
        { id: 'legacy', subjectKind: 'legacy_unreconciled', employeeId: null, employeeName: 'Dana Keys', transcript: [] },
      ],
    });
    expect(canonical.standaloneMeetings.map(m => m.id).sort()).toEqual(['legacy', 'mine']);
    expect(canonical.standaloneMeetingsDisposition.legacyUnreconciled).toBe(1);
  });

  it('fail-closed identity gating is untouched', () => {
    const amb = compileSubjectData('Dana Keys', { employeeRecords: [EMP, OTHER] });
    expect(amb.identityRequiresReconciliation).toBe(true);
    const unrec = compileSubjectData('Nobody', { employeeRecords: [EMP] });
    expect(unrec.identityRequiresReconciliation).toBe(true);
    const ok = compileSubjectData('Dana Keys', { employeeRecords: [EMP] });
    expect(ok.identityRequiresReconciliation).toBe(false);
  });
});
