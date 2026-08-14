import { describe, it, expect } from 'vitest';
import { computeCoachingTips } from '../lib/managerCoaching.js';

describe('computeCoachingTips', () => {
  it('returns no tips for a plain transcript with no triggers', () => {
    expect(computeCoachingTips('HR: Can you talk me through what happened? Employee: Sure, I was at my desk.', null)).toEqual([]);
  });

  it('surfaces an inconsistency coaching tip when meetingIntelligence flags one', () => {
    const meetingIntelligence = { possibleInconsistency: { earlier: 'I was at home', later: 'I was at the office', suggestedQuestion: 'x' } };
    const tips = computeCoachingTips('some transcript', meetingIntelligence);
    expect(tips.find(t => t.key === 'inconsistency')).toBeTruthy();
  });

  it('does not surface the inconsistency tip when there is none', () => {
    const tips = computeCoachingTips('some transcript', { possibleInconsistency: null });
    expect(tips.find(t => t.key === 'inconsistency')).toBeUndefined();
  });

  it('surfaces a wellbeing coaching tip on a health/wellbeing mention', () => {
    const tips = computeCoachingTips('Employee: I have been signed off with stress for two weeks.', null);
    expect(tips.find(t => t.key === 'wellbeing')).toBeTruthy();
  });

  it('is case-insensitive for wellbeing keywords', () => {
    const tips = computeCoachingTips('Employee: MY GP suggested I take some time off.', null);
    expect(tips.find(t => t.key === 'wellbeing')).toBeTruthy();
  });

  it('does not false-positive on unrelated words containing similar substrings', () => {
    const tips = computeCoachingTips('Employee: I was stressing about the deadline but I am fine now.', null);
    // "stressing" should not match \bstress(ed)?\b (word-boundary anchored)
    expect(tips.find(t => t.key === 'wellbeing')).toBeUndefined();
  });

  it('surfaces an outcome-language coaching tip on pre-judging phrasing', () => {
    const tips = computeCoachingTips("HR: We've already decided this is gross misconduct.", null);
    expect(tips.find(t => t.key === 'outcome_language')).toBeTruthy();
  });

  it('does not trip the outcome-language tip on genuinely open, fair phrasing', () => {
    const tips = computeCoachingTips("HR: We'll decide once we've heard your response, so take your time.", null);
    expect(tips.find(t => t.key === 'outcome_language')).toBeUndefined();
  });

  it('can surface multiple tips at once when more than one trigger is present', () => {
    const meetingIntelligence = { possibleInconsistency: { earlier: 'a', later: 'b', suggestedQuestion: 'c' } };
    const tips = computeCoachingTips("Employee: I've been signed off with stress. HR: We've already decided the outcome.", meetingIntelligence);
    expect(tips.map(t => t.key).sort()).toEqual(['inconsistency', 'outcome_language', 'wellbeing']);
  });

  it('treats missing/empty notes as no triggers rather than throwing', () => {
    expect(computeCoachingTips(undefined, null)).toEqual([]);
    expect(computeCoachingTips('', null)).toEqual([]);
  });
});
