import { describe, it, expect } from 'vitest';
import { formatLocationConcentration, buildReviewAreas, buildRootCauseSummary } from '../lib/rootCauseExploration';

describe('formatLocationConcentration', () => {
  it('sorts by count descending and excludes "Not specified"', () => {
    const result = formatLocationConcentration({ Manchester: 6, Leeds: 4, Birmingham: 5, 'Not specified': 10 });
    expect(result).toEqual([
      { location: 'Manchester', count: 6 },
      { location: 'Birmingham', count: 5 },
      { location: 'Leeds', count: 4 },
    ]);
  });

  it('returns an empty array for no data', () => {
    expect(formatLocationConcentration({})).toEqual([]);
    expect(formatLocationConcentration(null)).toEqual([]);
  });

  // Phase 6.5 hardening (product-principles review) — sample-size floor:
  // a location with 1-2 cases isn't a real "concentration," and for a
  // small site can be effectively identifying.
  it('excludes a location below the sample-size floor of 3', () => {
    const result = formatLocationConcentration({ Manchester: 5, Leeds: 2, Birmingham: 1 });
    expect(result).toEqual([{ location: 'Manchester', count: 5 }]);
  });
});

describe('buildReviewAreas', () => {
  it('frames each co-occurring theme as an area to investigate, never a proven cause', () => {
    const result = buildReviewAreas([{ themeId: 't1', themeName: 'Rota changes', count: 4 }]);
    expect(result[0].suggestion).toContain('Rota changes');
    expect(result[0].suggestion).toContain('worth reviewing as a potential contributing area');
    expect(result[0].suggestion.toLowerCase()).not.toContain('caused');
    expect(result[0].suggestion.toLowerCase()).not.toContain('because');
  });

  it('reports the real case count for a co-occurring theme that clears the floor', () => {
    expect(buildReviewAreas([{ themeId: 't1', themeName: 'X', count: 4 }])[0].suggestion).toContain('in 4 cases)');
  });

  // Phase 6.5 hardening (product-principles review) — a co-occurring
  // theme built on 1-2 shared cases isn't a real pattern; showing it as
  // a named "potential area for review" overstates what a couple of
  // cases actually support.
  it('excludes a co-occurring theme below the sample-size floor of 3', () => {
    expect(buildReviewAreas([{ themeId: 't1', themeName: 'X', count: 1 }])).toEqual([]);
    expect(buildReviewAreas([{ themeId: 't1', themeName: 'X', count: 2 }])).toEqual([]);
  });

  it('keeps a theme that clears the floor alongside one that does not', () => {
    const result = buildReviewAreas([
      { themeId: 't1', themeName: 'Rare', count: 2 },
      { themeId: 't2', themeName: 'Real pattern', count: 3 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].themeName).toBe('Real pattern');
  });

  it('returns an empty array for no co-occurring themes', () => {
    expect(buildReviewAreas([])).toEqual([]);
    expect(buildReviewAreas(null)).toEqual([]);
  });
});

describe('buildRootCauseSummary', () => {
  it('describes the case count and location concentration', () => {
    const text = buildRootCauseSummary('Management communication', { current_count: 19, by_location: { Manchester: 6, Birmingham: 5 } });
    expect(text).toContain('"Management communication" appears in 19 cases this period');
    expect(text).toContain('Manchester — 6');
    expect(text).toContain('Birmingham — 5');
  });

  it('notes when there is no location breakdown', () => {
    const text = buildRootCauseSummary('X', { current_count: 3, by_location: {} });
    expect(text).toContain('No single location accounts for enough cases to show a reliable concentration.');
  });

  // Phase 6.5 hardening (product-principles review) — same wording as
  // "no location breakdown at all," since below-floor locations are
  // filtered out entirely rather than shown with a weak count.
  it('notes when every location is below the sample-size floor', () => {
    const text = buildRootCauseSummary('X', { current_count: 3, by_location: { Leeds: 2, Manchester: 1 } });
    expect(text).toContain('No single location accounts for enough cases to show a reliable concentration.');
    expect(text).not.toContain('Leeds');
  });

  it('handles missing data gracefully', () => {
    expect(buildRootCauseSummary('X', null)).toContain('appears in 0 cases this period');
  });
});
