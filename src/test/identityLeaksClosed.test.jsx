import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  IMPORT_RESOLUTION, resolveImportedEmployee, planEmployeeImport, describeImportPlan, isBlockedResolution,
} from '../lib/employeeImportIdentity.js';
import { mergeHrisEmployeesIntoRecords } from '../lib/employeeHistory.js';
import { IDENTITY, identityRequiresReconciliation } from '../lib/employeeRecords.js';

// Phase E0.5A.1 — close every remaining path that can create NEW identity debt.
//
// E0.5A migrated "+ New case" and IntakeScreen. This phase finds the rest, and
// the inventory below is the deliverable that matters most: it is the assertion
// that no ACTIVE production case-creation path can silently create a case with no
// canonical employee.

const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const intake = readFileSync('src/screens/IntakeScreen.jsx', 'utf8');
const concerns = readFileSync('src/screens/ConcernsScreen.jsx', 'utf8');
const history = readFileSync('src/lib/employeeHistory.js', 'utf8');
const deepLink = readFileSync('src/screens/OpenInCompassScreen.jsx', 'utf8');

const JOHN_A = { id: 'emp-aaaa', name: 'John Smith', employeeNumber: '1042', location: 'Manchester' };
const JOHN_B = { id: 'emp-bbbb', name: 'John Smith', employeeNumber: '2841', location: 'Leeds' };
const DANA   = { id: 'emp-cccc', name: 'Dana Keys', employeeNumber: '3300', location: 'Leeds' };

// ═══════════════════════════════════════════════════════════════════════════
describe('1-4. concern referral identity', () => {
  it('1. opening a referral as a case requires a canonical employee id', () => {
    const triage = appCode.slice(appCode.indexOf('const triageReferral = (referralId, action, opts = {})'),
                                 appCode.indexOf('const status = actionToStatus[action];'));
    expect(triage).toContain('findEmployeeById(employeeRecords, opts.employeeId)');
    expect(triage).toContain('employeeId: employee.id,');
    // The snapshot name is taken FROM the selected employee, not the referral.
    expect(triage).toContain('employeeName: employee.name,');
  });

  it('2. it cannot create a case from the referral\'s free-text name', () => {
    const triage = appCode.slice(appCode.indexOf('const triageReferral = (referralId, action, opts = {})'),
                                 appCode.indexOf('const status = actionToStatus[action];'));
    // The old shape used referral.employeeName directly as the case's employee.
    expect(triage).not.toContain('employeeName: referral.employeeName');
    // And it refuses rather than guessing.
    expect(triage).toContain('if(!employee) {');
    expect(triage).toContain('Select which employee this concern is about');
    // No name matching of any kind.
    ['toLowerCase', 'employeeName ===', 'find(e => e.name'].forEach(f => expect(triage, f).not.toContain(f));
    // And no FALLBACK. An earlier version of this test passed while a mutation
    // added `|| { id: null, name: referral.employeeName }` to the lookup — the
    // refusal branch was still present, it just never fired. The branch must not
    // reference the referral's typed name at all, and the resolved employee must
    // not be defaulted.
    expect(triage).not.toContain('referral.employeeName');
    expect(triage).toMatch(/findEmployeeById\(employeeRecords, opts\.employeeId\);/);
    expect(triage).not.toMatch(/findEmployeeById\([^)]*\)\s*\|\|/);
  });

  it('3. the referral UI makes the user pick, and pre-seeds only the SEARCH', () => {
    expect(concerns).toContain('<EmployeeSelect');
    expect(concerns).toContain('onTriage(referral.id,"open_case",{employeeId:caseEmployeeId})');
    // The confirm is disabled until a person is chosen.
    expect(concerns).toContain('disabled={!caseEmployeeId}');
    // The reported name is shown as context, never used as the value.
    expect(concerns).toContain('This concern was reported about');
    expect(concerns).not.toContain('value={referral.employeeName}');
  });

  it('3. it reuses the ONE selector rather than building another', () => {
    const selectors = readdirSync('src/components').filter(f => /EmployeeSelect|EmployeePicker|EmployeeChooser/i.test(f));
    expect(selectors).toEqual(['EmployeeSelect.jsx']);
    ['src/App.jsx', 'src/screens/IntakeScreen.jsx', 'src/screens/ConcernsScreen.jsx']
      .forEach(p => expect(readFileSync(p, 'utf8'), p).toContain('EmployeeSelect'));
  });

  it('4. cross-org and duplicate-name protection is the database trigger, unchanged', () => {
    const sql = readFileSync('supabase/case_employee_identity_2026-09-26.sql', 'utf8');
    expect(sql).toContain('to an employee in org %');
    // Every creation path writes employee_id through the same guarded column.
    expect(appCode).toContain('employee_id: caseObj.employeeId ?? null,');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('7. the complete active case-creation inventory', () => {
  // Every site that can add a case to the cases collection.
  const addSites = [...appCode.matchAll(/saveCases\(\[\.\.\.cases/g)];

  it('7. there are exactly FOUR case-adding sites in App.jsx, all accounted for', () => {
    // 1 CSV case-history import (legacy, blocked below)
    // 2 concern referral            → employee_id REQUIRED
    // 3 saveDevMeetingToCase        → can no longer add a case at all
    // 4 saveMeetingToCaseImpl       → referral-intent branch
    // (+ IntakeScreen and the "+ New case" modal, both employee_id REQUIRED)
    expect(addSites.length).toBe(4);
    expect(intake).toContain('saveCases([...cases, newCase]);');
  });

  it('7. every user-facing path that creates a case REQUIRES a canonical employee', () => {
    // + New case
    expect(appCode).toContain('disabled={!casePromptEmployeeId}');
    expect(appCode).toContain('if(!casePromptEmployeeId) return;');
    // IntakeScreen
    expect(intake).toContain('disabled={!intake.employeeId||!intake.type}');
    expect(intake).toContain('if(!intake.employeeId) return;');
    // Concern referral
    expect(appCode).toContain('Select which employee this concern is about');
  });

  it('7. the dead name-only creation path was DELETED, not merely unreferenced', () => {
    // createCaseFromChat minted a case from free text and had zero call sites.
    expect(app).not.toContain('const createCaseFromChat');
    expect(app).toContain('REMOVED in Phase E0.5A.1');
    // Its dead supporting state went too.
    expect(app).not.toContain('const [casePromptName, setCasePromptName]');
    expect(app).not.toContain('const [homeChatHistory, setHomeChatHistory]');
  });

  it('7b. the Outlook deep link cannot pre-decide who a case is about', () => {
    // The FIFTH entry point, and the one the previous inventory missed entirely:
    // the add-in opens Compass with an employee name parsed out of an email
    // address, and "Create a case" used to push that string into the new-case
    // form. An email display name is the weakest identity signal in the product
    // and it arrives from outside Compass entirely.
    //
    // The deep link may still open the form. It may not decide the subject.
    const code = deepLink.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const createCase = code.slice(code.indexOf('const createCase = ()'),
                                 code.indexOf('return ('));
    expect(createCase).toContain('setShowCasePrompt(true)');
    expect(createCase).not.toContain('setCasePromptName');
    expect(createCase).not.toContain('employeeName');
    // And the prop is gone from the component contract and from App, so a future
    // edit cannot quietly reintroduce the seeding.
    expect(code).not.toContain('setCasePromptName');
    expect(appCode).not.toContain('setCasePromptName={');
  });

  it('8. saveDevMeetingToCase can no longer name-match or mint a case', () => {
    const dev = appCode.slice(appCode.indexOf('const saveDevMeetingToCase = ()'),
                              appCode.indexOf('audit("Development meeting saved"'));
    // The name match, the [0] pick and the implicit case are all gone.
    expect(dev).not.toContain('employeeName.toLowerCase()');
    expect(dev).not.toContain('devNameMatches');
    expect(dev).not.toContain('crypto.randomUUID()');
    expect(dev).not.toMatch(/saveCases\(\[\.\.\.cases\s*,\s*\{/);
    // It requires the case the user is explicitly in, and refuses otherwise.
    expect(dev).toContain('const existing = activeCaseId ? cases.find(c => c && c.id === activeCaseId) : null;');
    expect(dev).toContain('if(!existing) {');
    expect(dev).toContain('Compass no longer matches a case by employee name');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. name reads that decided a WRITE', () => {
  // Part G is about the quieter half of the problem. A name comparison that only
  // filters a list for a human to look at is fine. A name comparison whose result
  // is handed to an INSERT is an identity decision wearing a read's clothing.

  it('G1. accepting a meeting suggestion no longer files the task by employee name', () => {
    // Both handlers resolved the target case with
    //   cases.find(c => c.employeeName.toLowerCase() === caseInfo.employee...)
    // and then called createCaseTask(caseId, ...) — a real case_tasks insert.
    // Two people sharing a name meant an action accepted in one person's meeting
    // became a task on the other person's case, with nothing downstream to show it.
    const evidence = appCode.slice(appCode.indexOf('const acceptMeetingEvidenceSuggestion ='),
                                   appCode.indexOf('const dismissMeetingEvidenceSuggestion'));
    const action = appCode.slice(appCode.indexOf('const acceptMeetingActionSuggestion ='),
                                 appCode.indexOf('const dismissMeetingActionSuggestion'));
    [evidence, action].forEach(fn => {
      expect(fn.length).toBeGreaterThan(100);        // the slice really found the body
      expect(fn).toContain('createCaseTask(');       // it really is a write
      expect(fn).not.toContain('employeeName');      // ...but not decided by a label
      expect(fn).not.toContain('existingCase');
      expect(fn).toContain('const caseId = caseInfo._linkedCaseId;');
    });
  });

  it('G1. the deferred application still happens, and is id-based', () => {
    // The graceful path matters as much as the block: acceptance is recorded with
    // applied:false and the task is created at save time. That must not itself be
    // a name lookup, or the leak has only moved.
    const applier = appCode.slice(appCode.indexOf('const applyPendingMeetingSuggestions = (caseId)'),
                                  appCode.indexOf('const actionIdsApplied'));
    expect(applier).toContain('if(!caseId) return;');
    expect(applier).not.toContain('employeeName');
    expect(appCode).toContain('showToast("Noted — save this meeting to a case to turn it into a task")');
  });

  it('G2. "Deal with informally" cannot mint a name-only case', () => {
    // The referral card has TWO outcomes and both create a case. E0.5A.1 initially
    // gated only "Open formal case"; this one defers creation to the meeting save,
    // so the identity has to survive the whole journey to get there.
    const informal = appCode.slice(appCode.indexOf('const startInformalConversation ='),
                                   appCode.indexOf('const loadCaseAccess'));
    expect(informal).toContain('(referral, employeeId)');
    expect(informal).toContain('if(!employeeId) {');
    expect(informal).toContain('Select which employee this concern is about before starting the conversation.');
    expect(informal).toContain('_linkedReferralEmployeeId:employeeId');
  });

  it('G2. the referral exception requires the id, and stamps it on the case', () => {
    expect(appCode).toContain('const referralCaseIntent = !structuredCaseId && !!caseInfo._linkedReferralId && !!caseInfo._linkedReferralEmployeeId;');
    expect(appCode).toContain('employeeId:caseInfo._linkedReferralEmployeeId||null');
    // and it reaches the canonical column, not just the in-memory object
    expect(appCode).toContain('employee_id: caseObj.employeeId ?? null,');
    // cleared with its siblings, so no stale canonical id is left lying around
    expect(appCode).toContain('_linkedReferralEmployeeId:null}));');
  });

  it('G2. both referral outcomes share ONE identity step in the UI', () => {
    const code = concerns.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    // A single intent flag, so the two outcomes cannot drift apart later.
    expect(code).toContain('const [caseIntent, setCaseIntent] = useState(null);');
    expect(code).toContain('setCaseIntent("informal")');
    expect(code).toContain('setCaseIntent("formal")');
    expect(code).toContain('onStartInformal(referral, caseEmployeeId)');
    expect(code).toContain('disabled={!caseEmployeeId}');
    // The bare call that bypassed selection entirely is gone.
    expect(code).not.toContain('onClick={()=>onStartInformal(referral)}');
  });

  it('G3. name reads that only narrow a human choice are left alone, deliberately', () => {
    // appealLinkCandidates filters the appeal-linking list by name. That is a
    // narrowing, not a decision: the user still picks the case, and showing every
    // case in the org would make misfiling EASIER, not harder. Recorded here so a
    // future reader knows it was examined and kept, not missed.
    const appeal = readFileSync('src/lib/appealLink.js', 'utf8');
    expect(appeal).toContain('cs.employeeName');
    expect(appCode).toContain('appealLinkCandidates(cases, caseInfo.employee)');
    // It returns candidates; it must not write.
    expect(appeal).not.toContain('supabase');
    expect(appeal).not.toContain('saveCases');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('9-11. employee update and delete use the canonical id', () => {
  it('9. an update is addressed by id and scoped to the org', () => {
    expect(appCode).toContain(".update(payload).eq('id', employeeId).eq('org_id', org.id)");
    // And it cannot rename as a side effect: `name` is not in the payload builder.
    // End-anchored on CODE. appCode has comment lines stripped, so a comment
    // anchor resolves to -1 and the slice silently runs to end of file.
    const payStart = appCode.indexOf('const employeeRecordPayload = (fields)');
    const payload = appCode.slice(payStart, appCode.indexOf('const handleEmployeeCsvImport', payStart));
    expect(payload.length).toBeGreaterThan(200);
    expect(payload).not.toMatch(/^\s*name:/m);
  });

  it('10/11. a delete is addressed by id, and refuses without one', () => {
    const del = appCode.slice(appCode.indexOf('const deleteEmployeeRecord = async (employeeId)'),
                              appCode.indexOf('const updateEmployeeRecordById'));
    expect(del.length).toBeGreaterThan(200);
    expect(del).toContain(".delete().eq('id', existing.id).eq('org_id', org.id)");
    // The old name-addressed delete is gone.
    expect(appCode).not.toContain(".delete().eq('org_id', org.id).eq('name', name)");
    expect(del).toContain('if(!existing) {');
    expect(del).toContain("couldn't identify which employee record to remove");
    // Filters local state by id too, not by label.
    expect(del).toContain('employeeRecords.filter(e=>e.id!==existing.id)');
  });

  it('11. the caller that holds a record passes its id', () => {
    const person = readFileSync('src/screens/PersonViewScreen.jsx', 'utf8');
    expect(person).toContain('deleteEmployeeRecord(rec.id)');
    expect(person).toContain('employeeId:rec.id');
    expect(person).not.toContain('deleteEmployeeRecord(empName)');
  });

  it('creation still uses the name conflict target, because the constraint remains', () => {
    // Honest about the transition: duplicate names are not production-supported
    // yet, so CREATE still meets UNIQUE(org_id, name).
    expect(appCode).toContain("{ onConflict: 'org_id,name' }");
    expect(app).toContain('UNIQUE(org_id, name) is still in place');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('12. CSV import cannot silently merge two employees', () => {
  const roster = [JOHN_A, JOHN_B, DANA];

  it('12. an ambiguous name is BLOCKED, not merged', () => {
    const out = resolveImportedEmployee(roster, { name: 'John Smith', jobTitle: 'Changed' });
    expect(out.resolution).toBe(IMPORT_RESOLUTION.BLOCKED_AMBIGUOUS_NAME);
    expect(out.reason).toContain('2 employees are called');
    expect(isBlockedResolution(out.resolution)).toBe(true);
  });

  it('12. nothing at all is written for a blocked row', () => {
    const plan = planEmployeeImport(roster, [
      { name: 'John Smith', jobTitle: 'Changed' },
      { name: 'Dana Keys', jobTitle: 'Senior Analyst' },
      { name: 'Brand New', jobTitle: 'Joiner' },
    ]);
    expect(plan.applied.map(r => r.name)).toEqual(['Dana Keys', 'Brand New']);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0].row).toBe(1);
    // The ROW number is reported: with an ambiguous name, naming the person is
    // precisely what cannot be done unambiguously.
    expect(plan.blocked[0]).toHaveProperty('reason');
  });

  it('12. an explicit canonical id updates that employee and nothing else', () => {
    const out = resolveImportedEmployee(roster, { employeeId: 'emp-bbbb', name: 'John Smith' });
    expect(out).toEqual({ resolution: IMPORT_RESOLUTION.UPDATE_BY_ID, employeeId: 'emp-bbbb' });
  });

  it('12. an id that is not in this org is refused, never treated as a create', () => {
    const out = resolveImportedEmployee(roster, { employeeId: 'emp-from-another-org', name: 'Someone' });
    expect(out.resolution).toBe(IMPORT_RESOLUTION.BLOCKED_UNKNOWN_ID);
  });

  it('12. employee number and email are NOT used to merge', () => {
    // A matching employee number with a different name must not resolve — number
    // is not unique in the schema and is a human detection aid only.
    const out = resolveImportedEmployee(roster, { name: 'Totally Different', employeeNumber: '1042' });
    expect(out.resolution).toBe(IMPORT_RESOLUTION.CREATE);
    const lib = readFileSync('src/lib/employeeImportIdentity.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(lib).not.toContain('employeeNumber');
    expect(lib).not.toContain('workEmail');
  });

  it('12. unambiguous single-name and new rows still work', () => {
    expect(resolveImportedEmployee(roster, { name: 'Dana Keys' }))
      .toEqual({ resolution: IMPORT_RESOLUTION.UPDATE_BY_NAME, employeeId: 'emp-cccc' });
    expect(resolveImportedEmployee(roster, { name: 'New Joiner' }).resolution).toBe(IMPORT_RESOLUTION.CREATE);
    expect(resolveImportedEmployee(roster, { name: '   ' }).resolution).toBe(IMPORT_RESOLUTION.BLOCKED_NO_NAME);
  });

  it('12. the import wiring resolves BEFORE writing, and reports blocked rows', () => {
    const imp = appCode.slice(appCode.indexOf('const handleEmployeeCsvImport'), appCode.indexOf('const exportEmployeesCsv'));
    expect(imp).toContain('const plan = planEmployeeImport(employeeRecords, records);');
    expect(imp).toContain('const importable = plan.applied;');
    // The write uses only the importable rows.
    expect(imp).toContain('importable.map(r => ({');
    expect(imp).not.toContain('records.map(r => ({\n            org_id: org.id,');
    expect(imp).toContain('describeImportPlan(plan, skipped)');
  });

  it('the user message never claims a blocked row was imported', () => {
    const msg = describeImportPlan({ applied: [{}, {}], blocked: [{}] }, 1);
    expect(msg).toBe('Imported 2 employees, 1 row needs checking before they can be imported, skipped 1 row with no name');
    expect(describeImportPlan({ applied: [{}], blocked: [] }, 0)).toBe('Imported 1 employee');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('13. HRIS merge cannot silently merge by name', () => {
  it('13. a resolved id targets that employee', () => {
    const merged = mergeHrisEmployeesIntoRecords([JOHN_A, JOHN_B],
      [{ employeeId: 'emp-bbbb', name: 'John Smith', jobTitle: 'Promoted' }]);
    expect(merged).toHaveLength(2);
    expect(merged.find(m => m.id === 'emp-bbbb').jobTitle).toBe('Promoted');
    // The other John is untouched.
    expect(merged.find(m => m.id === 'emp-aaaa').jobTitle).toBeUndefined();
  });

  it('13. an ambiguous name APPENDS rather than overwriting either person', () => {
    // If the roster somehow holds two of a name and no id is supplied, merging
    // into one of them would silently combine two real people. Appending is
    // recoverable; overwriting is not.
    const merged = mergeHrisEmployeesIntoRecords([JOHN_A, JOHN_B],
      [{ name: 'John Smith', jobTitle: 'Guessed' }]);
    expect(merged).toHaveLength(3);
    expect(merged.find(m => m.id === 'emp-aaaa').jobTitle).toBeUndefined();
    expect(merged.find(m => m.id === 'emp-bbbb').jobTitle).toBeUndefined();
  });

  it('13. an unambiguous single name still updates in place, keeping its id', () => {
    const merged = mergeHrisEmployeesIntoRecords([DANA], [{ name: 'Dana Keys', jobTitle: 'Senior Analyst' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('emp-cccc');
    expect(merged[0].jobTitle).toBe('Senior Analyst');
  });

  it('13. the old unconditional name match is gone', () => {
    expect(history).not.toContain('const idx = merged.findIndex(m => m.name === name);');
    expect(history).toContain('identity by canonical id, never by name');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('14. DSAR fail-closed is preserved', () => {
  const roster = [JOHN_A, JOHN_B, DANA];
  it('14. RESOLVED allowed, AMBIGUOUS and UNRECONCILED both blocked', () => {
    expect(identityRequiresReconciliation(roster, 'Dana Keys')).toBe(false);
    expect(identityRequiresReconciliation(roster, 'John Smith')).toBe(true);
    expect(identityRequiresReconciliation(roster, 'Nobody')).toBe(true);
  });
  it('14. no name-only escape was added', () => {
    const lib = readFileSync('src/lib/employeeRecords.js', 'utf8');
    expect(lib).toContain('status === IDENTITY.AMBIGUOUS || status === IDENTITY.UNRECONCILED');
    expect(Object.keys(IDENTITY)).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('15-22. non-regression', () => {
  it('15. the formal workflow primitives know nothing about employee identity', () => {
    ['src/lib/meetingWrites.js', 'src/lib/meetingLifecycle.js', 'src/lib/nextStep.js',
      'src/lib/appealIndependence.js', 'src/lib/caseStage.js', 'src/lib/appealReview.js'].forEach(p => {
      const src = readFileSync(p, 'utf8');
      expect(src, p).not.toContain('employeeId');
      expect(src, p).not.toContain('employee_id');
    });
  });

  it('16/17/18/19. no tenancy, platform-admin, confidential or case_access change', () => {
    // This phase ships NO migration at all.
    const supabaseFiles = readdirSync('supabase').filter(f => f.includes('2026-09-26'));
    expect(supabaseFiles.sort()).toEqual(['case_employee_identity_2026-09-26.sql', 'employee_identity_foundation_2026-09-26.sql']);
    const guard = readFileSync('api/_platformAdmin.js', 'utf8');
    expect(guard).toContain('employee_records');
  });

  it('20/21/22. no case, meeting or UAT-row migration happened', () => {
    // No backfill helper, no reconciliation, no meeting employee parentage.
    expect(appCode).not.toMatch(/backfillEmployee|reconcileEmployee|migrateCasesToEmployee/);
    const standalone = readFileSync('src/lib/standaloneMeetings.js', 'utf8');
    expect(standalone).not.toContain('employeeId');
    const store = readFileSync('src/lib/meetingStore.js', 'utf8');
    expect(store).not.toContain('employeeId');
  });

  it('the four analytics functions remain recorded as a hard gate', () => {
    const register = readFileSync('docs/release-1-defect-register.md', 'utf8');
    ['org_event_correlation', 'org_insights_overview', 'org_theme_root_cause', 'org_trend_detection']
      .forEach(fn => expect(register, fn).toContain(fn));
    expect(register).toContain('hard prerequisite to');
  });
});
