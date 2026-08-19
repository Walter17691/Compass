import { describe, it, expect } from 'vitest';
import { NEVER_AUTOMATE_ACTIONS, isNeverAutomate, capLevelForSafety, canAutomateRule, RULE_ACTION_TYPE } from '../lib/automationSafety.js';

describe('isNeverAutomate (Phase 5, IP29)', () => {
  it('recognizes every action on the spec\'s explicit never-automate list', () => {
    ['suspension', 'disciplinary_sanction', 'dismissal', 'grievance_rejection', 'appeal_rejection', 'discrimination_determination', 'redundancy_selection', 'contractual_term_change', 'high_impact_correspondence']
      .forEach(id => expect(isNeverAutomate(id)).toBe(true));
  });

  it('is false for an action type not on the list', () => {
    expect(isNeverAutomate('administrative_reminder')).toBe(false);
    expect(isNeverAutomate('made_up_action')).toBe(false);
    expect(isNeverAutomate(undefined)).toBe(false);
  });
});

describe('capLevelForSafety (Phase 5, IP29)', () => {
  it('downgrades Automate to Prepare for a hard-listed action type', () => {
    expect(capLevelForSafety('automate', 'dismissal')).toBe('prepare');
    expect(capLevelForSafety('automate', 'suspension')).toBe('prepare');
  });

  it('never downgrades all the way to Suggest — Prepare (draft for approval) stays available', () => {
    expect(capLevelForSafety('automate', 'dismissal')).not.toBe('suggest');
  });

  it('leaves Automate untouched for a safe action type', () => {
    expect(capLevelForSafety('automate', 'administrative_reminder')).toBe('automate');
  });

  it('leaves Suggest/Prepare untouched regardless of action type — the cap only ever applies to Automate', () => {
    expect(capLevelForSafety('suggest', 'dismissal')).toBe('suggest');
    expect(capLevelForSafety('prepare', 'dismissal')).toBe('prepare');
  });
});

describe('canAutomateRule (Phase 5, IP29)', () => {
  it('is true for the real registered rule, whose action type is not hard-listed', () => {
    expect(canAutomateRule('unsigned_meeting_record_stale')).toBe(true);
    expect(isNeverAutomate(RULE_ACTION_TYPE.unsigned_meeting_record_stale)).toBe(false);
  });

  it('fails closed for a rule with no registered action type, rather than defaulting to safe', () => {
    expect(canAutomateRule('some_future_rule_nobody_registered')).toBe(false);
  });
});

describe('NEVER_AUTOMATE_ACTIONS (Phase 5, IP29)', () => {
  it('matches the spec\'s own explicit list in full', () => {
    const ids = NEVER_AUTOMATE_ACTIONS.map(a => a.id);
    expect(ids).toEqual(['suspension', 'disciplinary_sanction', 'dismissal', 'grievance_rejection', 'appeal_rejection', 'discrimination_determination', 'redundancy_selection', 'contractual_term_change', 'high_impact_correspondence']);
  });

  it('every entry has a human-readable label', () => {
    NEVER_AUTOMATE_ACTIONS.forEach(a => expect(a.label).toBeTruthy());
  });
});
