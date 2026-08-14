import { describe, it, expect } from 'vitest';
import { computeInvestigationQualityGaps } from '../lib/investigationQuality.js';
import { INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist.js';

const csWithMeeting = { id: 'c1', evidence: [], meetings: [{ type: 'Investigation', record: 'Some record text' }] };

describe('computeInvestigationQualityGaps', () => {
  it('returns no gaps for a clean case: a recorded meeting, no allegations, no seeded checklist', () => {
    expect(computeInvestigationQualityGaps(csWithMeeting, [], [])).toEqual([]);
  });

  it('flags a missing investigation meeting record', () => {
    const cs = { id: 'c1', evidence: [], meetings: [] };
    const gaps = computeInvestigationQualityGaps(cs, [], []);
    expect(gaps).toContain('No investigation meeting has been recorded on this case yet.');
  });

  it('does not flag a meeting of the wrong type, or one with no record yet', () => {
    const cs = { id: 'c1', evidence: [], meetings: [{ type: 'Disciplinary', record: 'x' }, { type: 'Investigation', record: '' }] };
    const gaps = computeInvestigationQualityGaps(cs, [], []);
    expect(gaps).toContain('No investigation meeting has been recorded on this case yet.');
  });

  it('flags an allegation still in the unreviewed status', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'Left site early', status: 'unreviewed' }];
    const gaps = computeInvestigationQualityGaps(csWithMeeting, allegations, []);
    expect(gaps).toContain('Allegation not yet explored: "Left site early"');
  });

  it('does not flag an allegation that has moved past unreviewed', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'Left site early', status: 'evidence_gathering' }];
    const gaps = computeInvestigationQualityGaps(csWithMeeting, allegations, []);
    expect(gaps.some(g => g.includes('not yet explored'))).toBe(false);
  });

  it('flags a named person with no witness evidence recorded', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'x', status: 'evidence_gathering', peopleInvolved: 'Priya Shah' }];
    const gaps = computeInvestigationQualityGaps(csWithMeeting, allegations, []);
    expect(gaps).toContain('Witness(es) named but no witness evidence recorded: "x"');
  });

  it('does not flag when witness evidence has already been recorded', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'x', status: 'evidence_gathering', peopleInvolved: 'Priya Shah', witnessEvidence: 'Priya confirmed the account.' }];
    const gaps = computeInvestigationQualityGaps(csWithMeeting, allegations, []);
    expect(gaps.some(g => g.includes('Witness'))).toBe(false);
  });

  it('flags evidence mentioned in the allegation but not linked', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'x', status: 'evidence_gathering', description: 'CCTV shows them leaving early.' }];
    const gaps = computeInvestigationQualityGaps(csWithMeeting, allegations, []);
    expect(gaps).toContain('Evidence mentioned but not linked to the allegation: "x"');
  });

  it('does not flag mentioned evidence once it is linked to the allegation', () => {
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'x', status: 'evidence_gathering', description: 'CCTV shows them leaving early.' }];
    const cs = { ...csWithMeeting, evidence: [{ name: 'cctv.mp4', allegationId: 'a1' }] };
    const gaps = computeInvestigationQualityGaps(cs, allegations, []);
    expect(gaps.some(g => g.includes('Evidence mentioned'))).toBe(false);
  });

  it('skips the checklist-completeness check entirely when no checklist was ever seeded for this case', () => {
    const gaps = computeInvestigationQualityGaps(csWithMeeting, [], [{ id: 't1', caseId: 'c2', name: INVESTIGATION_CHECKLIST_STEPS[0].label, status: 'open' }]);
    expect(gaps.some(g => g.includes('checklist step'))).toBe(false);
  });

  it('flags outstanding checklist steps once the checklist has been seeded for this case, excluding the submit step itself', () => {
    const caseTasks = INVESTIGATION_CHECKLIST_STEPS.map((s, i) => ({ id: 't' + i, caseId: 'c1', name: s.label, status: 'open' }));
    const gaps = computeInvestigationQualityGaps(csWithMeeting, [], caseTasks);
    const gap = gaps.find(g => g.includes('checklist step'));
    expect(gap).toBeDefined();
    expect(gap).not.toContain('Submit findings to HR');
    expect(gap).toContain(String(INVESTIGATION_CHECKLIST_STEPS.length - 1));
  });

  it('does not flag the checklist once every non-submit step is done', () => {
    const caseTasks = INVESTIGATION_CHECKLIST_STEPS.slice(0, -1).map((s, i) => ({ id: 't' + i, caseId: 'c1', name: s.label, status: 'done' }));
    const gaps = computeInvestigationQualityGaps(csWithMeeting, [], caseTasks);
    expect(gaps.some(g => g.includes('checklist step'))).toBe(false);
  });
});
