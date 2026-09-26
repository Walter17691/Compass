import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  getEmployeeContext, buildEmployeeRoster, rosterNamesSharedBy,
  hasUnattributedRecords, EMPLOYEE_CONTEXT_COLLECTIONS,
} from '../lib/employeeContext.js';
import { matchCaseByEmployeeNameWithConfidence } from '../lib/globalAssistant.js';

// Phase E0.7 — the UUID employee read model.
//
// Write identity was closed in E0.5A–E0.6. This closes READ identity: no screen
// may reconstruct a person by comparing names. The single most important property
// is that two employees sharing a display name share NOTHING.

const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const people = readFileSync('src/screens/PeopleScreen.jsx', 'utf8');
const peopleCode = people.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const person = readFileSync('src/screens/PersonViewScreen.jsx', 'utf8');
const personCode = person.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const wellbeing = readFileSync('src/screens/WellbeingScreen.jsx', 'utf8');
const wellbeingCode = wellbeing.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const casesScreen = readFileSync('src/screens/CasesScreen.jsx', 'utf8');
const casesCode = casesScreen.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const search = readFileSync('src/screens/SearchScreen.jsx', 'utf8');
const risk = readFileSync('src/lib/caseRisk.js', 'utf8');
const riskCode = risk.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const context = readFileSync('src/lib/employeeContext.js', 'utf8');
const contextCode = context.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const appeal = readFileSync('src/lib/appealLink.js', 'utf8');

// Two DIFFERENT people who answer to one name — the fixture the whole phase is
// about. Production cannot hold this yet (UNIQUE(org_id,name)), so it is proven
// here rather than in the database.
const JOHN_A = { id: 'uuid-a', name: 'John Smith', jobTitle: 'Sales Manager', location: 'Manchester', employeeNumber: '1042' };
const JOHN_B = { id: 'uuid-b', name: 'John Smith', jobTitle: 'Team Leader', location: 'Leeds', employeeNumber: '2841' };
const DANA = { id: 'uuid-d', name: 'Dana Keys' };

const data = {
  employeeRecords: [JOHN_A, JOHN_B, DANA],
  cases: [
    { id: 'case-a', employeeId: 'uuid-a', employeeName: 'John Smith', stage: 'investigation' },
    { id: 'case-b', employeeId: 'uuid-b', employeeName: 'John Smith', stage: 'closed' },
    { id: 'case-legacy', employeeId: null, employeeName: 'John Smith', stage: 'investigation' },
  ],
  wellbeingNotes: [
    { id: 'wb-a', employeeId: 'uuid-a', employeeName: 'John Smith', type: 'chat' },
    { id: 'wb-b', employeeId: 'uuid-b', employeeName: 'John Smith', type: 'eap' },
    { id: 'wb-legacy', employeeId: null, employeeName: 'John Smith', type: 'crisis' },
  ],
  concernReferrals: [
    { id: 'ref-a', employeeId: 'uuid-a', employeeName: 'John Smith' },
    { id: 'ref-legacy', employeeId: null, employeeName: 'John Smith' },
  ],
  dsarRequests: [
    { id: 'dsar-a', employeeId: 'uuid-a', employeeName: 'John Smith' },
    { id: 'dsar-legacy', employeeId: null, employeeName: 'John Smith' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
describe('7. two same-named employees share NOTHING', () => {
  it('7. each context contains only that employee\'s own records', () => {
    const a = getEmployeeContext('uuid-a', data);
    const b = getEmployeeContext('uuid-b', data);
    expect(a.cases.map(c => c.id)).toEqual(['case-a']);
    expect(b.cases.map(c => c.id)).toEqual(['case-b']);
    expect(a.wellbeingNotes.map(n => n.id)).toEqual(['wb-a']);
    expect(b.wellbeingNotes.map(n => n.id)).toEqual(['wb-b']);
    expect(a.concernReferrals.map(r => r.id)).toEqual(['ref-a']);
    expect(b.concernReferrals).toEqual([]);
    expect(a.dsarRequests.map(d => d.id)).toEqual(['dsar-a']);
    expect(b.dsarRequests).toEqual([]);
  });

  it('7. no record appears in BOTH contexts', () => {
    const a = getEmployeeContext('uuid-a', data);
    const b = getEmployeeContext('uuid-b', data);
    EMPLOYEE_CONTEXT_COLLECTIONS.forEach(k => {
      const ids = new Set(a[k].map(r => r.id));
      b[k].forEach(r => expect(ids.has(r.id)).toBe(false));
    });
  });

  it('3/4/5/6. every collection is selected by employee_id — no name branch exists', () => {
    // Structural, not behavioural: there is no `employeeName` anywhere in the
    // read model, so a name fallback cannot be reintroduced by accident.
    expect(contextCode).not.toContain('employeeName');
    expect(contextCode).not.toContain('.name ===');
    expect(contextCode).not.toContain('toLowerCase() ===');
    expect(contextCode).toContain('r.employeeId === employeeId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('8-11. legacy name-only records are never absorbed', () => {
  it('8. a legacy case is not absorbed by a same-named employee', () => {
    const a = getEmployeeContext('uuid-a', data);
    expect(a.cases.map(c => c.id)).not.toContain('case-legacy');
  });

  it('9. a legacy wellbeing note is not absorbed', () => {
    expect(getEmployeeContext('uuid-a', data).wellbeingNotes.map(n => n.id)).not.toContain('wb-legacy');
  });

  it('10. a legacy referral is not absorbed', () => {
    expect(getEmployeeContext('uuid-a', data).concernReferrals.map(r => r.id)).not.toContain('ref-legacy');
  });

  it('11. a legacy DSAR is not absorbed', () => {
    expect(getEmployeeContext('uuid-a', data).dsarRequests.map(d => d.id)).not.toContain('dsar-legacy');
  });

  it('legacy records are COUNTED org-wide, without being attached to anyone', () => {
    const a = getEmployeeContext('uuid-a', data);
    expect(a.unattributedInOrg).toEqual({ cases: 1, wellbeingNotes: 1, concernReferrals: 1, dsarRequests: 1 });
    expect(hasUnattributedRecords(a)).toBe(true);
    // The count is employee-agnostic — identical for an employee with no name
    // resemblance at all, so it can never read as "these are probably yours".
    expect(getEmployeeContext('uuid-d', data).unattributedInOrg).toEqual(a.unattributedInOrg);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('12. an empty context is valid, not an error', () => {
  it('12. an employee with nothing attributed yields an empty context', () => {
    const d = getEmployeeContext('uuid-d', data);
    expect(d.isEmpty).toBe(true);
    expect(d.total).toBe(0);
    expect(d.employee).toEqual(DANA);
  });

  it('12. a missing or unknown id returns empty rather than everything', () => {
    [null, undefined, '', 'uuid-does-not-exist'].forEach(id => {
      const c = getEmployeeContext(id, data);
      expect(c.isEmpty).toBe(true);
      expect(c.cases).toEqual([]);
    });
  });

  it('12. Person View renders the empty state instead of treating it as broken', () => {
    expect(personCode).toContain('No recorded activity yet.');
    expect(personCode).toContain('{ctx.isEmpty&&(');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('1. People is the roster, keyed by UUID', () => {
  it('1. rows come from employee_records, including employees with no cases', () => {
    const roster = buildEmployeeRoster(data);
    expect(roster.map(r => r.id).sort()).toEqual(['uuid-a', 'uuid-b', 'uuid-d']);
    expect(roster.find(r => r.id === 'uuid-d').hasActivity).toBe(false);
  });

  it('1. counts come only from canonical relationships', () => {
    const roster = buildEmployeeRoster(data);
    expect(roster.find(r => r.id === 'uuid-a').caseCount).toBe(1);
    expect(roster.find(r => r.id === 'uuid-a').openCaseCount).toBe(1);
    // uuid-b's only case is closed.
    expect(roster.find(r => r.id === 'uuid-b').caseCount).toBe(1);
    expect(roster.find(r => r.id === 'uuid-b').openCaseCount).toBe(0);
    // The legacy case inflates nobody.
    expect(roster.reduce((n, r) => n + r.caseCount, 0)).toBe(2);
  });

  it('1. the invented roster is gone from the screen', () => {
    expect(peopleCode).not.toContain('new Set(cases.map(c=>c.employeeName))');
    expect(peopleCode).toContain('buildEmployeeRoster(');
    // Row key and navigation are both the uuid.
    expect(peopleCode).toContain('<DataRow key={p.id}>');
    expect(peopleCode).toContain('setActiveEmployeeId(p.id)');
    expect(peopleCode).not.toContain('setActivePerson');
  });

  it('same-named rows stay distinguishable', () => {
    const shared = rosterNamesSharedBy(buildEmployeeRoster(data));
    expect(shared.has('john smith')).toBe(true);
    expect(shared.has('dana keys')).toBe(false);
    expect(peopleCode).toContain('another employee shares this name');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('2-6. Person View is UUID-based', () => {
  it('2. it receives an employeeId and no longer a name', () => {
    expect(personCode).toContain('export function PersonViewScreen({ employeeId');
    expect(personCode).not.toContain('const empName = activePerson');
    expect(personCode).not.toContain('activePerson');
    expect(appCode).toContain('employeeId={activeEmployeeId}');
  });

  it('3-6. every related collection comes from getEmployeeContext', () => {
    expect(personCode).toContain('getEmployeeContext(employeeId, {');
    expect(personCode).toContain('const empCases = ctx.cases;');
    expect(personCode).toContain('ctx.wellbeingNotes');
    expect(personCode).toContain('ctx.concernReferrals');
    expect(personCode).toContain('ctx.dsarRequests');
    // The old predicate is gone.
    expect(personCode).not.toContain('cases.filter(c=>c.employeeName===empName)');
  });

  it('the legacy name lookup is not even available on this screen', () => {
    // getEmployeeRecord(name) returns whichever record is first when a name
    // repeats. Removing the prop makes the mistake unavailable, not just unused.
    expect(personCode).not.toContain('getEmployeeRecord');
    expect(appCode).not.toContain('getEmployeeRecord={getEmployeeRecord}\n          editingEmployeeRecord');
  });

  it('22. the AI employment profile can no longer receive a colleague\'s history', () => {
    // The prompt asks for "Pattern Analysis" and a "Risk Assessment" over
    // empCases. While that was a name match, two same-named people were profiled
    // as one person with a merged disciplinary pattern.
    const prompt = personCode.slice(personCode.indexOf('employment profile report for'),
                                   personCode.indexOf('Be factual, objective'));
    expect(prompt).toContain('empCases.length');
    expect(personCode).toContain('const empCases = ctx.cases;');
    expect(personCode).not.toContain('getEmployeeRecord(empName)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('14. Wellbeing reads are canonical, and confidentiality is unchanged', () => {
  it('14. notes are grouped by employee_id, not by name', () => {
    expect(wellbeingCode).not.toContain('new Set(wellbeingNotes.map(n=>n.employeeName))');
    expect(wellbeingCode).toContain('n.employeeId === activeWellbeing');
    expect(wellbeingCode).toContain('attributed.filter(n=>n.employeeId===emp.id)');
    // Navigation state is a uuid.
    expect(wellbeingCode).toContain('setActiveWellbeing(emp.id)');
    expect(appCode).toContain('setActiveWellbeing(f.employeeId)');
  });

  it('14. legacy notes are disclosed but attached to nobody', () => {
    expect(wellbeingCode).toContain('const legacyNotes = wellbeingNotes.filter(n => n && !n.employeeId)');
    expect(wellbeingCode).toContain('not linked to an employee record');
    expect(wellbeingCode).toContain("could file one person's");
  });

  it('14. nothing in this phase widens wellbeing access', () => {
    // The table is HR-only at the database and stays so; Person View additionally
    // gates the section on isHR rather than relying on an empty array.
    expect(personCode).toContain('{isHR&&ctx.wellbeingNotes.length>0&&(');
    expect(personCode).toContain('{isHR&&ctx.concernReferrals.length>0&&(');
    expect(personCode).toContain('{isHR&&ctx.dsarRequests.length>0&&(');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('7/13. Cases grouping no longer merges two people', () => {
  it('grouping is keyed canonically, and legacy cases group alone', () => {
    expect(casesCode).not.toContain('new Set(filteredCases.map(cs=>cs.employeeName))');
    expect(casesCode).toContain('cs.employeeId || `legacy:${cs.id}`');
    expect(casesCode).toContain('<div key={emp.key}');
  });

  it('13. Case View still opens a legacy NULL-employee case', () => {
    // Ordinary case access must not depend on employee_id being present.
    expect(casesCode).toContain('legacy:${cs.id}');
    expect(appCode).not.toContain('if(!cs.employeeId) return null;');
    // The case-open path is by case id and knows nothing about employees.
    expect(casesCode).toContain('setActiveCaseId(cs.id)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('22/23. AI context does not cross employees, and does not guess', () => {
  it('22. prior-case counting is keyed on the canonical employee', () => {
    expect(appCode).toContain('cases.filter(c => c.id !== excludeId && c.employeeId === activeCase.employeeId)');
    expect(appCode).not.toContain("c.employeeName === employeeName");
  });

  it('23. a legacy case with NULL employee_id gathers NO context by name', () => {
    expect(appCode).toContain('if(activeCase?.employeeId) {');
    // The three cross-meeting context builders resolve the case by parentage.
    expect((appCode.match(/cases\.find\(c=>c\.id===\(caseInfo\.caseId\|\|caseInfo\._linkedCaseId\)\)/g) || []).length).toBe(3);
    expect(appCode).not.toContain('employeeName.toLowerCase()===caseInfo.employee');
  });

  it('risk signals are canonical, and silent when identity is unknown', () => {
    expect(riskCode).toContain('c.employeeId === cs.employeeId');
    expect(riskCode).toContain('wellbeingNotes.filter(n => n.employeeId === cs.employeeId)');
    expect(riskCode).not.toContain('c.employeeName === cs.employeeName');
    expect(riskCode).not.toContain('n.employeeName === cs.employeeName');
    // "No wellbeing context recorded" is only asserted when we could look.
    expect(riskCode).toContain('if (cs.employeeId && !employeeNotes.length)');
  });

  it('a name lookup that finds SEVERAL matches now refuses to choose', () => {
    // Its result reaches createCaseTask through the command bar, so silently
    // taking the first of several matches was writing to a case picked at random.
    const twoSameName = [
      { id: 'c1', employeeName: 'John Smith' },
      { id: 'c2', employeeName: 'John Smith' },
    ];
    const out = matchCaseByEmployeeNameWithConfidence(twoSameName, 'John Smith');
    expect(out.confidence).toBe('ambiguous');
    expect(out.case).toBeNull();
    expect(out.matches).toHaveLength(2);
    // A substring hitting two people is equally refused.
    expect(matchCaseByEmployeeNameWithConfidence(twoSameName, 'John').confidence).toBe('ambiguous');
    // One unambiguous match still resolves.
    expect(matchCaseByEmployeeNameWithConfidence([twoSameName[0]], 'John Smith').case.id).toBe('c1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('24/25. search and routing use stable ids', () => {
  it('24. the employee search result carries a UUID and navigates with it', () => {
    expect(appCode).toContain('results.push({type:"employee", employeeId:r.id, title:r.name');
    expect(search).toContain('setActiveEmployeeId(r.employeeId)');
    expect(search).toContain('if(!r.employeeId) return;');
    expect(search).not.toContain('setActivePerson(r.title)');
    // And the dedupe that decides whether to list a bare employee row is keyed on
    // the canonical employee, not the name — a name key made a roster employee
    // unfindable as soon as any case shared their name.
    expect(appCode).toContain('!cases.some(c=>c.employeeId===r.id)');
    expect(appCode).not.toContain('!cases.some(c=>c.employeeName===r.name)');
  });

  it('25. a person is deep-linkable by UUID, and refresh resolves the same one', () => {
    expect(appCode).toContain("if (screen === SCREENS.PERSON_VIEW && activeEmployeeId) params.set('employee', activeEmployeeId);");
    expect(appCode).toContain("employeeId: params.get('employee') || null,");
    // The state is INITIALISED from the URL, so a cold load resolves the employee
    // rather than rendering an empty screen and relying on a later effect.
    expect(appCode).toContain('useState(() => readNavFromUrl().employeeId)');
    // The effect re-runs when the employee changes, so the URL cannot go stale.
    expect(appCode).toContain('[screen, activeCaseId, activeEmployeeId, caseInfo.caseId');
  });

  it('no employee identifier in a Compass route is a name', () => {
    const urlBlock = appCode.slice(appCode.indexOf("params.set('screen', screen)"),
                                   appCode.indexOf('const nextSearch'));
    expect(urlBlock).not.toContain('employeeName');
    expect(urlBlock).not.toContain('activePerson');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('26. appeal linking still only narrows a human choice', () => {
  it('26. it filters candidates and writes nothing', () => {
    // Re-audited rather than assumed: name equality narrows a list the user picks
    // from, and showing every case in the org would make misfiling EASIER.
    expect(appeal).toContain('cs.employeeName');
    expect(appeal).not.toContain('supabase');
    expect(appeal).not.toContain('saveCases');
    expect(appeal).not.toContain('.update(');
    // Nothing auto-links: the caller passes an explicit case id.
    expect(appCode).toContain('appealLinkCandidates(cases, caseInfo.employee)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the read model composes, it does not authorise', () => {
  it('it takes already-authorised collections and cannot widen them', () => {
    // No fetching, no service role, no supabase client anywhere in the primitive.
    expect(contextCode).not.toContain('supabase');
    expect(contextCode).not.toContain('fetch');
    expect(contextCode).not.toContain('authedFetch');
    expect(contextCode).not.toContain('service');
    // It only ever filters what it was handed.
    expect(contextCode).toContain('.filter(');
  });

  it('it says so explicitly, because this is the easiest thing to get wrong', () => {
    expect(context).toContain('IDENTITY COMPOSITION, NOT AUTHORISATION');
    expect(context).toContain('employee_id does NOT create an access relationship');
  });

  it('16-21. no role gains anything, because the phase adds no policy and no route', () => {
    // E0.7 is read composition only. Widening access would require a new policy
    // or a new endpoint; it introduces neither, and that is checked rather than
    // asserted in prose.
    const migrations = readdirSync('supabase').filter(f => f.endsWith('.sql') && f.includes('2026-09-2'));
    // The identity programme's migrations, unchanged by this phase.
    expect(migrations.sort()).toEqual([
      'appeal_hearing_chair_lifecycle_2026-09-23.sql',
      'case_employee_identity_2026-09-26.sql',
      'employee_identity_correction_2026-09-26.sql',
      'employee_identity_foundation_2026-09-26.sql',
      'employee_owned_objects_2026-09-26.sql',
      'employee_reconciliation_2026-09-26.sql',
      'standalone_meetings_2026-09-25.sql',
    ]);
    // Six deployable API routes, none added.
    const routes = readdirSync('api').filter(f => f.endsWith('.js') && !f.startsWith('_') && !f.endsWith('.test.js'));
    expect(routes.sort()).toEqual([
      'chat.js', 'delete-member.js', 'delete-org-data.js',
      'send-for-signature.js', 'send-letter.js', 'signing.js',
    ]);
    // And the read primitive reaches no server at all.
    expect(contextCode).not.toContain('api/');
  });

  it('30. meetings are absent from the read model, deferred to E2', () => {
    expect(EMPLOYEE_CONTEXT_COLLECTIONS).toEqual(['cases', 'wellbeingNotes', 'concernReferrals', 'dsarRequests']);
    expect(contextCode).not.toContain('standaloneMeetings');
    expect(contextCode).not.toContain('meetings:');
    // Person View still shows meetings, but reached THROUGH the case — which is
    // authoritative parentage, not a name match.
    expect(personCode).toContain('empCases.flatMap(cs=>(cs.meetings||[])');
  });
});
