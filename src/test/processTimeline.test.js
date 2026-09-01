import { describe, it, expect } from 'vitest';
import { computeStageProgress } from '../lib/processTimeline';

describe('computeStageProgress', () => {
  it('a brand-new misconduct case has no completed stages, "intake" current, and everything else upcoming', () => {
    const progress = computeStageProgress({ caseType: 'misconduct', meetings: [] });
    expect(progress.completed).toEqual([]);
    expect(progress.current.id).toBe('intake');
    expect(progress.upcoming.map(s=>s.id)).toEqual(['investigation','inv_report','disciplinary','outcome','appeal','closed']);
    expect(progress.missingSteps).toEqual([]);
  });

  it('a case with only a disciplinary meeting (no investigation) reaching "disciplinary" stage flags the missing investigation step', () => {
    const cs = { caseType: 'misconduct', stage: 'disciplinary', meetings: [{ type: 'Disciplinary', record: 'x' }] };
    const progress = computeStageProgress(cs);
    expect(progress.completed.map(s=>s.id)).toEqual(['intake','investigation','inv_report']);
    expect(progress.missingSteps).toContain('Investigation');
    expect(progress.missingSteps).toContain('Investigation review');
  });

  it('no missing steps once real evidence exists for every completed stage', () => {
    const cs = {
      caseType: 'misconduct',
      stage: 'outcome',
      investigationReport: 'findings...',
      meetings: [
        { type: 'Investigation', record: 'x' },
        { type: 'Disciplinary', record: 'x', letterOutput: 'the outcome letter' },
      ],
    };
    const progress = computeStageProgress(cs);
    expect(progress.completed.map(s=>s.id)).toEqual(['intake','investigation','inv_report','disciplinary']);
    expect(progress.missingSteps).toEqual([]);
  });

  // Human UAT remediation, Batch 2 hardening — letterOutput never recorded
  // which letter category produced it, so a disciplinary hearing
  // INVITATION used to satisfy the "outcome" stage's evidence check just
  // as well as a genuine outcome letter, hiding the fact that no decision
  // had actually been issued yet.
  it('flags the outcome step as missing evidence when the only letterOutput present is an invitation, not a genuine outcome', () => {
    const cs = {
      caseType: 'misconduct',
      stage: 'appeal',
      meetings: [
        { type: 'Investigation', record: 'x' },
        { type: 'Disciplinary', record: 'x', letterOutput: 'Dear Sam, please attend a disciplinary hearing...', letterType: 'invite' },
        { type: 'Appeal', record: 'x' },
      ],
    };
    const progress = computeStageProgress(cs);
    expect(progress.missingSteps).toContain('Outcome');
  });

  it('grievance-shaped case flags a missing hearing when it reached outcome without a grievance meeting', () => {
    const cs = { caseType: 'grievance', stage: 'outcome', outcome: 'Not upheld', meetings: [] };
    const progress = computeStageProgress(cs);
    expect(progress.completed.map(s=>s.id)).toEqual(['intake','hearing']);
    expect(progress.missingSteps).toEqual(['Grievance meeting']);
  });

  it('probation-shaped cases never report missing steps — the stage inference IS the evidence, so a check would be tautological', () => {
    const cs = { caseType: 'probation', stage: 'outcome', outcome: 'Pass', meetings: [] };
    const progress = computeStageProgress(cs);
    expect(progress.completed.length).toBeGreaterThan(0);
    expect(progress.missingSteps).toEqual([]);
  });

  it('reports an unrecognised explicit stage as "unknown position" rather than guessing', () => {
    const cs = { caseType: 'misconduct', stage: 'some_future_stage', meetings: [] };
    const progress = computeStageProgress(cs);
    expect(progress.current).toBeNull();
    expect(progress.completed).toEqual([]);
    expect(progress.upcoming).toEqual([]);
  });

  it('carries the resolved processType through for the panel to label the process', () => {
    const progress = computeStageProgress({ caseType: 'flexible working', meetings: [] });
    expect(progress.processType.id).toBe('flexible_working');
    expect(progress.processType.label).toBe('Flexible working');
  });
});
