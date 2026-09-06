import { describe, it, expect } from 'vitest';
import { computePctChange, isSignificantTrend, describeTrend, isSignificantDecrease, computeOverallVolumeTrend, rankSignificantCaseTypeChanges, getTrendPeriodBounds, describeVolumeSignal, rankSignificantThemeTrends, themeCaseIdsInPeriod } from '../lib/trendDetection';

describe('computePctChange', () => {
  it('computes a positive percentage increase', () => {
    expect(computePctChange(13, 10)).toBe(30);
  });

  it('computes a negative percentage for a decrease', () => {
    expect(computePctChange(7, 10)).toBe(-30);
  });

  it('returns null when there is no comparable prior period but current cases exist', () => {
    expect(computePctChange(5, 0)).toBeNull();
  });

  it('returns 0 when both periods are zero', () => {
    expect(computePctChange(0, 0)).toBe(0);
  });
});

describe('isSignificantTrend', () => {
  it('is not significant below the minimum sample size, even with a huge percentage', () => {
    expect(isSignificantTrend({ currentCount: 2, previousCount: 1 })).toBe(false);
  });

  it('is significant when the increase meets the threshold and sample size', () => {
    expect(isSignificantTrend({ currentCount: 13, previousCount: 10 })).toBe(true);
  });

  it('is not significant when the increase is below the threshold', () => {
    expect(isSignificantTrend({ currentCount: 11, previousCount: 10 })).toBe(false);
  });

  it('is significant for a genuinely new pattern with no prior period, above the sample floor', () => {
    expect(isSignificantTrend({ currentCount: 4, previousCount: 0 })).toBe(true);
  });

  it('is not significant for a new pattern below the sample floor', () => {
    expect(isSignificantTrend({ currentCount: 2, previousCount: 0 })).toBe(false);
  });

  it('handles a missing entry', () => {
    expect(isSignificantTrend(null)).toBe(false);
  });
});

describe('describeTrend', () => {
  it('never states or implies causation, and names concentrated locations', () => {
    const entry = { currentCount: 13, previousCount: 10, byLocation: { Manchester: 6, Leeds: 4, 'Not specified': 3 } };
    const text = describeTrend(entry, 'Grievance');
    expect(text).toContain('Compass has identified a pattern');
    expect(text).toContain('30%');
    expect(text).toContain('Manchester');
    expect(text).toContain('Leeds');
    expect(text).not.toContain('Not specified');
    expect(text.toLowerCase()).not.toContain('caused');
  });

  it('describes a decrease', () => {
    const entry = { currentCount: 7, previousCount: 10, byLocation: {} };
    expect(describeTrend(entry, 'Absence')).toContain('decreased 30%');
  });

  it('describes an emerging pattern with no prior period', () => {
    const entry = { currentCount: 5, previousCount: 0, byLocation: {} };
    const text = describeTrend(entry, 'Workload');
    expect(text).toContain('no recorded cases in the previous comparison period');
    expect(text).toContain('5 in the current period');
  });

  it('notes when no location breakdown is available', () => {
    const entry = { currentCount: 13, previousCount: 10, byLocation: {} };
    expect(describeTrend(entry, 'Grievance')).toContain('no location breakdown available yet');
  });

  // Phase 6.5 hardening (Batch 11) — "concentrated across 1 location"
  // doesn't read as real English; "across" implies spread over multiple
  // locations. A single location now reads "concentrated at X".
  it('uses "concentrated at X" (not "across 1 location") when only one location is involved', () => {
    const entry = { currentCount: 13, previousCount: 10, byLocation: { Manchester: 13 } };
    const text = describeTrend(entry, 'Grievance');
    expect(text).toContain('concentrated at Manchester');
    expect(text).not.toContain('across 1 location');
  });

  it('still uses "concentrated across N locations" for two or more', () => {
    const entry = { currentCount: 13, previousCount: 10, byLocation: { Manchester: 8, Leeds: 5 } };
    const text = describeTrend(entry, 'Grievance');
    expect(text).toContain('concentrated across 2 locations (Manchester, Leeds)');
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 8.5, MEDIUM) —
  // isSignificantTrend only floors the TOTAL currentCount; this location
  // breakdown had no per-location floor of its own, so naming
  // "concentrated at X" for a small site directly implied that site's own
  // count was close to the (small) org-wide total. Same MIN_SAMPLE_SIZE
  // floor as the trend overall, applied per location.
  it('excludes a location below the sample-size floor, even though the trend overall is significant (Prompt 11 audit, 8.5)', () => {
    const entry = { currentCount: 5, previousCount: 2, byLocation: { Manchester: 1 } };
    const text = describeTrend(entry, 'Grievance');
    expect(text).toContain('no location breakdown available yet');
    expect(text).not.toContain('Manchester');
  });

  it('shows only the locations that individually clear the floor, dropping the rest', () => {
    const entry = { currentCount: 8, previousCount: 3, byLocation: { Manchester: 5, Leeds: 2, Bristol: 1 } };
    const text = describeTrend(entry, 'Grievance');
    expect(text).toContain('concentrated at Manchester');
    expect(text).not.toContain('Leeds');
    expect(text).not.toContain('Bristol');
  });
});

// Insights Phase 3 (Emerging Patterns) — isSignificantDecrease is a
// deliberate sibling to isSignificantTrend, not a generalisation of it.
// Every test above this point exercises isSignificantTrend/describeTrend/
// computePctChange completely unmodified — this suite only adds new
// assertions, it does not alter any existing one, proving the existing
// increase-only behaviour those tests already pin is untouched.
describe('isSignificantDecrease (Insights Phase 3)', () => {
  it('is significant when the decrease meets the threshold and the previous-period sample size', () => {
    expect(isSignificantDecrease({ currentCount: 8, previousCount: 10 })).toBe(true); // -20%
  });

  it('is significant for a decrease beyond the threshold', () => {
    expect(isSignificantDecrease({ currentCount: 2, previousCount: 10 })).toBe(true); // -80%
  });

  it('is not significant for a decrease below the threshold magnitude', () => {
    expect(isSignificantDecrease({ currentCount: 9, previousCount: 10 })).toBe(false); // -10%
  });

  it('is significant exactly at the -20% boundary', () => {
    expect(isSignificantDecrease({ currentCount: 20, previousCount: 25 })).toBe(true); // exactly -20%
  });

  it('is not significant just short of the -20% boundary', () => {
    expect(isSignificantDecrease({ currentCount: 21, previousCount: 25 })).toBe(false); // -16%
  });

  it('floors on the PREVIOUS period sample size, not the current one — a genuine decline to near-zero must still be flagged', () => {
    expect(isSignificantDecrease({ currentCount: 0, previousCount: 10 })).toBe(true);
    expect(isSignificantDecrease({ currentCount: 1, previousCount: 10 })).toBe(true);
  });

  it('is not significant when the PREVIOUS count itself is below the sample floor, even with a 100% drop', () => {
    expect(isSignificantDecrease({ currentCount: 0, previousCount: 2 })).toBe(false);
  });

  it('is not significant when previousCount is exactly at MIN_SAMPLE_SIZE-1', () => {
    expect(isSignificantDecrease({ currentCount: 0, previousCount: 2 })).toBe(false);
  });

  it('is significant when previousCount is exactly at MIN_SAMPLE_SIZE', () => {
    expect(isSignificantDecrease({ currentCount: 0, previousCount: 3 })).toBe(true); // -100%, previousCount=3 clears the floor
  });

  it('never fires on an increase', () => {
    expect(isSignificantDecrease({ currentCount: 13, previousCount: 10 })).toBe(false);
  });

  it('never fires on no change', () => {
    expect(isSignificantDecrease({ currentCount: 10, previousCount: 10 })).toBe(false);
  });

  it('handles a missing entry', () => {
    expect(isSignificantDecrease(null)).toBe(false);
  });

  it('does not fire when previousCount is 0 (computePctChange returns null, not a fabricated -100%)', () => {
    // previousCount=0 is already below MIN_SAMPLE_SIZE, so this is caught
    // by the floor check first — asserted explicitly since it's also the
    // one input shape where computePctChange itself returns null.
    expect(isSignificantDecrease({ currentCount: 0, previousCount: 0 })).toBe(false);
  });

  it('is symmetric in magnitude with the approved increase threshold (20%), confirmed against the existing isSignificantTrend boundary', () => {
    // +20% already clears isSignificantTrend's own >= 20 check (proven by
    // the pre-existing 'is significant when the increase meets the
    // threshold and sample size' test above, at 13/10 = +30%); this pins
    // the exact +20% boundary itself, mirroring the -20% boundary test
    // for isSignificantDecrease directly above.
    expect(isSignificantTrend({ currentCount: 12, previousCount: 10 })).toBe(true); // exactly +20%
    expect(isSignificantDecrease({ currentCount: 8, previousCount: 10 })).toBe(true); // exactly -20%
  });
});

// Insights Phase 3 (Emerging Patterns), Signal 1 — computeOverallVolumeTrend
// is deliberately NOT a sum over org_trend_detection's by_type_trend (see
// the function's own header comment for the full reasoning): that RPC
// excludes any case with a null/blank case_type, and such cases genuinely
// exist (the "+ New meeting" quick-start flow creates one whenever it
// isn't linked to a referral). This suite exists specifically to prove
// that correctness gap is closed.
describe('computeOverallVolumeTrend (Insights Phase 3)', () => {
  const NOW = new Date('2026-06-01T00:00:00.000Z');
  const daysAgoIso = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  // A. typed cases count
  it('counts a typed case created in the current period', () => {
    const cases = [{ id: '1', caseType: 'misconduct', createdAt: daysAgoIso(10) }];
    expect(computeOverallVolumeTrend(cases, { now: NOW }).currentCount).toBe(1);
  });

  // B. blank case_type ALSO counts
  it('counts a case with a blank case_type ("+ New meeting" quick-start flow shape)', () => {
    const cases = [{ id: '1', caseType: '', createdAt: daysAgoIso(10) }];
    expect(computeOverallVolumeTrend(cases, { now: NOW }).currentCount).toBe(1);
  });

  // C. null/missing case_type ALSO counts
  it('counts a case with a null or entirely missing caseType key', () => {
    const cases = [
      { id: '1', caseType: null, createdAt: daysAgoIso(10) },
      { id: '2', createdAt: daysAgoIso(10) }, // caseType key omitted entirely
    ];
    expect(computeOverallVolumeTrend(cases, { now: NOW }).currentCount).toBe(2);
  });

  // D. blank/null case_type cases do not fabricate a case-type category —
  // this function has no per-type output at all, by construction; asserted
  // via its return shape so a future refactor can't accidentally reattach
  // a type breakdown to this specifically type-agnostic metric.
  it('returns only currentCount/previousCount/pctChange — no case-type breakdown of any kind', () => {
    const cases = [{ id: '1', caseType: '', createdAt: daysAgoIso(10) }];
    const result = computeOverallVolumeTrend(cases, { now: NOW });
    expect(Object.keys(result).sort()).toEqual(['currentCount', 'pctChange', 'previousCount']);
  });

  // E. closed cases created in the period still count — this measures
  // case CREATION, not current open/closed status.
  it('counts a case created in the period even though it has since closed', () => {
    const cases = [{ id: '1', caseType: 'misconduct', stage: 'closed', createdAt: daysAgoIso(10) }];
    expect(computeOverallVolumeTrend(cases, { now: NOW }).currentCount).toBe(1);
  });

  // F. cases outside both windows don't count
  it('does not count a case created well outside both comparison windows', () => {
    const cases = [{ id: '1', caseType: 'misconduct', createdAt: daysAgoIso(400) }];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(0);
    expect(result.previousCount).toBe(0);
  });

  // G. exact boundary semantics, matching org_trend_detection's own SQL:
  // current = [now-90d, now), previous = [now-180d, now-90d) — half-open,
  // tiling with no gap and no overlap at the shared now-90d instant.
  it('places a case exactly at the current-period start boundary into the current period (inclusive lower bound)', () => {
    const cases = [{ id: '1', createdAt: new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString() }];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(1);
    expect(result.previousCount).toBe(0);
  });

  it('does not place a case created exactly at "now" into the current period (exclusive upper bound)', () => {
    const cases = [{ id: '1', createdAt: NOW.toISOString() }];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(0);
  });

  it('places a case exactly at the previous-period start boundary into the previous period (inclusive lower bound)', () => {
    const cases = [{ id: '1', createdAt: new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString() }];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.previousCount).toBe(1);
    expect(result.currentCount).toBe(0);
  });

  it('the two windows tile with no gap and no double-count at the shared boundary instant', () => {
    const sharedBoundary = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const cases = [{ id: '1', createdAt: sharedBoundary }];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    // Belongs to current (inclusive lower bound) only — not previous, not both.
    expect(result.currentCount).toBe(1);
    expect(result.previousCount).toBe(0);
  });

  // H/I/J/K — pctChange reuses computePctChange's own established rules
  it('pctChange for a genuine increase matches computePctChange directly', () => {
    const cases = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, createdAt: daysAgoIso(10) })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: daysAgoIso(100) })),
    ];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(12);
    expect(result.previousCount).toBe(10);
    expect(result.pctChange).toBe(computePctChange(12, 10));
  });

  it('previousCount=0 with currentCount>0 returns a null pctChange, not a fabricated percentage', () => {
    const cases = [{ id: '1', createdAt: daysAgoIso(10) }];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(1);
    expect(result.previousCount).toBe(0);
    expect(result.pctChange).toBeNull();
  });

  it('currentCount=0 with previousCount>0 returns -100%', () => {
    const cases = [{ id: '1', createdAt: daysAgoIso(100) }];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(0);
    expect(result.previousCount).toBe(1);
    expect(result.pctChange).toBe(-100);
  });

  it('equal current and previous counts produce 0% change', () => {
    const cases = [
      { id: '1', createdAt: daysAgoIso(10) },
      { id: '2', createdAt: daysAgoIso(100) },
    ];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(1);
    expect(result.previousCount).toBe(1);
    expect(result.pctChange).toBe(0);
  });

  it('zero cases and zero previous both produce a 0-count, 0%-change result, not an error', () => {
    const result = computeOverallVolumeTrend([], { now: NOW });
    expect(result).toEqual({ currentCount: 0, previousCount: 0, pctChange: 0 });
  });

  it('safely ignores a case with a missing or unparseable createdAt rather than crashing', () => {
    const cases = [
      { id: '1', createdAt: null },
      { id: '2', createdAt: 'not-a-date' },
      { id: '3', createdAt: daysAgoIso(10) },
    ];
    const result = computeOverallVolumeTrend(cases, { now: NOW });
    expect(result.currentCount).toBe(1);
  });
});

describe('rankSignificantCaseTypeChanges (Insights Phase 3)', () => {
  it('excludes entries that clear neither significance gate', () => {
    const entries = [{ caseType: 'flat', currentCount: 10, previousCount: 10 }];
    expect(rankSignificantCaseTypeChanges(entries)).toEqual([]);
  });

  it('includes a significant increase and a significant decrease', () => {
    const entries = [
      { caseType: 'grievance', currentCount: 13, previousCount: 10 }, // +30%
      { caseType: 'absence', currentCount: 6, previousCount: 10 }, // -40%
    ];
    const result = rankSignificantCaseTypeChanges(entries);
    expect(result.map(r => r.caseType)).toEqual(['absence', 'grievance']); // -40% magnitude beats +30%
    expect(result[0].direction).toBe('decrease');
    expect(result[1].direction).toBe('increase');
  });

  it('ranks a brand-new pattern (null pctChange) above any bounded percentage', () => {
    const entries = [
      { caseType: 'grievance', currentCount: 100, previousCount: 10 }, // +900%, huge but bounded
      { caseType: 'harassment', currentCount: 4, previousCount: 0 }, // new pattern, null pctChange
    ];
    const result = rankSignificantCaseTypeChanges(entries);
    expect(result[0].caseType).toBe('harassment');
    expect(result[0].pctChange).toBeNull();
    expect(result[0].direction).toBe('increase');
  });

  it('breaks ties in magnitude alphabetically by case type, deterministically', () => {
    const entries = [
      { caseType: 'zeta', currentCount: 8, previousCount: 10 }, // -20%
      { caseType: 'alpha', currentCount: 8, previousCount: 10 }, // -20%, same magnitude
    ];
    const result = rankSignificantCaseTypeChanges(entries);
    expect(result.map(r => r.caseType)).toEqual(['alpha', 'zeta']);
  });

  it('respects the existing MIN_SAMPLE_SIZE floor for increases (via isSignificantTrend) and the previous-period floor for decreases (via isSignificantDecrease)', () => {
    const entries = [
      { caseType: 'tiny-increase', currentCount: 2, previousCount: 1 }, // huge % but below sample floor
      { caseType: 'tiny-decrease-base', currentCount: 0, previousCount: 2 }, // -100% but previous below floor
    ];
    expect(rankSignificantCaseTypeChanges(entries)).toEqual([]);
  });

  it('returns an empty array for no entries or a missing array', () => {
    expect(rankSignificantCaseTypeChanges([])).toEqual([]);
    expect(rankSignificantCaseTypeChanges(undefined)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const entries = [{ caseType: 'grievance', currentCount: 13, previousCount: 10 }];
    const copy = JSON.parse(JSON.stringify(entries));
    rankSignificantCaseTypeChanges(entries);
    expect(entries).toEqual(copy);
  });
});

// Insights Phase 3, drill-down stage — getTrendPeriodBounds is the shared
// window-boundary source both computeOverallVolumeTrend and the Cases
// drill-down payload must use, so a click-through always returns exactly
// the cases the displayed number counted.
describe('getTrendPeriodBounds (Insights Phase 3)', () => {
  const NOW = new Date('2026-06-01T00:00:00.000Z');

  it('produces half-open windows that tile with no gap and no overlap', () => {
    const bounds = getTrendPeriodBounds(NOW, 90);
    expect(bounds.curEnd.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(bounds.curStart.toISOString()).toBe('2026-03-03T00:00:00.000Z');
    expect(bounds.prevEnd.getTime()).toBe(bounds.curStart.getTime()); // shared boundary, no gap
    expect(bounds.prevStart.toISOString()).toBe('2025-12-03T00:00:00.000Z');
  });

  it('matches the exact boundaries computeOverallVolumeTrend uses internally', () => {
    const bounds = getTrendPeriodBounds(NOW, 90);
    const cases = [
      { id: 'at-cur-start', createdAt: bounds.curStart.toISOString() }, // inclusive → current
      { id: 'at-prev-end', createdAt: new Date(bounds.prevEnd.getTime() - 1).toISOString() }, // just before → previous
    ];
    const result = computeOverallVolumeTrend(cases, { now: NOW, periodDays: 90 });
    expect(result.currentCount).toBe(1);
    expect(result.previousCount).toBe(1);
  });

  it('defaults periodDays to 90, matching org_trend_detection\'s own default', () => {
    const explicit = getTrendPeriodBounds(NOW, 90);
    const defaulted = getTrendPeriodBounds(NOW);
    expect(defaulted).toEqual(explicit);
  });
});

// Insights Phase 4 (Trends & Themes) — describeVolumeSignal moved here
// from OrganisationalIntelligenceOverview.jsx so TrendsPanel's own
// overall-volume headline reuses the exact same wording, not a second
// copy. No behaviour change from the move itself.
describe('describeVolumeSignal (Insights Phase 3/4)', () => {
  it('states a bounded percentage change with no unsupported causal language', () => {
    const text = describeVolumeSignal({ currentCount: 42, previousCount: 33, pctChange: 27 });
    expect(text).toBe('42 cases were opened in the last 90 days, up 27% from 33 in the previous 90 days.');
    expect(text).not.toMatch(/risk|worsened|deteriorated|improved|caused/i);
  });

  it('states a decrease factually', () => {
    const text = describeVolumeSignal({ currentCount: 31, previousCount: 41, pctChange: -24 });
    expect(text).toBe('31 cases were opened in the last 90 days, down 24% from 41 in the previous 90 days.');
  });

  it('handles a zero-denominator comparison (no prior-period cases) without a fabricated percentage', () => {
    const text = describeVolumeSignal({ currentCount: 171, previousCount: 0, pctChange: null });
    expect(text).toBe('171 cases were opened in the last 90 days, compared with none in the previous 90 days.');
    expect(text).not.toMatch(/%/);
  });

  it('prefixes a subject noun when provided (case-type reuse), omits it for overall volume', () => {
    expect(describeVolumeSignal({ currentCount: 5, previousCount: 3, pctChange: 67, subject: 'grievance' }))
      .toMatch(/^5 grievance cases were opened/);
    expect(describeVolumeSignal({ currentCount: 5, previousCount: 3, pctChange: 67 }))
      .toMatch(/^5 cases were opened/);
  });

  it('uses singular wording for a single case', () => {
    expect(describeVolumeSignal({ currentCount: 1, previousCount: 0, pctChange: null })).toMatch(/^1 case was opened/);
  });
});

// Insights Phase 4 (Trends & Themes) — theme-trend equivalent of
// rankSignificantCaseTypeChanges, deliberately keeping the raw
// themeId/themeName/byLocation shape intact (see the function's own
// header for why) so existing TrendsPanel consumers (describeTrend,
// Explore, Show evidence) keep working unmodified.
describe('rankSignificantThemeTrends (Insights Phase 4)', () => {
  it('excludes entries that clear neither significance gate', () => {
    const entries = [{ themeId: 't1', themeName: 'Flat theme', currentCount: 10, previousCount: 10 }];
    expect(rankSignificantThemeTrends(entries)).toEqual([]);
  });

  it('includes a significant increase and a significant decrease, magnitude descending', () => {
    const entries = [
      { themeId: 't1', themeName: 'Rota changes', currentCount: 13, previousCount: 10 }, // +30%
      { themeId: 't2', themeName: 'Communication', currentCount: 6, previousCount: 9 }, // -33%
    ];
    const result = rankSignificantThemeTrends(entries);
    expect(result.map(r => r.themeName)).toEqual(['Communication', 'Rota changes']); // -33% beats +30%
  });

  it('exactly -20% decrease clears the gate; -19.x% is suppressed', () => {
    const atThreshold = [{ themeId: 't1', themeName: 'A', currentCount: 8, previousCount: 10 }]; // exactly -20%
    expect(rankSignificantThemeTrends(atThreshold)).toHaveLength(1);
    const belowThreshold = [{ themeId: 't1', themeName: 'A', currentCount: 9, previousCount: 10 }]; // -10%
    expect(rankSignificantThemeTrends(belowThreshold)).toEqual([]);
  });

  it('suppresses a decrease when the previous-period count is below MIN_SAMPLE_SIZE, even at 100%', () => {
    const entries = [{ themeId: 't1', themeName: 'A', currentCount: 0, previousCount: 2 }];
    expect(rankSignificantThemeTrends(entries)).toEqual([]);
  });

  it('a decline to zero current count is included once previousCount clears the floor', () => {
    const entries = [{ themeId: 't1', themeName: 'A', currentCount: 0, previousCount: 5 }];
    const result = rankSignificantThemeTrends(entries);
    expect(result).toHaveLength(1);
    expect(result[0].currentCount).toBe(0);
  });

  it('never labels a decline as "improved" — this is a data-shape/ranking function only, no wording', () => {
    const entries = [{ themeId: 't1', themeName: 'A', currentCount: 2, previousCount: 5 }];
    const result = rankSignificantThemeTrends(entries);
    expect(JSON.stringify(result)).not.toMatch(/improv/i);
  });

  it('leaves increase-only behaviour unchanged for entries that were already significant under isSignificantTrend', () => {
    const entries = [{ themeId: 't1', themeName: 'A', currentCount: 4, previousCount: 0 }]; // new pattern
    const result = rankSignificantThemeTrends(entries);
    expect(result).toHaveLength(1);
    expect(result[0].currentCount).toBe(4);
  });

  it('breaks ties in magnitude alphabetically by theme name, deterministically', () => {
    const entries = [
      { themeId: 't1', themeName: 'Zeta theme', currentCount: 8, previousCount: 10 }, // -20%
      { themeId: 't2', themeName: 'Alpha theme', currentCount: 8, previousCount: 10 }, // -20%, same magnitude
    ];
    const result = rankSignificantThemeTrends(entries);
    expect(result.map(r => r.themeName)).toEqual(['Alpha theme', 'Zeta theme']);
  });

  it('returns an empty array for no entries or a missing array', () => {
    expect(rankSignificantThemeTrends([])).toEqual([]);
    expect(rankSignificantThemeTrends(undefined)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const entries = [{ themeId: 't1', themeName: 'A', currentCount: 13, previousCount: 10 }];
    const copy = JSON.parse(JSON.stringify(entries));
    rankSignificantThemeTrends(entries);
    expect(entries).toEqual(copy);
  });
});

// Insights Phase 4 (Trends & Themes drill-down) — resolves a theme's
// currentCount back into real case ids, matching org_trend_detection's
// own by_theme_trend semantics exactly (case.created_at in period, joined
// to case_themes with no filter on the link's own timestamp).
describe('themeCaseIdsInPeriod (Insights Phase 4)', () => {
  const bounds = { curStart: new Date('2026-03-03T00:00:00.000Z'), curEnd: new Date('2026-06-01T00:00:00.000Z') };
  const cases = [
    { id: 'c1', createdAt: '2026-04-01T00:00:00.000Z' }, // in period
    { id: 'c2', createdAt: '2026-04-15T00:00:00.000Z' }, // in period, different theme
    { id: 'c3', createdAt: '2026-01-01T00:00:00.000Z' }, // before period
    { id: 'c4', createdAt: '2026-04-20T00:00:00.000Z' }, // in period, tagged twice with the same theme
    // deliberately no 'hidden' entry here — a case_themes row can
    // reference a case this caller's own RLS-scoped `cases` array
    // doesn't contain (e.g. narrowed access since the theme was tagged).
  ];
  const caseThemes = [
    { id: 'ct1', caseId: 'c1', themeId: 'theme-a' },
    { id: 'ct2', caseId: 'c2', themeId: 'theme-b' }, // unrelated theme
    { id: 'ct3', caseId: 'c3', themeId: 'theme-a' }, // right theme, wrong period
    { id: 'ct4', caseId: 'c4', themeId: 'theme-a' },
    { id: 'ct5', caseId: 'c4', themeId: 'theme-a' }, // duplicate link, same case+theme
    { id: 'ct6', caseId: 'hidden', themeId: 'theme-a' }, // case not visible to this caller
  ];

  it('resolves exactly the cases created in-period that carry the given theme', () => {
    const result = themeCaseIdsInPeriod(cases, caseThemes, 'theme-a', bounds);
    expect(new Set(result)).toEqual(new Set(['c1', 'c4']));
  });

  it('excludes an unrelated theme', () => {
    const result = themeCaseIdsInPeriod(cases, caseThemes, 'theme-b', bounds);
    expect(result).toEqual(['c2']);
  });

  it('excludes a case outside the period even though it carries the theme', () => {
    const result = themeCaseIdsInPeriod(cases, caseThemes, 'theme-a', bounds);
    expect(result).not.toContain('c3');
  });

  it('deduplicates a case with more than one case_themes row for the same theme', () => {
    const result = themeCaseIdsInPeriod(cases, caseThemes, 'theme-a', bounds);
    expect(result.filter(id => id === 'c4')).toHaveLength(1);
  });

  it('never reconstructs a case_themes link whose case is absent from the caller\'s own authorised `cases` array', () => {
    const result = themeCaseIdsInPeriod(cases, caseThemes, 'theme-a', bounds);
    expect(result).not.toContain('hidden');
  });

  it('excludes a case with an unparseable/missing createdAt rather than assuming it in-range', () => {
    const withBadDate = [...cases, { id: 'c5', createdAt: null }];
    const withBadTag = [...caseThemes, { id: 'ct7', caseId: 'c5', themeId: 'theme-a' }];
    const result = themeCaseIdsInPeriod(withBadDate, withBadTag, 'theme-a', bounds);
    expect(result).not.toContain('c5');
  });

  it('returns an empty array when nothing matches', () => {
    expect(themeCaseIdsInPeriod(cases, caseThemes, 'no-such-theme', bounds)).toEqual([]);
    expect(themeCaseIdsInPeriod([], [], 'theme-a', bounds)).toEqual([]);
    expect(themeCaseIdsInPeriod(undefined, undefined, 'theme-a', bounds)).toEqual([]);
  });
});
