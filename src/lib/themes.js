// Organisational ER Intelligence (Phase 6, OP6, §3) — the theme
// taxonomy. Replaces orgIntelligence.js's raw keyword-frequency
// extraction as the system of record for "theme" everywhere else in
// this plan. Pure/unit-testable, same style as allegations.js's own
// allegationsForCase.

export function themesForCase(caseThemes, caseId) {
  return (caseThemes || []).filter(t => t.caseId === caseId);
}

export function activeThemes(organisationThemes) {
  return (organisationThemes || []).filter(t => t.active);
}

// Phase 6.5 hardening (Batch 5) — replaces orgIntelligence.js's
// extractThemeKeywords as the "repeat case themes" signal everywhere it
// was used (OrganisationalIntelligenceOverview's dashboard panel,
// ErReportScreen's AI-summary prompt and its own "recurring themes"
// chip list). That function did raw regex word-extraction over case
// description/title TEXT with only a generic stopword filter — no
// defence against a real person's name appearing 2+ times across
// different case descriptions (a commonly-named witness, a manager
// mentioned in several complaints) and surfacing as an org-wide
// "theme," including inside AI-generated executive-summary prose. This
// counts HR-curated case_themes tags instead — never raw case text, so
// there's no name-leak surface at all.
// Phase 6.5 hardening (product-principles review) — default raised from
// 2 to 3, matching the MIN_SAMPLE_SIZE floor used consistently
// everywhere else in this phase (trendDetection.js, outcomeConsistency.js,
// riskMap.js, orgEvents.js, appealIntelligence.js, caseQualityAnalytics.js,
// policyEffectiveness.js, rootCauseExploration.js, impactTracking.js).
// The old default of 2 was simply carried over from the retired
// extractThemeKeywords' own MIN_CASE_COUNT (DataQualityCaveat.jsx's own
// header cites it as one of two prior-art thresholds) — not a
// deliberate choice for this new, curated system, and "adequate sample
// sizes" should mean the same number everywhere in Insights, not a
// theme-specific exception.
export function themeFrequency(caseThemes, organisationThemes, minCaseCount = 3) {
  const countByThemeId = {};
  (caseThemes || []).forEach(t => { countByThemeId[t.themeId] = (countByThemeId[t.themeId] || 0) + 1; });
  return Object.entries(countByThemeId)
    .filter(([, count]) => count >= minCaseCount)
    .map(([themeId, count]) => ({
      themeId,
      name: (organisationThemes || []).find(t => t.id === themeId)?.name || "Unknown theme",
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// Case-insensitive, trimmed — an AI suggestion of "Rota Changes" should
// match an existing "rota changes" theme rather than proposing a
// near-duplicate.
export function matchExistingTheme(organisationThemes, name) {
  const normalised = (name || "").trim().toLowerCase();
  if (!normalised) return null;
  return (organisationThemes || []).find(t => t.name.trim().toLowerCase() === normalised) || null;
}

// Deliberately grounds the prompt in the org's own existing taxonomy
// (never invents a fresh list from nothing) — the AI is asked to prefer
// reusing an existing theme name and only propose a new one when
// nothing existing genuinely fits, echoing the AI-suggest/HR-confirm
// shape used elsewhere (analyseEvidenceDocument's own grounding).
export function buildThemeSuggestionPrompt(cs, organisationThemes) {
  const existing = activeThemes(organisationThemes).map(t => t.name);
  const existingText = existing.length ? existing.join(", ") : "(none yet — this organisation has no themes defined)";
  const caseText = [cs?.title, cs?.description].filter(Boolean).join(". ") || "(no case description available)";
  return "You are helping an HR team classify a case into recurring Employee Relations themes for organisational reporting. "
    + "Existing themes at this organisation: " + existingText + ". "
    + "Case summary: " + caseText + ". "
    + "Suggest 1-3 themes that apply to this case. Strongly prefer reusing an existing theme name exactly as written above; only propose a new theme name if none of the existing ones genuinely fit. "
    + "Respond with ONLY a JSON array of theme name strings, nothing else, e.g. [\"Management communication\",\"Rota changes\"].";
}

// Phase 6.5 hardening (product-principles review) — "safe entity
// filtering" ahead of human review. ThemesTab.jsx's own comment already
// establishes the human-review half (a genuinely new theme name can only
// be confirmed by HR, never auto-created) — but that only gates WHO can
// click confirm, not WHAT the AI is allowed to suggest in the first
// place. A busy HR user could still confirm a suggestion that happens to
// be a real person's actual name, exactly the failure mode
// orgIntelligence.js's own header describes for the retired
// extractThemeKeywords ("a real person's name appearing 2+ times...
// surfacing as an org-wide 'theme'"). Screens every suggested theme name
// against known people at the org before it's even shown, not just
// before it's confirmed.
export function buildKnownNameTokens(names) {
  const tokens = new Set();
  (names || []).forEach(full => {
    (full || "").split(/\s+/).forEach(w => {
      const clean = w.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
      if (clean.length > 1) tokens.add(clean);
    });
  });
  return tokens;
}

// A suggested name is unsafe if any of its own words matches a known
// person's first or last name — deliberately whole-word, not substring
// ("Robertson" as a theme wouldn't be blocked just because a "Robert"
// works there), and deliberately errs toward over-blocking: a false
// positive costs HR a moment re-phrasing or adding the theme manually; a
// false negative leaks a real name into org-wide reporting.
export function isUnsafeThemeSuggestion(name, knownNameTokens) {
  if (!knownNameTokens || !knownNameTokens.size) return false;
  const words = (name || "").split(/\s+/).map(w => w.replace(/[^a-zA-Z'-]/g, "").toLowerCase()).filter(Boolean);
  return words.some(w => knownNameTokens.has(w));
}

export function filterUnsafeThemeSuggestions(suggestions, knownNameTokens) {
  return (suggestions || []).filter(s => !isUnsafeThemeSuggestion(s, knownNameTokens));
}

export function parseThemeSuggestionResponse(text) {
  try {
    const match = (text || "").match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed
      .map(s => (typeof s === "string" ? s.trim() : ""))
      .filter(s => {
        if (!s || seen.has(s.toLowerCase())) return false;
        seen.add(s.toLowerCase());
        return true;
      });
  } catch {
    return [];
  }
}
