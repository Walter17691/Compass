import { describe, it, expect } from 'vitest';
import { isPro, isSubscribed, pricePerLocationFor, estimateMonthlyPrice, LOCATION_PRICE_TIERS } from '../lib/plan.js';

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

describe('isSubscribed', () => {
  it('requires both a pro plan and an active Stripe subscription status', () => {
    expect(isSubscribed({ plan: 'pro', stripe_subscription_status: 'active' })).toBe(true);
    expect(isSubscribed({ plan: 'pro', stripe_subscription_status: 'past_due' })).toBe(false);
    expect(isSubscribed({ plan: 'pro', stripe_subscription_status: 'canceled' })).toBe(false);
    expect(isSubscribed({ plan: 'free', stripe_subscription_status: 'active' })).toBe(false);
    expect(isSubscribed(null)).toBe(false);
    expect(isSubscribed({})).toBe(false);
  });
});

describe('pricePerLocationFor', () => {
  it('charges the 1-location rate for a single location', () => {
    expect(pricePerLocationFor(1)).toBe(279);
  });

  it('charges the 2-5 band rate at the low and high ends', () => {
    expect(pricePerLocationFor(2)).toBe(119);
    expect(pricePerLocationFor(5)).toBe(119);
  });

  it('charges the 6-15 band rate', () => {
    expect(pricePerLocationFor(6)).toBe(95);
    expect(pricePerLocationFor(15)).toBe(95);
  });

  it('charges the 16-50 band rate', () => {
    expect(pricePerLocationFor(16)).toBe(75);
    expect(pricePerLocationFor(50)).toBe(75);
  });

  it('returns null past the top band — 51+ is custom/Enterprise pricing', () => {
    expect(pricePerLocationFor(51)).toBeNull();
  });

  it('treats zero or negative location counts as at least 1', () => {
    expect(pricePerLocationFor(0)).toBe(279);
    expect(pricePerLocationFor(-3)).toBe(279);
  });
});

describe('estimateMonthlyPrice', () => {
  it('is location count times the applicable band rate — whole subscription at one rate, not graduated', () => {
    expect(estimateMonthlyPrice(1)).toBe(279);
    expect(estimateMonthlyPrice(3)).toBe(3 * 119);
    expect(estimateMonthlyPrice(10)).toBe(10 * 95);
    expect(estimateMonthlyPrice(20)).toBe(20 * 75);
  });

  it('is null past the top band', () => {
    expect(estimateMonthlyPrice(75)).toBeNull();
  });
});

describe('LOCATION_PRICE_TIERS', () => {
  it('covers 1 through 50 with no gaps or overlaps', () => {
    const maxes = LOCATION_PRICE_TIERS.map(t => t.maxLocations);
    expect(maxes).toEqual([1, 5, 15, 50]);
  });
});
