import { describe, it, expect } from 'vitest';
import { isAutomatable, getAutomationLevel, automationLevelLabel, AUTOMATABLE_RULE_IDS, AUTOMATION_LEVELS } from '../lib/automationLevels.js';

describe('isAutomatable (Phase 5, IP28)', () => {
  it('is true only for rules with a real administrative action behind them', () => {
    expect(isAutomatable('unsigned_meeting_record_stale')).toBe(true);
  });

  it('is false for rules with no safe automatable action', () => {
    expect(isAutomatable('overdue_task')).toBe(false);
    expect(isAutomatable('unanswered_question_stale')).toBe(false);
    expect(isAutomatable('process_risk_open')).toBe(false);
  });

  it('is false for an unknown rule id', () => {
    expect(isAutomatable('made_up_rule')).toBe(false);
  });
});

describe('getAutomationLevel (Phase 5, IP28)', () => {
  it('reads the configured level for an automatable rule', () => {
    expect(getAutomationLevel({ unsigned_meeting_record_stale: 'prepare' }, 'unsigned_meeting_record_stale')).toBe('prepare');
    expect(getAutomationLevel({ unsigned_meeting_record_stale: 'automate' }, 'unsigned_meeting_record_stale')).toBe('automate');
  });

  it('defaults to "suggest" when the automatable rule has no config yet', () => {
    expect(getAutomationLevel({}, 'unsigned_meeting_record_stale')).toBe('suggest');
    expect(getAutomationLevel(null, 'unsigned_meeting_record_stale')).toBe('suggest');
    expect(getAutomationLevel(undefined, 'unsigned_meeting_record_stale')).toBe('suggest');
  });

  it('defaults to "suggest" for an invalid stored value', () => {
    expect(getAutomationLevel({ unsigned_meeting_record_stale: 'nonsense' }, 'unsigned_meeting_record_stale')).toBe('suggest');
  });

  it('never elevates a non-automatable rule, even if the org config tries to', () => {
    expect(getAutomationLevel({ overdue_task: 'automate' }, 'overdue_task')).toBe('suggest');
    expect(getAutomationLevel({ process_risk_open: 'prepare' }, 'process_risk_open')).toBe('suggest');
  });
});

describe('automationLevelLabel (Phase 5, IP28)', () => {
  it('labels every real level', () => {
    AUTOMATION_LEVELS.forEach(level => {
      expect(automationLevelLabel(level)).not.toBe(level);
    });
  });

  it('falls back to the raw value for an unknown level', () => {
    expect(automationLevelLabel('mystery')).toBe('mystery');
  });
});

describe('AUTOMATABLE_RULE_IDS (Phase 5, IP28)', () => {
  it('is a small, deliberate list, not every rule', () => {
    expect(AUTOMATABLE_RULE_IDS.length).toBeGreaterThan(0);
    expect(AUTOMATABLE_RULE_IDS.length).toBeLessThan(4);
  });
});
