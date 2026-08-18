import { describe, it, expect } from 'vitest';
import { OH_PROCESS_STEPS, ohStepIndex, ohStepStatus, advanceOhProcess, applyOhStepTransition } from '../lib/ohProcess.js';

describe('ohStepIndex (Phase 5, IP22)', () => {
  it('finds the index of a known step', () => {
    expect(ohStepIndex('concern_identified')).toBe(0);
    expect(ohStepIndex('review_date')).toBe(OH_PROCESS_STEPS.length - 1);
  });

  it('returns -1 for an unknown or missing step', () => {
    expect(ohStepIndex('not_a_step')).toBe(-1);
    expect(ohStepIndex(null)).toBe(-1);
    expect(ohStepIndex(undefined)).toBe(-1);
  });
});

describe('ohStepStatus (Phase 5, IP22)', () => {
  it('treats the first step as current and every other step as upcoming when nothing has started yet — there is always something actionable', () => {
    expect(ohStepStatus(null, 'concern_identified')).toBe('current');
    expect(ohStepStatus(null, 'consider_referral')).toBe('upcoming');
    expect(ohStepStatus({}, 'concern_identified')).toBe('current');
  });

  it('marks earlier steps done, the current step current, and later steps upcoming', () => {
    const ohProcess = { currentStep: 'consent' };
    expect(ohStepStatus(ohProcess, 'concern_identified')).toBe('done');
    expect(ohStepStatus(ohProcess, 'consider_referral')).toBe('done');
    expect(ohStepStatus(ohProcess, 'consent')).toBe('current');
    expect(ohStepStatus(ohProcess, 'prepare')).toBe('upcoming');
    expect(ohStepStatus(ohProcess, 'review_date')).toBe('upcoming');
  });
});

describe('advanceOhProcess (Phase 5, IP22)', () => {
  it('sets currentStep and stamps a history entry on first arrival', () => {
    const result = advanceOhProcess(null, 'concern_identified');
    expect(result.currentStep).toBe('concern_identified');
    expect(result.history.concern_identified).toBeTruthy();
  });

  it('never overwrites an already-recorded history timestamp', () => {
    const first = advanceOhProcess(null, 'concern_identified');
    const firstTimestamp = first.history.concern_identified;
    const second = advanceOhProcess(first, 'concern_identified');
    expect(second.history.concern_identified).toBe(firstTimestamp);
  });

  it('merges extra fields (consent, recommendations, review date) alongside the step transition', () => {
    const result = advanceOhProcess({ currentStep: 'hr_review', history: { hr_review: '2026-01-01T00:00:00.000Z' } }, 'recommendations', { recommendations: 'Recommend a phased return over 4 weeks.' });
    expect(result.currentStep).toBe('recommendations');
    expect(result.recommendations).toBe('Recommend a phased return over 4 weeks.');
    expect(result.history.hr_review).toBe('2026-01-01T00:00:00.000Z');
    expect(result.history.recommendations).toBeTruthy();
  });

  it('preserves prior history entries when advancing to a new step', () => {
    const step1 = advanceOhProcess(null, 'concern_identified');
    const step2 = advanceOhProcess(step1, 'consider_referral');
    expect(step2.history.concern_identified).toBeTruthy();
    expect(step2.history.consider_referral).toBeTruthy();
  });

  it('does not mutate the original ohProcess object', () => {
    const original = { currentStep: 'concern_identified', history: { concern_identified: '2026-01-01T00:00:00.000Z' } };
    advanceOhProcess(original, 'consider_referral');
    expect(original.currentStep).toBe('concern_identified');
    expect(original.history.consider_referral).toBeUndefined();
  });
});

describe('applyOhStepTransition (Phase 5, IP22)', () => {
  it('advances the case ohProcess and mirrors "submit" into the legacy ohReferralDate field when it was blank', () => {
    const cs = { id: 'c1', ohProcess: null, ohReferralDate: null };
    const result = applyOhStepTransition(cs, 'submit');
    expect(result.ohProcess.currentStep).toBe('submit');
    expect(result.ohReferralDate).toBe(result.ohProcess.history.submit.split('T')[0]);
  });

  it('mirrors "received" into ohReportReceivedDate the same way', () => {
    const cs = { id: 'c1', ohProcess: { currentStep: 'await_report', history: {} }, ohReportReceivedDate: null };
    const result = applyOhStepTransition(cs, 'received');
    expect(result.ohReportReceivedDate).toBe(result.ohProcess.history.received.split('T')[0]);
  });

  it('never overwrites a legacy date field HR already entered by hand', () => {
    const cs = { id: 'c1', ohProcess: null, ohReferralDate: '2026-01-05' };
    const result = applyOhStepTransition(cs, 'submit');
    expect(result.ohReferralDate).toBe('2026-01-05');
  });

  it('leaves the legacy date fields untouched for steps that are not submit/received', () => {
    const cs = { id: 'c1', ohProcess: null, ohReferralDate: null, ohReportReceivedDate: null };
    const result = applyOhStepTransition(cs, 'concern_identified');
    expect(result.ohReferralDate).toBeNull();
    expect(result.ohReportReceivedDate).toBeNull();
  });

  it('merges extra fields (e.g. consentObtained) into the resulting ohProcess', () => {
    const cs = { id: 'c1', ohProcess: { currentStep: 'consider_referral', history: {} } };
    const result = applyOhStepTransition(cs, 'consent', { consentObtained: true });
    expect(result.ohProcess.consentObtained).toBe(true);
    expect(result.ohProcess.currentStep).toBe('consent');
  });

  it('does not mutate the original case object', () => {
    const cs = { id: 'c1', ohProcess: null, ohReferralDate: null };
    applyOhStepTransition(cs, 'submit');
    expect(cs.ohProcess).toBeNull();
    expect(cs.ohReferralDate).toBeNull();
  });
});
