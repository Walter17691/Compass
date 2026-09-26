import { describe, it, expect } from 'vitest';
import {
  RECONCILIATION, NO_CANDIDATE, EVIDENCE, SELECTOR,
  selectorsForCase, classifyCase, describeEvidence,
  groupLegacyForReview, summariseGroup, requiresHumanConfirmation, isReconcilable,
} from '../lib/employeeReconciliation.js';

// Phase E0.5B — the reconciliation state model.
//
// The single most important assertion in this file is that an exact name match
// is CANDIDATE and never RESOLVED. Every other test defends a corner of that.

const JOHN_1 = { id: 'uuid-john-1', name: 'John Smith', jobTitle: 'Sales Manager', location: 'Manchester', employeeNumber: '1042' };
const JOHN_2 = { id: 'uuid-john-2', name: 'John Smith', jobTitle: 'Team Leader',   location: 'Leeds',      employeeNumber: '2841' };
const DANA   = { id: 'uuid-dana',   name: 'Dana Keys',  jobTitle: 'Analyst',       location: 'Leeds',      employeeNumber: '3300' };

const legacy = (over = {}) => ({ id: 'case-1', employeeName: 'John Smith', employeeEmail: null, employeeId: null, ...over });

// ═══════════════════════════════════════════════════════════════════════════
describe('1. exact name equality is CANDIDATE, never RESOLVED', () => {
  it('1. a single exact name match classifies as CANDIDATE', () => {
    const c = classifyCase(legacy(), [JOHN_1, DANA]);
    expect(c.state).toBe(RECONCILIATION.CANDIDATE);
    expect(c.candidateIds).toEqual(['uuid-john-1']);
    // The point: a proposal, not a decision.
    expect(c.state).not.toBe(RECONCILIATION.RESOLVED);
  });

  it('1. RESOLVED is only ever READ from a persisted employee_id', () => {
    // No roster at all, yet RESOLVED — because RESOLVED is a database fact, not
    // a conclusion this module is entitled to reach.
    const c = classifyCase(legacy({ employeeId: 'uuid-john-2' }), []);
    expect(c.state).toBe(RECONCILIATION.RESOLVED);
    expect(c.employeeId).toBe('uuid-john-2');
  });

  it('1. no input can make the classifier INVENT a resolution', () => {
    // Every unresolved shape, however strong the match looks, stays unresolved.
    const shapes = [
      legacy(),                                                    // 1 exact match
      legacy({ employeeName: 'JOHN  SMITH' }),                      // exact after normalising
      legacy({ employeeEmail: 'j@x.com' }),                         // + an email dimension
      legacy({ employeeName: 'Nobody At All' }),                    // no match
      legacy({ employeeName: '' }),                                 // no name
    ];
    shapes.forEach(s => {
      expect(classifyCase(s, [JOHN_1, JOHN_2, DANA]).state).not.toBe(RECONCILIATION.RESOLVED);
    });
  });

  it('1. requiresHumanConfirmation is true for every state except RESOLVED', () => {
    Object.values(RECONCILIATION).forEach(s => {
      expect(requiresHumanConfirmation(s)).toBe(s !== RECONCILIATION.RESOLVED);
    });
  });

  it('1. case-insensitive and whitespace-insensitive matching still only proposes', () => {
    const c = classifyCase(legacy({ employeeName: '  jOhN   Smith ' }), [JOHN_1]);
    // Note: internal whitespace is NOT collapsed — 'jOhN   Smith' !== 'john smith'.
    // Proving the actual behaviour rather than the behaviour I might assume.
    expect(c.state).toBe(RECONCILIATION.UNRECONCILED);
    const c2 = classifyCase(legacy({ employeeName: '  jOhN Smith ' }), [JOHN_1]);
    expect(c2.state).toBe(RECONCILIATION.CANDIDATE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('2. nothing to propose stays UNRECONCILED', () => {
  it('2. no roster match is UNRECONCILED with a reason', () => {
    const c = classifyCase(legacy({ employeeName: 'Not On The Roster' }), [JOHN_1, DANA]);
    expect(c.state).toBe(RECONCILIATION.UNRECONCILED);
    expect(c.reason).toBe(NO_CANDIDATE.NO_ROSTER_MATCH);
    expect(c.candidateIds).toEqual([]);
  });

  it('2. a case with no employee name at all is distinguished from no match', () => {
    // Production holds exactly one of these. "Nobody answers to this name" and
    // "there is no name" need different conversations with the reviewer.
    [null, '', '   ', undefined].forEach(n => {
      const c = classifyCase(legacy({ employeeName: n }), [JOHN_1]);
      expect(c.state).toBe(RECONCILIATION.UNRECONCILED);
      expect(c.reason).toBe(NO_CANDIDATE.NO_NAME);
    });
  });

  it('2. an empty roster proposes nothing rather than throwing', () => {
    [[], null, undefined].forEach(r => {
      expect(classifyCase(legacy(), r).state).toBe(RECONCILIATION.UNRECONCILED);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('3. several plausible employees become AMBIGUOUS', () => {
  it('3. two employees sharing a name is AMBIGUOUS, not a pick', () => {
    const c = classifyCase(legacy(), [JOHN_1, JOHN_2, DANA]);
    expect(c.state).toBe(RECONCILIATION.AMBIGUOUS);
    expect(c.candidateIds.sort()).toEqual(['uuid-john-1', 'uuid-john-2']);
  });

  it('3. AMBIGUOUS never silently collapses to the first match', () => {
    const c = classifyCase(legacy(), [JOHN_1, JOHN_2]);
    expect(c.candidateIds).toHaveLength(2);
    expect(c.state).not.toBe(RECONCILIATION.CANDIDATE);
  });

  it('3. AMBIGUOUS is currently unreachable in PRODUCTION, and that is measured', () => {
    // UNIQUE(org_id, name) forbids two same-named roster rows, and production
    // holds 0 normalisation collisions. So this state is proven by FIXTURES.
    // It is implemented anyway: the alternative is a workbench whose safety
    // depends on a constraint the roadmap intends to remove.
    expect(RECONCILIATION.AMBIGUOUS).toBe('ambiguous');
    expect(classifyCase(legacy(), [JOHN_1, JOHN_2]).state).toBe(RECONCILIATION.AMBIGUOUS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('4. conflicting evidence does not auto-resolve', () => {
  const JOHN_EMAIL = { ...JOHN_1, workEmail: 'john.smith@x.com' };
  const OTHER_EMAIL = { id: 'uuid-other', name: 'Jonathan Smythe', workEmail: 'j.smith@x.com' };

  it('4. name selects one employee, email selects another → CONFLICT', () => {
    const c = classifyCase(
      legacy({ employeeName: 'John Smith', employeeEmail: 'j.smith@x.com' }),
      [JOHN_EMAIL, OTHER_EMAIL]
    );
    expect(c.state).toBe(RECONCILIATION.CONFLICT);
    // Both dimensions' answers are reported — "the evidence disagrees" is
    // useless to a reviewer without saying how.
    expect(c.selectors[SELECTOR.NAME]).toEqual(['uuid-john-1']);
    expect(c.selectors[SELECTOR.WORK_EMAIL]).toEqual(['uuid-other']);
    expect(c.candidateIds.sort()).toEqual(['uuid-john-1', 'uuid-other']);
  });

  it('4. agreeing dimensions narrow to the intersection and still only propose', () => {
    const c = classifyCase(
      legacy({ employeeName: 'John Smith', employeeEmail: 'john.smith@x.com' }),
      [JOHN_EMAIL, OTHER_EMAIL]
    );
    expect(c.state).toBe(RECONCILIATION.CANDIDATE);
    expect(c.candidateIds).toEqual(['uuid-john-1']);
  });

  it('4. an email matching NOBODY does not manufacture a CONFLICT', () => {
    // Exposed by mutation testing. If a dimension is recorded even when it
    // selected nobody, dimensions.length becomes 2, the intersection with the
    // name match is empty, and the case is reported as "the evidence disagrees"
    // when the truth is simply that the email matched no one. A dimension that
    // found nobody has said NOTHING, and must not be counted as having spoken.
    const c = classifyCase(
      legacy({ employeeName: 'John Smith', employeeEmail: 'nobody@nowhere.com' }),
      [{ ...JOHN_1, workEmail: 'john.smith@x.com' }]
    );
    expect(c.state).toBe(RECONCILIATION.CANDIDATE);
    expect(c.candidateIds).toEqual(['uuid-john-1']);
    // Only the name dimension is recorded as having selected anyone.
    expect(Object.keys(selectorsForCase(
      legacy({ employeeEmail: 'nobody@nowhere.com' }),
      [{ ...JOHN_1, workEmail: 'john.smith@x.com' }]
    ))).toEqual([SELECTOR.NAME]);
  });

  it('4. an ABSENT value is never treated as agreement', () => {
    // The whole dataset hinges on this: cases.employee_email is populated 0
    // times in production. An absent field must contribute nothing, not consent.
    const sel = selectorsForCase(legacy({ employeeEmail: null }), [JOHN_EMAIL]);
    expect(Object.keys(sel)).toEqual([SELECTOR.NAME]);
    expect(sel[SELECTOR.WORK_EMAIL]).toBeUndefined();
  });

  it('4. a single candidate whose LOCATION differs is not a CONFLICT', () => {
    // Location is corroboration, never a selector — colleagues share a location,
    // so a mismatch is a weak-corroboration signal shown to the reviewer, not
    // evidence pointing at a different person.
    const c = classifyCase(legacy(), [{ ...JOHN_1, location: 'Bristol' }]);
    expect(c.state).toBe(RECONCILIATION.CANDIDATE);
    const ev = describeEvidence(legacy(), { ...JOHN_1, location: 'Bristol' }, 'Manchester');
    expect(ev.location).toBe(EVIDENCE.DIFFERS);
    expect(ev.name).toBe(EVIDENCE.MATCHES);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('provenance: why was this candidate proposed?', () => {
  it('absent values report NOT_COMPARABLE, never MATCHES', () => {
    const ev = describeEvidence(legacy(), JOHN_1, null);
    expect(ev.name).toBe(EVIDENCE.MATCHES);
    expect(ev.workEmail).toBe(EVIDENCE.NOT_COMPARABLE);   // both sides empty
    expect(ev.location).toBe(EVIDENCE.NOT_COMPARABLE);    // no case-side location
  });

  it('employee number is structurally NOT_COMPARABLE for every legacy case', () => {
    // cases has no employee_number column at all. Stated rather than hidden, so
    // the UI cannot imply a check happened that could not happen.
    const ev = describeEvidence(legacy(), JOHN_1, 'Manchester');
    expect(ev.employeeNumber).toBe(EVIDENCE.NOT_COMPARABLE);
  });

  it('one-sided values are NOT_COMPARABLE rather than DIFFERS', () => {
    expect(describeEvidence(legacy(), { ...JOHN_1, location: 'Leeds' }, null).location).toBe(EVIDENCE.NOT_COMPARABLE);
    expect(describeEvidence(legacy(), { ...JOHN_1, location: null }, 'Leeds').location).toBe(EVIDENCE.NOT_COMPARABLE);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('7. grouping is for review only — it is NOT identity', () => {
  const cases = [
    { id: 'a', employeeName: 'John Smith', employeeId: null },
    { id: 'b', employeeName: 'John Smith', employeeId: null },
    { id: 'c', employeeName: 'john smith', employeeId: null },
    { id: 'd', employeeName: 'Dana Keys',  employeeId: null },
  ];

  it('7. same-name cases group together for review', () => {
    const groups = groupLegacyForReview(cases, [JOHN_1, DANA]);
    expect(groups).toHaveLength(2);
    const john = groups.find(g => g.key === 'john smith');
    expect(john.cases.map(c => c.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('7. a group carries NO shared identity and NO group-level decision', () => {
    const groups = groupLegacyForReview(cases, [JOHN_1, DANA]);
    const john = groups.find(g => g.key === 'john smith');
    // There is deliberately nothing here for a caller to reach for.
    expect(john.employeeId).toBeUndefined();
    expect(john.resolvedEmployeeId).toBeUndefined();
    expect(john.decision).toBeUndefined();
    // Each case keeps its OWN classification.
    john.cases.forEach(c => expect(c.classification.state).toBeDefined());
  });

  it('7. three same-name cases may resolve to TWO different employees', () => {
    // The scenario the whole distinction exists for.
    const reconciled = [
      { id: 'a', employeeName: 'John Smith', employeeId: 'uuid-john-1' },
      { id: 'b', employeeName: 'John Smith', employeeId: 'uuid-john-1' },
      { id: 'c', employeeName: 'John Smith', employeeId: 'uuid-john-2' },
    ];
    const groups = groupLegacyForReview(reconciled, [JOHN_1, JOHN_2]);
    expect(groups).toHaveLength(1);                       // one review group
    const ids = groups[0].cases.map(c => c.classification.employeeId);
    expect(new Set(ids).size).toBe(2);                    // TWO identities
    groups[0].cases.forEach(c => expect(c.classification.state).toBe(RECONCILIATION.RESOLVED));
  });

  it('7. grouping does NOT rewrite any case\'s historical employee_name', () => {
    const groups = groupLegacyForReview(cases, [JOHN_1, DANA]);
    const john = groups.find(g => g.key === 'john smith');
    // 'john smith' (case c) keeps its own spelling; it is not normalised to the
    // group label. The uuid establishes identity; the stored name is a
    // point-in-time snapshot.
    expect(john.cases.find(c => c.id === 'c').employeeName).toBe('john smith');
    expect(john.cases.find(c => c.id === 'a').employeeName).toBe('John Smith');
  });

  it('nameless cases are not bundled into a fictitious shared subject', () => {
    const groups = groupLegacyForReview(
      [{ id: 'x', employeeName: null }, { id: 'y', employeeName: '' }], []
    );
    expect(groups).toHaveLength(2);
    groups.forEach(g => expect(g.cases).toHaveLength(1));
  });

  it('summariseGroup counts states and asserts nothing about identity', () => {
    const groups = groupLegacyForReview(cases, [JOHN_1, JOHN_2, DANA]);
    const john = groups.find(g => g.key === 'john smith');
    const s = summariseGroup(john);
    expect(s.total).toBe(3);
    expect(s.ambiguous).toBe(3);        // JOHN_1 + JOHN_2 both answer
    expect(s.allResolved).toBe(false);
    expect(s.resolved).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('every unresolved state is reconcilable by a HUMAN', () => {
  it('AMBIGUOUS and CONFLICT are reconcilable — a person is what settles them', () => {
    // A machine may not pick, but a human must not be blocked from deciding.
    [RECONCILIATION.UNRECONCILED, RECONCILIATION.CANDIDATE,
     RECONCILIATION.AMBIGUOUS, RECONCILIATION.CONFLICT].forEach(s => {
      expect(isReconcilable(s)).toBe(true);
    });
    expect(isReconcilable(RECONCILIATION.RESOLVED)).toBe(false);
  });

  it('the classifier is total — every case lands in exactly one known state', () => {
    const inputs = [
      legacy(), legacy({ employeeName: null }), legacy({ employeeName: 'Nobody' }),
      legacy({ employeeId: 'x' }), legacy({ employeeEmail: 'a@b.c' }),
      {}, { id: 'z' },
    ];
    inputs.forEach(i => {
      const st = classifyCase(i, [JOHN_1, JOHN_2]);
      expect(Object.values(RECONCILIATION)).toContain(st.state);
    });
  });
});
