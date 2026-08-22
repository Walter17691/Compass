import { describe, it, expect } from 'vitest';
import { estimateExposure, capsAreStale, CAPS_AS_OF } from '../lib/tribunalEstimate.js';

describe('estimateExposure', () => {
  it('returns null when no weekly pay is given', () => {
    expect(estimateExposure({})).toBeNull();
    expect(estimateExposure({ weeklyPay: 0 })).toBeNull();
  });

  it('computes a basic award using the age-band multiplier', () => {
    // Age 45, 5 years' service, all in the 41+ band -> 1.5 weeks/year
    const r = estimateExposure({ weeklyPay: 500, ageAtDismissal: 45, yearsService: 5 });
    expect(r.basicAward).toBe(500 * 1.5 * 5);
  });

  it('caps weekly pay at the statutory maximum for the basic award', () => {
    const capped = estimateExposure({ weeklyPay: 2000, ageAtDismissal: 45, yearsService: 1 });
    const uncappedEquivalent = estimateExposure({ weeklyPay: 700, ageAtDismissal: 45, yearsService: 1 });
    expect(capped.basicAward).toBe(uncappedEquivalent.basicAward);
  });

  it('caps years of service at 20', () => {
    const r30 = estimateExposure({ weeklyPay: 500, ageAtDismissal: 45, yearsService: 30 });
    const r20 = estimateExposure({ weeklyPay: 500, ageAtDismissal: 45, yearsService: 20 });
    expect(r30.basicAward).toBe(r20.basicAward);
  });

  it('assumes the 22-40 band when age is not supplied', () => {
    const r = estimateExposure({ weeklyPay: 500, yearsService: 2 });
    expect(r.ageAssumed).toBe(true);
    expect(r.basicAward).toBe(500 * 1 * 2);
  });

  it('caps the compensatory award for ordinary unfair dismissal', () => {
    const r = estimateExposure({ weeklyPay: 5000, ageAtDismissal: 45, yearsService: 1, caseType: 'Misconduct' });
    expect(r.compensatoryUncapped).toBe(false);
    expect(r.compensatoryHigh).toBeLessThanOrEqual(115115);
  });

  it('does not cap the compensatory award for discrimination claims', () => {
    const r = estimateExposure({ weeklyPay: 5000, ageAtDismissal: 45, yearsService: 1, caseType: 'Discrimination' });
    expect(r.compensatoryUncapped).toBe(true);
    expect(r.compensatoryHigh).toBeGreaterThan(115115);
  });

  it('totals equal basic + compensatory range', () => {
    const r = estimateExposure({ weeklyPay: 500, ageAtDismissal: 30, yearsService: 3, caseType: 'Grievance' });
    expect(r.totalLow).toBe(r.basicAward + r.compensatoryLow);
    expect(r.totalHigh).toBe(r.basicAward + r.compensatoryHigh);
  });

  it('is not stale right after CAPS_AS_OF', () => {
    expect(capsAreStale(new Date(CAPS_AS_OF))).toBe(false);
  });

  it('is not stale a few months after CAPS_AS_OF', () => {
    const sixMonthsLater = new Date(CAPS_AS_OF);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    expect(capsAreStale(sixMonthsLater)).toBe(false);
  });

  it('is stale more than ~13 months after CAPS_AS_OF', () => {
    const fourteenMonthsLater = new Date(CAPS_AS_OF);
    fourteenMonthsLater.setMonth(fourteenMonthsLater.getMonth() + 14);
    expect(capsAreStale(fourteenMonthsLater)).toBe(true);
  });

  it('surfaces capsStale on the exposure result', () => {
    const fresh = estimateExposure({ weeklyPay: 500, ageAtDismissal: 30, yearsService: 3 });
    expect(fresh.capsStale).toBe(false);
  });
});
