import { describe, it, expect } from 'vitest';
import { themesForCase, activeThemes, matchExistingTheme, buildThemeSuggestionPrompt, parseThemeSuggestionResponse, themeFrequency } from '../lib/themes';

describe('themesForCase', () => {
  it('filters case_themes rows to one case', () => {
    const caseThemes = [{ caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' }];
    expect(themesForCase(caseThemes, 'c1')).toEqual([{ caseId: 'c1', themeId: 't1' }]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(themesForCase([], 'c1')).toEqual([]);
  });
});

// Phase 6.5 hardening (Batch 5) — replaces orgIntelligence.js's retired
// extractThemeKeywords, which extracted raw words from case description/
// title text with no defence against a real person's name recurring
// across 2+ cases and surfacing as an org-wide "theme." Counting
// HR-curated case_themes tags instead has no such leak surface.
describe('themeFrequency', () => {
  const organisationThemes = [{ id: 't1', name: 'Rota changes' }, { id: 't2', name: 'Bullying' }];

  it('counts cases tagged with each theme, resolving the theme name', () => {
    const caseThemes = [
      { caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' },
      { caseId: 'c3', themeId: 't2' }, { caseId: 'c4', themeId: 't2' }, { caseId: 'c5', themeId: 't2' },
    ];
    const result = themeFrequency(caseThemes, organisationThemes);
    expect(result).toEqual([
      { themeId: 't2', name: 'Bullying', count: 3 },
      { themeId: 't1', name: 'Rota changes', count: 2 },
    ]);
  });

  it('excludes a theme tagged on only one case, below the default minimum of 2', () => {
    const caseThemes = [{ caseId: 'c1', themeId: 't1' }];
    expect(themeFrequency(caseThemes, organisationThemes)).toEqual([]);
  });

  it('respects a custom minCaseCount', () => {
    const caseThemes = [{ caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' }];
    expect(themeFrequency(caseThemes, organisationThemes, 3)).toEqual([]);
    expect(themeFrequency(caseThemes, organisationThemes, 2)).toHaveLength(1);
  });

  it('falls back to "Unknown theme" if the theme row is missing (e.g. deleted taxonomy entry)', () => {
    const caseThemes = [{ caseId: 'c1', themeId: 'ghost' }, { caseId: 'c2', themeId: 'ghost' }];
    const result = themeFrequency(caseThemes, organisationThemes);
    expect(result).toEqual([{ themeId: 'ghost', name: 'Unknown theme', count: 2 }]);
  });

  it('returns an empty array for no case_themes', () => {
    expect(themeFrequency([], organisationThemes)).toEqual([]);
    expect(themeFrequency(null, organisationThemes)).toEqual([]);
  });
});

describe('activeThemes', () => {
  it('excludes inactive themes', () => {
    const themes = [{ name: 'A', active: true }, { name: 'B', active: false }];
    expect(activeThemes(themes)).toEqual([{ name: 'A', active: true }]);
  });
});

describe('matchExistingTheme', () => {
  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const themes = [{ name: 'Rota changes' }];
    expect(matchExistingTheme(themes, '  ROTA CHANGES  ')).toEqual({ name: 'Rota changes' });
  });

  it('returns null when nothing matches', () => {
    expect(matchExistingTheme([{ name: 'Rota changes' }], 'Bullying')).toBeNull();
  });

  it('returns null for an empty name', () => {
    expect(matchExistingTheme([{ name: 'Rota changes' }], '  ')).toBeNull();
  });
});

describe('buildThemeSuggestionPrompt', () => {
  it('includes the case description and existing theme names', () => {
    const cs = { title: 'Grievance', description: 'Rota dispute' };
    const prompt = buildThemeSuggestionPrompt(cs, [{ name: 'Rota changes', active: true }]);
    expect(prompt).toContain('Rota dispute');
    expect(prompt).toContain('Rota changes');
    expect(prompt).toContain('JSON array');
  });

  it('notes when the organisation has no themes yet', () => {
    const prompt = buildThemeSuggestionPrompt({ description: 'x' }, []);
    expect(prompt).toContain('no themes defined');
  });

  it('excludes inactive themes from the existing-themes list', () => {
    const prompt = buildThemeSuggestionPrompt({ description: 'x' }, [{ name: 'Retired theme', active: false }]);
    expect(prompt).not.toContain('Retired theme');
  });
});

describe('parseThemeSuggestionResponse', () => {
  it('parses a clean JSON array', () => {
    expect(parseThemeSuggestionResponse('["Rota changes","Bullying"]')).toEqual(['Rota changes', 'Bullying']);
  });

  it('extracts the array even when the AI wraps it in prose', () => {
    const text = 'Here are the themes:\n["Rota changes"]\nHope this helps.';
    expect(parseThemeSuggestionResponse(text)).toEqual(['Rota changes']);
  });

  it('dedupes case-insensitively', () => {
    expect(parseThemeSuggestionResponse('["Rota changes","rota changes"]')).toEqual(['Rota changes']);
  });

  it('drops empty strings', () => {
    expect(parseThemeSuggestionResponse('["Rota changes",""," "]')).toEqual(['Rota changes']);
  });

  it('returns an empty array for malformed output', () => {
    expect(parseThemeSuggestionResponse('not json at all')).toEqual([]);
    expect(parseThemeSuggestionResponse('')).toEqual([]);
    expect(parseThemeSuggestionResponse(undefined)).toEqual([]);
  });

  it('returns an empty array when there is no bracketed array in the text at all', () => {
    expect(parseThemeSuggestionResponse('{"themes": "not an array"}')).toEqual([]);
  });
});
