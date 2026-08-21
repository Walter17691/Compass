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
export function themeFrequency(caseThemes, organisationThemes, minCaseCount = 2) {
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
