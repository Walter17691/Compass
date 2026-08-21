import { describe, it, expect } from 'vitest';
import { computeSiteRiskFlags } from '../lib/riskMap';

describe('computeSiteRiskFlags', () => {
  it('flags a site with elevated case volume relative to the average', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 15, London: 5, 'Not specified': 100 },
      locationDurations: {},
      companyAvgDuration: null,
      bottlenecks: [],
      orgEvents: [],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    expect(manchester.flags.some(f => f.category === 'er_volume')).toBe(true);
    const london = result.find(r => r.site === 'London');
    expect(london.flags.some(f => f.category === 'er_volume')).toBe(false);
  });

  it('never includes "Not specified" as a site', () => {
    const result = computeSiteRiskFlags({ locationCounts: { 'Not specified': 100 }, locationDurations: {}, companyAvgDuration: null, bottlenecks: [], orgEvents: [] });
    expect(result).toEqual([]);
  });

  it('flags above-average case duration once both the site and company-wide sample sizes are met', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 5, London: 5 },
      locationDurations: { Manchester: { avg_days: 20, count: 4 } },
      companyAvgDuration: 10,
      companyAvgDurationSampleSize: 3,
      bottlenecks: [],
      orgEvents: [],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    expect(manchester.flags.some(f => f.category === 'case_delay')).toBe(true);
  });

  it('does not flag duration below the minimum sample size', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 5, London: 5 },
      locationDurations: { Manchester: { avg_days: 20, count: 1 } },
      companyAvgDuration: 10,
      companyAvgDurationSampleSize: 3,
      bottlenecks: [],
      orgEvents: [],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    expect(manchester.flags.some(f => f.category === 'case_delay')).toBe(false);
  });

  // Phase 6.5 hardening (Batch 7) — the site's own sample was already
  // checked; this proves the company-wide baseline's sample size is now
  // checked too, independently. A site with plenty of its own closed
  // cases shouldn't get flagged against a company average built on too
  // few cases org-wide to mean anything.
  it('does not flag duration when the company-wide baseline itself is below the minimum sample size', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 5, London: 5 },
      locationDurations: { Manchester: { avg_days: 20, count: 4 } },
      companyAvgDuration: 10,
      companyAvgDurationSampleSize: 1,
      bottlenecks: [],
      orgEvents: [],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    expect(manchester.flags.some(f => f.category === 'case_delay')).toBe(false);
  });

  it('does not flag duration when the company-wide sample size is omitted entirely', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 5, London: 5 },
      locationDurations: { Manchester: { avg_days: 20, count: 4 } },
      companyAvgDuration: 10,
      bottlenecks: [],
      orgEvents: [],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    expect(manchester.flags.some(f => f.category === 'case_delay')).toBe(false);
  });

  it('flags a site appearing in any process bottleneck\'s location breakdown', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 5, London: 5 },
      locationDurations: {},
      companyAvgDuration: null,
      bottlenecks: [{ stage: 'Investigation', byLocation: [{ location: 'Manchester', caseCount: 3 }] }],
      orgEvents: [],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    const london = result.find(r => r.site === 'London');
    expect(manchester.flags.some(f => f.category === 'process_risk')).toBe(true);
    expect(london.flags.some(f => f.category === 'process_risk')).toBe(false);
  });

  it('flags a site named in a logged organisational event\'s affected locations', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 5, London: 5 },
      locationDurations: {},
      companyAvgDuration: null,
      bottlenecks: [],
      orgEvents: [{ affectedLocations: ['Manchester'] }],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    expect(manchester.flags.some(f => f.category === 'operational_change')).toBe(true);
  });

  // Phase 6.5 hardening (Batch 11) — used to sort by flag count, most
  // flags first, which is itself an implicit blended severity score
  // (conflating flag COUNT with how bad a site's situation is) —
  // contradicting RiskMapPanel's own "never a ranking" UI text. Now
  // alphabetical, so a site's position never implies a verdict.
  it('sorts sites alphabetically, not by flag count — never an implicit ranking', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 15, London: 5 },
      locationDurations: {},
      companyAvgDuration: null,
      bottlenecks: [{ stage: 'x', byLocation: [{ location: 'Manchester', caseCount: 1 }] }],
      orgEvents: [{ affectedLocations: ['Manchester'] }],
    });
    expect(result.map(r => r.site)).toEqual(['London', 'Manchester']);
    const manchester = result.find(r => r.site === 'Manchester');
    const london = result.find(r => r.site === 'London');
    expect(manchester.flags.length).toBeGreaterThan(london.flags.length);
  });

  it('does not flag elevated volume below the minimum sample size, even at a high multiplier', () => {
    const result = computeSiteRiskFlags({
      locationCounts: { Manchester: 2, London: 1 },
      locationDurations: {},
      companyAvgDuration: null,
      bottlenecks: [],
      orgEvents: [],
    });
    const manchester = result.find(r => r.site === 'Manchester');
    expect(manchester.flags.some(f => f.category === 'er_volume')).toBe(false);
  });

  it('returns an empty array for no location data', () => {
    expect(computeSiteRiskFlags({ locationCounts: {}, locationDurations: {}, companyAvgDuration: null, bottlenecks: [], orgEvents: [] })).toEqual([]);
  });
});
