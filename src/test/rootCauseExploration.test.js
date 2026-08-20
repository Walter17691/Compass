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
});

describe('buildReviewAreas', () => {
  it('frames each co-occurring theme as an area to investigate, never a proven cause', () => {
    const result = buildReviewAreas([{ themeId: 't1', themeName: 'Rota changes', count: 4 }]);
    expect(result[0].suggestion).toContain('Rota changes');
    expect(result[0].suggestion).toContain('worth reviewing as a potential contributing area');
    expect(result[0].suggestion.toLowerCase()).not.toContain('caused');
    expect(result[0].suggestion.toLowerCase()).not.toContain('because');
  });

  it('handles singular vs plural case counts', () => {
    expect(buildReviewAreas([{ themeId: 't1', themeName: 'X', count: 1 }])[0].suggestion).toContain('in 1 case)');
    expect(buildReviewAreas([{ themeId: 't1', themeName: 'X', count: 2 }])[0].suggestion).toContain('in 2 cases)');
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
    expect(text).toContain('No location breakdown available yet.');
  });

  it('handles missing data gracefully', () => {
    expect(buildRootCauseSummary('X', null)).toContain('appears in 0 cases this period');
  });
});
