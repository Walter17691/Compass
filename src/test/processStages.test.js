import { describe, it, expect } from 'vitest';
import { getProcessType, getStageDefinitions, stageLabel, PROCESS_TYPES } from '../lib/processStages';

describe('processStages', () => {
  it('every registered process type has at least 2 stages ending in "closed"', () => {
    PROCESS_TYPES.forEach(p => {
      expect(p.stages.length).toBeGreaterThan(1);
      expect(p.stages[p.stages.length - 1].id).toBe('closed');
    });
  });

  it('resolves known synonyms onto the same canonical entry', () => {
    expect(getProcessType('attendance').id).toBe('attendance');
    expect(getProcessType('absence').id).toBe('attendance');
    expect(getProcessType('attendance/sickness').id).toBe('attendance');
    expect(getProcessType('performance').id).toBe('capability');
    expect(getProcessType('capability').id).toBe('capability');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(getProcessType('  Probation  ').id).toBe('probation');
    expect(getProcessType('FLEXIBLE WORKING').id).toBe('flexible_working');
  });

  it('falls back to "other" for an unrecognized or missing case type', () => {
    expect(getProcessType('something made up').id).toBe('other');
    expect(getProcessType(undefined).id).toBe('other');
    expect(getProcessType('').id).toBe('other');
  });

  it('long-term sickness follows the spec\'s own worked stage sequence', () => {
    const ids = getStageDefinitions('long-term sickness').map(s => s.id);
    expect(ids).toEqual([
      'absence_identified', 'contact_welfare', 'medical_evidence', 'occupational_health',
      'adjustments_considered', 'review', 'capability_consideration', 'decision', 'closed',
    ]);
  });

  it('misconduct and grievance keep the exact stage ids caseStage.js already infers, unchanged', () => {
    expect(getStageDefinitions('misconduct').map(s => s.id)).toEqual(
      ['intake', 'investigation', 'inv_report', 'disciplinary', 'outcome', 'appeal', 'closed']
    );
    expect(getStageDefinitions('grievance').map(s => s.id)).toEqual(
      ['intake', 'hearing', 'outcome', 'appeal', 'closed']
    );
  });

  it('stageLabel returns the human label, or the raw id if not found', () => {
    expect(stageLabel('probation', 'check_in')).toBe('Check-in');
    expect(stageLabel('probation', 'not_a_real_stage')).toBe('not_a_real_stage');
  });
});
