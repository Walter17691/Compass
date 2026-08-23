import { describe, it, expect } from 'vitest';
import { themesForCase, activeThemes, matchExistingTheme, buildThemeSuggestionPrompt, parseThemeSuggestionResponse, themeFrequency, buildKnownNameTokens, isUnsafeThemeSuggestion, filterUnsafeThemeSuggestions } from '../lib/themes';

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
      { caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' }, { caseId: 'c6', themeId: 't1' },
      { caseId: 'c3', themeId: 't2' }, { caseId: 'c4', themeId: 't2' }, { caseId: 'c5', themeId: 't2' }, { caseId: 'c7', themeId: 't2' },
    ];
    const result = themeFrequency(caseThemes, organisationThemes);
    expect(result).toEqual([
      { themeId: 't2', name: 'Bullying', count: 4 },
      { themeId: 't1', name: 'Rota changes', count: 3 },
    ]);
  });

  // Phase 6.5 hardening (product-principles review) — raised from 2 to 3
  // to match the MIN_SAMPLE_SIZE floor used consistently everywhere else
  // in this phase; see themes.js's own comment on themeFrequency.
  it('excludes a theme tagged on only two cases, below the default minimum of 3', () => {
    const caseThemes = [{ caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' }];
    expect(themeFrequency(caseThemes, organisationThemes)).toEqual([]);
  });

  it('respects a custom minCaseCount', () => {
    const caseThemes = [{ caseId: 'c1', themeId: 't1' }, { caseId: 'c2', themeId: 't1' }];
    expect(themeFrequency(caseThemes, organisationThemes, 3)).toEqual([]);
    expect(themeFrequency(caseThemes, organisationThemes, 2)).toHaveLength(1);
  });

  it('falls back to "Unknown theme" if the theme row is missing (e.g. deleted taxonomy entry)', () => {
    const caseThemes = [{ caseId: 'c1', themeId: 'ghost' }, { caseId: 'c2', themeId: 'ghost' }, { caseId: 'c3', themeId: 'ghost' }];
    const result = themeFrequency(caseThemes, organisationThemes);
    expect(result).toEqual([{ themeId: 'ghost', name: 'Unknown theme', count: 3 }]);
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

// Phase 6.5 hardening (product-principles review) — "personal names must
// not accidentally become organisational themes." ThemesTab.jsx's own
// human-review gate (only HR can confirm a genuinely new theme name)
// doesn't stop HR from confirming an AI suggestion that happens to BE a
// real person's name — this is the safe-entity-filtering layer that
// screens it out before it's ever shown.
describe('buildKnownNameTokens / isUnsafeThemeSuggestion / filterUnsafeThemeSuggestions', () => {
  it('tokenises full names into individual lowercase word tokens', () => {
    const tokens = buildKnownNameTokens(['Sarah Jones', 'Ryan O\'Brien-Smith']);
    expect(tokens.has('sarah')).toBe(true);
    expect(tokens.has('jones')).toBe(true);
    expect(tokens.has('ryan')).toBe(true);
    expect(tokens.has('o\'brien-smith')).toBe(true);
  });

  // The exact scenario orgIntelligence.js's own retired extractThemeKeywords
  // used to fail on: a repeatedly-mentioned EMPLOYEE surname surfacing as
  // a theme suggestion.
  it('blocks a suggestion matching a repeated employee surname', () => {
    const tokens = buildKnownNameTokens(['Alex Fletcher', 'Priya Fletcher']);
    expect(isUnsafeThemeSuggestion('Fletcher', tokens)).toBe(true);
    expect(isUnsafeThemeSuggestion('Fletcher escalation pattern', tokens)).toBe(true);
  });

  // Same failure mode, but the recurring name is a MANAGER's, not an
  // employee's — equally unsafe to surface as an org-wide theme.
  it('blocks a suggestion matching a repeated manager surname', () => {
    const tokens = buildKnownNameTokens(['Jo Smith']);
    expect(isUnsafeThemeSuggestion('Smith management style', tokens)).toBe(true);
  });

  it('allows an ordinary theme name that shares no word with any known name', () => {
    const tokens = buildKnownNameTokens(['Alex Fletcher', 'Jo Smith']);
    expect(isUnsafeThemeSuggestion('Rota changes', tokens)).toBe(false);
    expect(isUnsafeThemeSuggestion('Bullying and harassment', tokens)).toBe(false);
  });

  it('matches whole words only, not substrings of an unrelated word', () => {
    const tokens = buildKnownNameTokens(['Rob Baker']);
    // "Robertson" contains "rob" but is not the token "rob".
    expect(isUnsafeThemeSuggestion('Robertson process review', tokens)).toBe(false);
  });

  it('is case-insensitive', () => {
    const tokens = buildKnownNameTokens(['Jo Smith']);
    expect(isUnsafeThemeSuggestion('SMITH', tokens)).toBe(true);
  });

  it('treats an empty known-names set as blocking nothing', () => {
    expect(isUnsafeThemeSuggestion('Anything at all', buildKnownNameTokens([]))).toBe(false);
    expect(isUnsafeThemeSuggestion('Anything at all', buildKnownNameTokens(null))).toBe(false);
  });

  it('filterUnsafeThemeSuggestions keeps only the safe suggestions from a mixed list', () => {
    const tokens = buildKnownNameTokens(['Alex Fletcher', 'Jo Smith']);
    const suggestions = ['Rota changes', 'Fletcher', 'Bullying', 'Smith communication style'];
    expect(filterUnsafeThemeSuggestions(suggestions, tokens)).toEqual(['Rota changes', 'Bullying']);
  });
});
