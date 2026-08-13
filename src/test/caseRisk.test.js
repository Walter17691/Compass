import { describe, it, expect } from 'vitest';
import { computeCaseRisk, categoryLabel } from '../lib/caseRisk';

const baseCase = { id: 'case1', employeeName: 'Jordan Test', caseType: 'misconduct', evidence: [], stage: 'investigation' };

describe('computeCaseRisk — procedural risk and conflict of interest', () => {
  it('lists an open procedural guardrail signal under procedural risk', () => {
    const caseSignals = [{ id: 's1', caseId: 'case1', type: 'process_risk', status: 'open', title: 'Outcome letter may be missing the right of appeal', reasoning: 'x', sourceRefs: [] }];
    const items = computeCaseRisk(baseCase, { caseSignals });
    expect(items).toContainEqual(expect.objectContaining({ category: 'procedural', label: 'Outcome letter may be missing the right of appeal' }));
  });

  it('routes a chair-independence signal to conflict of interest, not procedural', () => {
    const caseSignals = [{ id: 's1', caseId: 'case1', type: 'process_risk', status: 'open', title: 'Same person chaired the investigation and the disciplinary hearing', reasoning: 'x', sourceRefs: [] }];
    const items = computeCaseRisk(baseCase, { caseSignals });
    expect(items.find(i => i.category === 'conflict_of_interest')).toBeTruthy();
    expect(items.find(i => i.category === 'procedural')).toBeUndefined();
  });

  it('routes an appeal-manager-conflict signal to conflict of interest', () => {
    const caseSignals = [{ id: 's1', caseId: 'case1', type: 'process_risk', status: 'open', title: 'The Appeal Manager made the original decision', reasoning: 'x', sourceRefs: [] }];
    const items = computeCaseRisk(baseCase, { caseSignals });
    expect(items.find(i => i.category === 'conflict_of_interest')).toBeTruthy();
  });

  it('ignores signals from other cases and resolved signals', () => {
    const caseSignals = [
      { id: 's1', caseId: 'other-case', type: 'process_risk', status: 'open', title: 'x', reasoning: '', sourceRefs: [] },
      { id: 's2', caseId: 'case1', type: 'process_risk', status: 'resolved', title: 'y', reasoning: '', sourceRefs: [] },
    ];
    expect(computeCaseRisk(baseCase, { caseSignals })).toEqual([]);
  });
});

describe('computeCaseRisk — evidence gap and new evidence', () => {
  it('flags an allegation with no evidence linked, regardless of status', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'unreviewed' }];
    const items = computeCaseRisk(baseCase, { allegations });
    expect(items).toContainEqual(expect.objectContaining({ category: 'evidence_gap', label: 'No evidence linked: "Unauthorised absence"' }));
  });

  it('does not flag an allegation with evidence linked', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'unreviewed' }];
    const cs = { ...baseCase, evidence: [{ name: 'cctv.mp4', allegationId: 'a1' }] };
    const items = computeCaseRisk(cs, { allegations });
    expect(items.find(i => i.category === 'evidence_gap')).toBeUndefined();
  });

  it('flags evidence added after a finding was decided', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decidedAt: '2026-08-01T00:00:00.000Z' }];
    const cs = { ...baseCase, evidence: [{ name: 'new-statement.pdf', allegationId: 'a1', date: '10/08/2026' }] };
    const items = computeCaseRisk(cs, { allegations });
    expect(items).toContainEqual(expect.objectContaining({ category: 'new_evidence' }));
  });

  it('does not flag new evidence when nothing was added after the finding', () => {
    const allegations = [{ id: 'a1', caseId: 'case1', title: 'Unauthorised absence', status: 'substantiated', decidedAt: '2026-08-10T00:00:00.000Z' }];
    const cs = { ...baseCase, evidence: [{ name: 'old.pdf', allegationId: 'a1', date: '01/08/2026' }] };
    const items = computeCaseRisk(cs, { allegations });
    expect(items.find(i => i.category === 'new_evidence')).toBeUndefined();
  });
});

describe('computeCaseRisk — appeal vulnerability', () => {
  it('flags an appeal ground with a potential issue recorded', () => {
    const caseSignals = [{
      id: 's1', caseId: 'case1', type: 'process_risk', status: 'open',
      title: 'Appeal ground: The sanction was disproportionate',
      reasoning: 'Ground: The sanction was disproportionate\n\nEmployee’s argument: x\n\nCompass review: y\n\nPotential issue: No comparison to similar cases was recorded.',
      sourceRefs: [],
    }];
    const items = computeCaseRisk(baseCase, { caseSignals });
    expect(items).toContainEqual(expect.objectContaining({ category: 'appeal_vulnerability', detail: 'No comparison to similar cases was recorded.' }));
  });

  it('does not flag an appeal ground with no potential issue', () => {
    const caseSignals = [{
      id: 's1', caseId: 'case1', type: 'process_risk', status: 'open',
      title: 'Appeal ground: New evidence not considered',
      reasoning: 'Ground: New evidence not considered\n\nEmployee’s argument: x\n\nCompass review: y',
      sourceRefs: [],
    }];
    const items = computeCaseRisk(baseCase, { caseSignals });
    expect(items.find(i => i.category === 'appeal_vulnerability')).toBeUndefined();
  });
});

describe('computeCaseRisk — policy deviation', () => {
  it('lists a policy deviation audit entry for this case', () => {
    const auditLog = [{ caseId: 'case1', action: 'Policy deviation recorded', detail: 'Policy expectation: "X" — Actual: Y' }];
    const items = computeCaseRisk(baseCase, { auditLog });
    expect(items).toContainEqual(expect.objectContaining({ category: 'policy_deviation', detail: 'Policy expectation: "X" — Actual: Y' }));
  });

  it('ignores audit entries for other cases or other actions', () => {
    const auditLog = [
      { caseId: 'other-case', action: 'Policy deviation recorded', detail: 'x' },
      { caseId: 'case1', action: 'Meeting saved', detail: 'x' },
    ];
    expect(computeCaseRisk(baseCase, { auditLog })).toEqual([]);
  });
});

describe('computeCaseRisk — delay', () => {
  it('lists an overdue item for this case', () => {
    const dueSoon = [{ caseId: 'case1', label: 'Investigation meeting overdue', overdue: true, daysOverdue: 3 }];
    const items = computeCaseRisk(baseCase, { dueSoon });
    expect(items).toContainEqual(expect.objectContaining({ category: 'delay', label: 'Investigation meeting overdue', detail: '3 days overdue' }));
  });

  it('ignores items that are due soon but not yet overdue', () => {
    const dueSoon = [{ caseId: 'case1', label: 'Investigation meeting', overdue: false, daysOverdue: 0 }];
    expect(computeCaseRisk(baseCase, { dueSoon })).toEqual([]);
  });

  it('ignores overdue items for other cases', () => {
    const dueSoon = [{ caseId: 'other-case', label: 'x', overdue: true, daysOverdue: 1 }];
    expect(computeCaseRisk(baseCase, { dueSoon })).toEqual([]);
  });
});

describe('computeCaseRisk — outstanding grievance', () => {
  it('flags when the same employee has another open grievance case', () => {
    const cases = [baseCase, { id: 'case2', employeeName: 'Jordan Test', caseType: 'grievance', stage: 'investigation' }];
    const items = computeCaseRisk(baseCase, { cases });
    expect(items).toContainEqual(expect.objectContaining({ category: 'outstanding_grievance' }));
  });

  it('does not flag a closed grievance case', () => {
    const cases = [baseCase, { id: 'case2', employeeName: 'Jordan Test', caseType: 'grievance', stage: 'closed' }];
    expect(computeCaseRisk(baseCase, { cases }).find(i => i.category === 'outstanding_grievance')).toBeUndefined();
  });

  it('does not flag a different employee’s grievance', () => {
    const cases = [baseCase, { id: 'case2', employeeName: 'Someone Else', caseType: 'grievance', stage: 'investigation' }];
    expect(computeCaseRisk(baseCase, { cases }).find(i => i.category === 'outstanding_grievance')).toBeUndefined();
  });
});

describe('computeCaseRisk — missing medical info and reasonable adjustments', () => {
  const attendanceCase = { ...baseCase, caseType: 'attendance' };

  it('flags no wellbeing context recorded for a health-relevant case type', () => {
    const items = computeCaseRisk(attendanceCase, { wellbeingNotes: [] });
    expect(items).toContainEqual(expect.objectContaining({ category: 'missing_medical_info' }));
  });

  it('does not flag missing medical info for a case type where health context is not typically relevant', () => {
    const items = computeCaseRisk(baseCase, { wellbeingNotes: [] });
    expect(items.find(i => i.category === 'missing_medical_info')).toBeUndefined();
  });

  it('does not flag missing medical info when a wellbeing note exists for the employee', () => {
    const wellbeingNotes = [{ employeeName: 'Jordan Test', type: 'chat', content: 'x' }];
    const items = computeCaseRisk(attendanceCase, { wellbeingNotes });
    expect(items.find(i => i.category === 'missing_medical_info')).toBeUndefined();
  });

  it('flags an outstanding reasonable-adjustment follow-up', () => {
    const wellbeingNotes = [{ employeeName: 'Jordan Test', type: 'adjustment', content: 'Discussed reduced hours', followUpDate: '2026-08-20', followUpDone: false }];
    const items = computeCaseRisk(attendanceCase, { wellbeingNotes });
    expect(items).toContainEqual(expect.objectContaining({ category: 'reasonable_adjustment', detail: 'Discussed reduced hours' }));
  });

  it('does not flag a reasonable-adjustment note once its follow-up is done', () => {
    const wellbeingNotes = [{ employeeName: 'Jordan Test', type: 'adjustment', content: 'x', followUpDate: '2026-08-20', followUpDone: true }];
    const items = computeCaseRisk(attendanceCase, { wellbeingNotes });
    expect(items.find(i => i.category === 'reasonable_adjustment')).toBeUndefined();
  });
});

describe('computeCaseRisk — clean case', () => {
  it('returns no items when there is nothing to flag', () => {
    expect(computeCaseRisk(baseCase, {})).toEqual([]);
  });
});

describe('categoryLabel', () => {
  it('returns the human-readable label for a known category', () => {
    expect(categoryLabel('evidence_gap')).toBe('Evidence gap');
  });

  it('falls back to the raw id for an unknown category', () => {
    expect(categoryLabel('bogus')).toBe('bogus');
  });
});
