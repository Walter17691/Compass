import { describe, it, expect } from 'vitest';
import { isPro, canUseFeature, canCreateCase } from '../lib/plan.js';

describe('isPro', () => {
  it('is false for a free org, missing org, or missing plan field', () => {
    expect(isPro({ plan: 'free' })).toBe(false);
    expect(isPro({})).toBe(false);
    expect(isPro(null)).toBe(false);
  });

  it('is true only for plan "pro"', () => {
    expect(isPro({ plan: 'pro' })).toBe(true);
  });
});

describe('canUseFeature', () => {
  it('blocks gated features on the free plan', () => {
    expect(canUseFeature({ plan: 'free' }, 'portal')).toBe(false);
    expect(canUseFeature({ plan: 'free' }, 'calendar')).toBe(false);
    expect(canUseFeature({ plan: 'free' }, 'dsar')).toBe(false);
    expect(canUseFeature({ plan: 'free' }, 'digest')).toBe(false);
  });

  it('allows gated features on pro', () => {
    expect(canUseFeature({ plan: 'pro' }, 'portal')).toBe(true);
  });

  it('allows non-gated features regardless of plan', () => {
    expect(canUseFeature({ plan: 'free' }, 'something-else')).toBe(true);
  });
});

describe('canCreateCase', () => {
  it('allows the first active case on the free plan', () => {
    expect(canCreateCase({ plan: 'free' }, 0)).toBe(true);
  });

  it('blocks a second active case on the free plan', () => {
    expect(canCreateCase({ plan: 'free' }, 1)).toBe(false);
  });

  it('allows unlimited active cases on pro', () => {
    expect(canCreateCase({ plan: 'pro' }, 50)).toBe(true);
  });
});
