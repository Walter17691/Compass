// ─────────────────────────────────────────────────────────────────────────
// B3.2-1 — THE SEVEN SECTIONS OF AN INVESTIGATION REPORT, AND THE ONE TEXT
// THE DATABASE STORES.
//
// save_investigation_report_version takes a single `p_body text`. The report
// the investigator writes has structure — matters, evidence, accounts,
// assessment, positions, uncertainties, summary — and that structure is what
// makes a report defensible rather than a wall of prose. So the editor holds
// seven fields and this module is the only place that turns them into one
// document and back.
//
// THE RULE THAT GOVERNS EVERY DECISION HERE: THE INVESTIGATOR'S WORDING IS
// NOT OURS TO EDIT. Not to tidy, not to re-wrap, not to normalise, not to
// drop. So:
//
//   * compose is lossless and parse is its exact inverse for anything compose
//     produced — asserted by a round-trip property test, not by inspection;
//
//   * parse REFUSES rather than guesses. A body it did not write — a legacy
//     report, a version saved by an older build, a document someone pasted
//     with its own headings — is returned with exact: false and handed back
//     whole, and the editor then shows one raw text area instead of seven
//     fields. Silently redistributing somebody's report into the seven boxes
//     we happen to have is how wording gets lost, and a report that has lost
//     wording is worse than one that looks less tidy;
//
//   * an empty section is omitted from the document rather than written as an
//     empty heading, because a heading with nothing under it reads as a
//     finding of "nothing to say" when the truth is that nothing was written
//     yet. Incomplete drafts are expressly allowed to be saved, and an
//     incomplete draft should look incomplete.
//
// WHAT THIS MODULE DOES NOT DO. It does not generate text, summarise, infer a
// position from evidence, or carry anything over from the case record. The
// workspace shows the investigator what the case holds; the investigator
// writes the report. Nothing here writes a word of it.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The seven sections, in the order they appear in the document.
 *
 * `heading` is the on-disk marker and is part of the stored format: changing
 * one would make every previously saved version unparseable, which is why
 * each is fixed here rather than derived from the label.
 */
export const REPORT_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'matters',
    heading: 'Matters under investigation',
    label: 'Matters under investigation',
    help: 'What was investigated, in the investigator’s own description. One matter per issue, so a position can be recorded against each.',
  }),
  Object.freeze({
    id: 'evidence',
    heading: 'Evidence considered',
    label: 'Evidence considered and source references',
    help: 'What was looked at and where it came from, so a reader can find it again. Reference the source rather than reproducing it.',
  }),
  Object.freeze({
    id: 'accounts',
    heading: 'Accounts and explanations',
    label: 'Relevant accounts, explanations and contradictions',
    help: 'What people said, including explanations offered and any accounts that conflict. Record the conflict rather than resolving it here.',
  }),
  Object.freeze({
    id: 'assessment',
    heading: 'Investigator’s assessment',
    label: 'Investigator’s assessment and reasoning',
    help: 'How the investigator weighed what they found, and why. This is the part a reader relies on to understand the position reached.',
  }),
  Object.freeze({
    id: 'positions',
    heading: 'Position on each matter',
    label: 'Position for each substantive matter',
    help: 'For each matter: a case to answer, no case to answer, or further investigation required. An investigation position is not a finding of misconduct — it decides whether there is something to answer, not whether anyone is guilty of it.',
  }),
  Object.freeze({
    id: 'uncertainties',
    heading: 'Outstanding uncertainties and next steps',
    label: 'Outstanding uncertainties and next steps',
    help: 'What remains unresolved and what would resolve it. An honest gap recorded here is worth more than a conclusion that overstates the evidence.',
  }),
  Object.freeze({
    id: 'summary',
    heading: 'Overall summary',
    label: 'Overall investigation summary',
    help: 'The short account a reader meets first. Written last, by the investigator, not assembled from the sections above.',
  }),
]);

export const REPORT_SECTION_IDS = Object.freeze(REPORT_SECTIONS.map(s => s.id));

const HEADING_TO_ID = new Map(REPORT_SECTIONS.map(s => [s.heading.toLowerCase(), s.id]));

/** An empty set of sections. Every id present, every value an empty string. */
export function emptyReportSections() {
  const out = {};
  for (const s of REPORT_SECTIONS) out[s.id] = '';
  return out;
}

/** Normalise any input into a full section map of strings. Never throws. */
export function normaliseSections(sections) {
  const src = (sections && typeof sections === 'object') ? sections : {};
  const out = {};
  for (const s of REPORT_SECTIONS) {
    const v = src[s.id];
    out[s.id] = typeof v === 'string' ? v : '';
  }
  return out;
}

/** Is there any text at all? An all-blank draft cannot be saved — the table's
 *  own CHECK refuses a blank body, and the RPC refuses it before that. */
export function sectionsAreEmpty(sections) {
  const s = normaliseSections(sections);
  return REPORT_SECTION_IDS.every(id => s[id].trim() === '');
}

/** Which sections have nothing in them. Reported, never auto-filled. */
export function emptySectionIds(sections) {
  const s = normaliseSections(sections);
  return REPORT_SECTION_IDS.filter(id => s[id].trim() === '');
}

/**
 * Seven fields to one document.
 *
 * Sections with no text are omitted entirely. Each included section is
 * `## <heading>` then a blank line then the text EXACTLY as typed — leading
 * and trailing blank lines are trimmed at the edges of the section so the
 * document does not accumulate whitespace across saves, but nothing inside is
 * touched: internal blank lines, indentation, lists and the author's own
 * Markdown all survive byte-for-byte.
 */
export function composeReportBody(sections) {
  const s = normaliseSections(sections);
  const parts = [];
  for (const section of REPORT_SECTIONS) {
    const text = s[section.id].replace(/^\n+/, '').replace(/\s+$/, '');
    if (text.trim() === '') continue;
    parts.push(`## ${section.heading}\n\n${text}`);
  }
  return parts.join('\n\n');
}

/**
 * One document back to seven fields.
 *
 * Returns `{ exact, sections, raw }`.
 *
 * `exact: true` means every heading was one of ours, they appeared in our
 * order, and there was no text before the first heading — in other words this
 * is a document compose produced, and the seven fields are a faithful
 * decomposition of it.
 *
 * `exact: false` means it is somebody else's document. `sections` is then the
 * empty set and `raw` carries the body unchanged, so the caller shows the real
 * text rather than a rearrangement of it. Out-of-order headings count as not
 * exact on purpose: re-ordering them on save would silently rewrite the
 * document someone else wrote.
 */
export function parseReportBody(body) {
  const raw = typeof body === 'string' ? body : '';
  if (raw.trim() === '') {
    return { exact: true, sections: emptyReportSections(), raw };
  }

  const lines = raw.split('\n');
  const found = [];
  let preamble = '';

  for (let i = 0; i < lines.length; i += 1) {
    const m = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (!m) {
      if (found.length === 0) preamble += (preamble === '' ? '' : '\n') + lines[i];
      continue;
    }
    const id = HEADING_TO_ID.get(m[1].toLowerCase());
    // AN UNRECOGNISED h2 IS ORDINARY TEXT, NOT A REASON TO GIVE UP.
    //
    // This started out as a bail-out, and that was wrong in the most ordinary
    // case there is: an investigator typing their own Markdown heading inside
    // a section — "## Timekeeping" under Matters — made the whole report
    // unparseable and threw the editor into raw mode for no reason the author
    // could see. Their text was never lost, but a document that silently
    // stops offering its seven fields because of a hash is exactly the
    // "unusable or confusing" outcome worth avoiding.
    //
    // Treating it as content is safe, and it is safe for a structural reason
    // rather than an optimistic one: bodyRoundTripsExactly() below gates every
    // load on the decomposition recomposing to the IDENTICAL bytes. If
    // tolerating a heading ever produced a reading that would not round-trip —
    // say the author typed one of OUR seven headings inside another section —
    // that check fails and the editor falls back to raw text exactly as it
    // does for a legacy report. Nothing is reinterpreted on a guess.
    if (!id) {
      if (found.length === 0) preamble += (preamble === '' ? '' : '\n') + lines[i];
      continue;
    }
    found.push({ id, start: i });
  }

  if (found.length === 0) return { exact: false, sections: emptyReportSections(), raw };
  if (preamble.trim() !== '') return { exact: false, sections: emptyReportSections(), raw };

  // Our order, no repeats. A duplicate heading cannot be represented by seven
  // single fields, so it is not our document either.
  const seen = new Set();
  let lastIndex = -1;
  for (const f of found) {
    if (seen.has(f.id)) return { exact: false, sections: emptyReportSections(), raw };
    seen.add(f.id);
    const idx = REPORT_SECTION_IDS.indexOf(f.id);
    if (idx <= lastIndex) return { exact: false, sections: emptyReportSections(), raw };
    lastIndex = idx;
  }

  const sections = emptyReportSections();
  for (let n = 0; n < found.length; n += 1) {
    const from = found[n].start + 1;
    const to = n + 1 < found.length ? found[n + 1].start : lines.length;
    sections[found[n].id] = lines.slice(from, to).join('\n')
      .replace(/^\n+/, '')
      .replace(/\s+$/, '');
  }
  return { exact: true, sections, raw };
}

/**
 * Does this body survive a round trip? Used by the editor to decide whether
 * loading a previous version into the seven fields would change its text.
 *
 * The question is not academic: the editor offers "start from this version",
 * and if decomposing then recomposing a version would alter one character,
 * the investigator's saved wording would be silently rewritten the next time
 * they saved. When this returns false the editor loads the body as raw text.
 */
export function bodyRoundTripsExactly(body) {
  const parsed = parseReportBody(body);
  if (!parsed.exact) return false;
  return composeReportBody(parsed.sections) === (typeof body === 'string' ? body : '');
}
