import { CAPTURE_CHANNEL } from './noteCapture';

// ─────────────────────────────────────────────────────────────────────────
// SOURCE FIDELITY IS MONOTONIC: A RECORD MAY GET CLEARER, NEVER MORE CERTAIN.
//
// ┌─ THE DEFECT THIS CLOSES (Trust UAT blocker 2, 2026-10-04) ──────────────┐
// │ A manager typed four PARAPHRASED third-person notes:                     │
// │                                                                         │
// │   "Sam said they were not working on 2 October."                         │
// │                                                                         │
// │ and the generated record came back as first-person dialogue:             │
// │                                                                         │
// │   ZUTS—ST: "I was not working on 2 October."                             │
// │   UD(: "Do you have any evidence of that conversation with your manager?" │
// │                                                                         │
// │ The second line is worse than the first: nobody ever asked that question │
// │ in those words. Compass invented it.                                    │
// │                                                                         │
// │ The model was not drifting — it was obeying. The record prompt said:     │
// │   "## Meeting Dialogue … Rewrite as a clean readable conversation.       │
// │    Each line must start with the speaker's INITIALS … Fix any typos.     │
// │    One line per utterance."                                             │
// │ Given third-person notes, the ONLY way to comply is to invent speech.   │
// │                                                                         │
// │ REVIEW_EVIDENTIAL_CONTRACT was already in that prompt, and already       │
// │ separates established fact / attributed statement / disputed / unknown.  │
// │ But it governs the CERTAINTY OF ANALYSIS, and a long fidelity discipline │
// │ was attached only to HR Advisor Notes. The dialogue section — the one    │
// │ that becomes the employee-facing, signable record — had no fidelity      │
// │ constraint at all. That asymmetry is the root cause.                    │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHY NO PROVENANCE REDESIGN WAS NEEDED. The previous blocker's fix already
// stamps `channel` on every captured note, and those channels persist in
// cases.meetings[].transcript — verified on the UAT meeting itself. So Compass
// already knows whether a note is the notetaker's paraphrase or the speaker's
// own words. This module only has to read it. Nothing here invents provenance:
// a note with no channel is legacy, and legacy is treated as UNKNOWN, which
// fails to the LESS certain reading.
//
// THE PROMPT IS NOT THE GUARANTEE. A prompt is the mechanism for producing good
// prose; it is not a control. So every instruction below is paired with a
// deterministic check on the OUTPUT, and a faithful fallback when the check
// fails. The model cannot talk its way past fidelityViolations().
// ─────────────────────────────────────────────────────────────────────────

/** Does a capture on this channel carry the SPEAKER'S OWN WORDING? */
const OWN_WORDS = Object.freeze({
  [CAPTURE_CHANNEL.SPEECH_MIC]: true,
  [CAPTURE_CHANNEL.SPEECH_SCREEN]: true,
  [CAPTURE_CHANNEL.IMPORT]: true,
  // A typed note is the NOTETAKER's wording about what was said. Even when a
  // manager types something close to verbatim, Compass cannot know that, and
  // guessing in the direction of "verbatim" is precisely the failure mode.
  [CAPTURE_CHANNEL.TYPING]: false,
  [CAPTURE_CHANNEL.FLUSH]: false,
  [CAPTURE_CHANNEL.SYSTEM]: false,
});

export const SOURCE_FIDELITY = Object.freeze({
  /** Nothing in this meeting carries anyone's own wording. */
  PARAPHRASE_ONLY: 'paraphrase_only',
  /** At least one capture is speech- or transcript-derived. */
  VERBATIM_PRESENT: 'verbatim_present',
  /** No notes at all. */
  EMPTY: 'empty',
});

/**
 * True only for a channel KNOWN to carry own words. An absent, unrecognised or
 * legacy channel returns false — fail to the less certain reading.
 */
export function carriesOwnWords(entry) {
  return OWN_WORDS[entry?.channel] === true;
}

export function sourceFidelity(transcript) {
  const list = (Array.isArray(transcript) ? transcript : []).filter(e => e && String(e.text || '').trim());
  if (!list.length) return SOURCE_FIDELITY.EMPTY;
  return list.some(carriesOwnWords)
    ? SOURCE_FIDELITY.VERBATIM_PRESENT
    : SOURCE_FIDELITY.PARAPHRASE_ONLY;
}

/** May the record be written as speaker-attributed dialogue at all? */
export function dialoguePermitted(fidelity) {
  return fidelity === SOURCE_FIDELITY.VERBATIM_PRESENT;
}

/**
 * The section heading.
 *
 * "Meeting Dialogue" is itself an evidential claim — it tells the reader they
 * are looking at what was said. A paraphrase-sourced record must not carry it.
 * Nothing parses this heading by name (the only name-keyed matcher in the
 * codebase is HR Advis(o|e)r, for the internal/employee-facing split), so this
 * is safe to vary.
 */
export function discussionHeading(fidelity) {
  return dialoguePermitted(fidelity) ? 'Meeting Dialogue' : 'Record of Discussion';
}

// ── Section handling ───────────────────────────────────────────────────────
const headingLevel = line => ((line.match(/^[ \t]*(#{1,6})[ \t]+\S/) || [])[1] || '').length;
const isDetailsHeading = line => /^[ \t]*#{1,6}[ \t]*Meeting Details\b/i.test(line);

/**
 * The part of an employee-facing record that narrates the discussion — i.e.
 * everything except the Meeting Details block.
 *
 * Derived by EXCLUSION rather than by looking for a known discussion heading,
 * so a model that renames or omits the heading cannot slip past the guard.
 */
export function discussionText(record) {
  const text = typeof record === 'string' ? record : '';
  if (!text) return '';
  const lines = text.split('\n');
  const kept = [];
  let skipping = 0;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (isDetailsHeading(line)) { skipping = headingLevel(line) || 1; continue; }
    if (skipping) {
      const h = headingLevel(line);
      if (h > 0 && h <= skipping) skipping = 0;
      else continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

// ── Speaker labels ─────────────────────────────────────────────────────────
//
// The initials derivation the record prompt uses, reproduced here because the
// guard has to recognise the labels the model was ASKED to produce. It is also
// why the UAT record was headed `UD(` and `ZUTS—ST`: the derivation takes the
// first character of every whitespace-separated token, including punctuation
// and em-dashes, so "UAT D4.3 (test)" becomes "UD(" and
// "ZZ UAT Trust Slice — Sam Testcase" becomes "ZUTS—ST".
// ┌─ THE DEFECT THIS REPLACES ──────────────────────────────────────────────┐
// │ The prompt derived initials as                                           │
// │   name.split(" ").map(w => w[0]).join("")                                │
// │ which takes the first CHARACTER of every whitespace token, punctuation    │
// │ included. So the UAT record was headed:                                  │
// │   "UAT D4.3 (test)"                 -> "UD("                             │
// │   "ZZ UAT Trust Slice — Sam Testcase" -> "ZUTS—ST"                       │
// │ An em-dash and an opening bracket presented as a person's initials.      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Punctuation-only tokens are dropped, dashes are separators rather than
// initials, and a label that cannot be made useful falls back to the ROLE
// rather than to something meaningless. A single-token name is returned whole,
// because one letter identifies nobody.
export function participantInitials(name, { fallback = 'Participant' } = {}) {
  const tokens = String(name || '')
    // En/em dash and hyphen are separators, never initials.
    .split(/[\s‐-―-]+/)
    .map(t => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(t => t && /^\p{L}/u.test(t));
  if (!tokens.length) return fallback;
  if (tokens.length === 1) return tokens[0].length <= 12 ? tokens[0] : fallback;
  const letters = tokens.map(t => t[0].toUpperCase()).join('');
  return letters.slice(0, 4);
}

/** Every string that could legitimately prefix a line as "this person spoke". */
export function speakerLabels(names) {
  const out = new Set();
  for (const n of (Array.isArray(names) ? names : [])) {
    const name = String(n || '').trim();
    if (!name) continue;
    out.add(name.toLowerCase());
    // BOTH derivations, deliberately. The clean one is what the prompt now asks
    // for; the naive first-character-of-every-token one is what produced "UD("
    // and "ZUTS—ST", and the guard must still recognise those as speaker labels
    // — in a restored draft, or if the model mimics the old shape.
    const clean = participantInitials(name, { fallback: '' });
    if (clean) out.add(clean.toLowerCase());
    const naive = name.split(/\s+/).filter(Boolean).map(w => w[0]).join('');
    if (naive) out.add(naive.toLowerCase());
    const first = name.split(/\s+/)[0];
    if (first) out.add(first.toLowerCase());
  }
  return out;
}

/**
 * Lines written as "<speaker>: <what they said>".
 *
 * Identified by matching the label against the ACTUAL PARTICIPANTS, not by
 * shape. That distinction matters: a structured record legitimately contains
 * `Employee response: Sam stated that...`, and a shape-based check would flag
 * it. Only a label that names a person in the room is a claim about speech.
 */
export function attributedDialogueLines(text, names) {
  const labels = speakerLabels(names);
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const m = raw.match(/^[ \t>*-]*([^:\n]{1,60}?)[ \t]*:[ \t]*(\S.*)$/);
    if (!m) continue;
    const label = m[1].replace(/^[*_"'[\]]+|[*_"'[\]]+$/g, '').trim().toLowerCase();
    if (labels.has(label)) out.push(raw.trim());
  }
  return out;
}

// ── Quotation support ──────────────────────────────────────────────────────
const normalise = s => String(s == null ? '' : s).replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

// Straight and curly double quotes.
const QUOTED = /[“"]([^”"]{1,400})[”"]/g;

/**
 * Quoted spans long enough to be a claim about someone's exact words.
 *
 * The 15-character floor keeps a quoted policy name or a single quoted term out
 * of scope — those are references, not reported speech — while any quoted
 * sentence is in scope. Documented because it is the one threshold here.
 */
export const QUOTATION_FLOOR = 15;

export function quotedSpans(text) {
  const out = [];
  for (const m of String(text || '').matchAll(QUOTED)) {
    const span = m[1].trim();
    if (span.length >= QUOTATION_FLOOR) out.push(span);
  }
  return out;
}

const FIRST_PERSON = /\b(I|I'm|I'll|I've|I'd|me|my|mine|myself|we|we're|us|our|ours)\b/i;

// ─────────────────────────────────────────────────────────────────────────
// THE THREE SOURCE CLASSES.
//
//   A. AUTHORITATIVE STRUCTURED DATA — meeting date and times, participant
//      identities, meeting type. Compass knows these independently of anything
//      the model wrote, so a record may state them.
//   B. CAPTURED MEETING MATERIAL — the transcript. What was actually taken down.
//   C. GENERATED INTERPRETATION — the model's own prose.
//
// A generated employee-facing factual claim must be grounded in A or B.
// C IS NEVER A SOURCE. That is the whole boundary, and it is why `supports()`
// below is built only from A and B and never from the record under test.
// ─────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Every equivalent rendering of an authoritative date.
 *
 * ┌─ A FALSE POSITIVE THIS PREVENTS ────────────────────────────────────────┐
 * │ caseInfo.date is ISO — "2026-10-04" — and the model writes it out as     │
 * │ "4 October 2026". Comparing the two as strings makes Compass's OWN       │
 * │ meeting date look like an invented fact, so the guard would have         │
 * │ rebuilt Meeting Details on essentially every real meeting. Caught by     │
 * │ probing the helper before deploying, not by a user.                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Built from components rather than Date formatting, so no timezone can shift
 * the day. An unparseable value is passed through unchanged.
 */
export function dateRenderings(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return [];
  let y, m, d;
  let mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else {
    // en-GB day-first, which is what this product uses everywhere.
    mt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  }
  if (!y || !m || !d || m < 1 || m > 12) return [s];
  const name = MONTH_NAMES[m - 1];
  const pad = n => String(n).padStart(2, '0');
  return [s, `${y}-${pad(m)}-${pad(d)}`, `${d} ${name} ${y}`,
    `${name} ${d}, ${y}`, `${pad(d)}/${pad(m)}/${y}`, `${d}/${m}/${y}`];
}

/** Flatten authoritative structured context into supporting text. */
export function authoritativeText(authoritative) {
  const a = authoritative || {};
  const parts = [
    a.meetingType, ...dateRenderings(a.date), a.startTime, a.endTime,
    a.chair, a.employee, a.notetaker, a.representative, a.caseType,
    ...(Array.isArray(a.participants) ? a.participants : []),
    ...(Array.isArray(a.adjournments) ? a.adjournments : []),
    ...(Array.isArray(a.extra) ? a.extra : []),
  ];
  return parts.filter(Boolean).map(String).join(' | ');
}

const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';

/**
 * Date-aware normalisation, so a FORMAT change is never mistaken for an
 * invented fact: "2nd October" and "2 Oct" both reduce to "2 oct".
 *
 * Without this the guard would reject legitimate reformatting, which the brief
 * rightly forbids — the objective is source fidelity, not identical wording.
 */
function normaliseFacts(s) {
  return normalise(s)
    .replace(/(\d{1,2})(st|nd|rd|th)\b/g, '$1')
    .replace(new RegExp(`\\b(${MONTHS})\\b`, 'g'), m => m.slice(0, 3))
    // Canonical day-month order, so "October 2" and "2 October" are the same
    // date. The day pattern is \d{1,2} precisely so a YEAR is never swapped into
    // the day position ("oct 2026" must not become "2026 oct").
    .replace(/\b([a-z]{3})\s+(\d{1,2})\b/g, (whole, mon, day) =>
      (new RegExp(`^(?:${MONTHS})$`).test(mon) ? `${day} ${mon}` : whole));
}

// Specificity classes that carry evidential weight on their own. Deliberately
// NOT "every number": a count the model derives from the notes is summarising,
// whereas a date, a year, a clock time or a sum of money is a factual claim.
const SPECIFIC_PATTERNS = [
  // A full or partial date, in either order.
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b\\.?(?:\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, 'gi'),
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  // A bare year.
  /\b(?:19|20)\d{2}\b/g,
  // A clock time.
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
  // Money and percentages.
  /[£$€]\s?\d[\d,.]*/g,
  /\b\d[\d,.]*\s?%/g,
];

/**
 * Factual specifics asserted by `text` that neither A nor B supports.
 *
 * This is the check that catches the UAT gap: the notes said "2 October" and
 * the generated Purpose said "2 October 2026". The year was plausible — the
 * meeting really is in 2026 — but plausibility is not evidence, and the record
 * must not pin an event to a year nobody recorded.
 *
 * Note that it is the WHOLE date expression that must be supported, not its
 * tokens. "2026" on its own IS supported here (the meeting date is authoritative
 * and contains it); "2 October 2026" is not, and that is exactly the distinction
 * a token-level check would have missed.
 */
export function unsupportedSpecifics(text, supportCorpus) {
  const haystack = normaliseFacts(supportCorpus);
  const found = [];
  const seen = new Set();
  for (const re of SPECIFIC_PATTERNS) {
    for (const m of String(text || '').matchAll(re)) {
      const span = m[0].trim().replace(/\.$/, '');
      const key = normaliseFacts(span);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!haystack.includes(key)) found.push(span);
    }
  }
  return found;
}

export const FIDELITY_VIOLATION = Object.freeze({
  INVENTED_DIALOGUE: 'invented_dialogue',
  FIRST_PERSON_SPEECH: 'first_person_speech',
  UNSUPPORTED_QUOTATION: 'unsupported_quotation',
  UNSUPPORTED_SPECIFICITY: 'unsupported_specificity',
  UNSUPPORTED_ATTRIBUTION: 'unsupported_attribution',
});

/** Which part of the employee-facing record a finding is in. */
export const RECORD_REGION = Object.freeze({
  DETAILS: 'details',
  DISCUSSION: 'discussion',
});

// Labels that organise a record rather than name a speaker. A record may use
// these freely; only a label naming a PERSON is an attribution.
//
// Kept deliberately generous. A false positive here would replace a manager's
// legitimately structured record, which is worse than the narrower coverage.
const STRUCTURAL_LABELS = new Set([
  'type', 'date', 'start time', 'end time', 'adjournments', 'chair', 'notetaker',
  'employee', 'representative', 'representative/companion', 'companion',
  'other participants', 'participants', 'purpose', 'note', 'notes', 'manager',
  'employee response', 'employer response', 'management position',
  'employee position', 'response', 'evidence', 'follow-up', 'follow up',
  'action', 'actions', 'next steps', 'outcome', 'background', 'summary',
  'key points', 'procedural checks', 'discussion', 'present', 'apologies',
  'attendees', 'location', 'meeting', 'subject', 'allegation', 'allegations',
]);

/** The Meeting Details block only. */
export function detailsText(record) {
  const text = typeof record === 'string' ? record : '';
  if (!text) return '';
  const out = [];
  let inside = false;
  let level = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (isDetailsHeading(line)) { inside = true; level = headingLevel(line) || 1; continue; }
    if (!inside) continue;
    const h = headingLevel(line);
    if (h > 0 && h <= level) { inside = false; continue; }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Dialogue-format lines whose label names nobody in the meeting.
 *
 * Only meaningful where dialogue is permitted at all — for a paraphrase source
 * every dialogue line is already refused. Restricted to labels that look like a
 * person (capitalised words or initials, no lowercase-only token) and are not
 * structural, so "Evidence / follow-up:" is not mistaken for a witness.
 */
export function unsupportedAttributions(text, names) {
  const known = speakerLabels(names);
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const m = raw.match(/^[ \t>*-]*([^:\n]{1,60}?)[ \t]*:[ \t]*(\S.*)$/);
    if (!m) continue;
    const label = m[1].replace(/^[*_"'[\]]+|[*_"'[\]]+$/g, '').trim();
    const key = label.toLowerCase();
    if (!label || known.has(key) || STRUCTURAL_LABELS.has(key)) continue;
    const tokens = label.split(/\s+/);
    if (tokens.length > 5) continue;
    // Person-like: every token starts with a capital, and none is a bare
    // lowercase word. Initials such as "JS" qualify.
    if (!tokens.every(t => /^[A-Z\p{Lu}]/u.test(t))) continue;
    out.push(label);
  }
  return out;
}

/**
 * Does this generated record claim more fidelity than its source supports?
 *
 * Returns [] when clean. Three independent checks, so defeating one is not
 * enough — the UAT output trips all three.
 */
export function fidelityViolations(record, transcript, { participantNames = [], authoritative = null } = {}) {
  const fidelity = sourceFidelity(transcript);
  const discussion = discussionText(record);
  const details = detailsText(record);
  if (!discussion.trim() && !details.trim()) return [];
  const findings = [];

  // A and B. C is absent by construction — the record under test is never a
  // source for itself.
  const captured = (Array.isArray(transcript) ? transcript : []).map(e => e && e.text).filter(Boolean).join(' ');
  const authority = authoritativeText(authoritative);
  const sourceText = normalise(captured);
  const supportCorpus = `${captured} | ${authority}`;
  const supports = span => sourceText.includes(normalise(span)) || normalise(authority).includes(normalise(span));

  const add = (code, region, detail) => findings.push({ code, region, detail });

  // ── Checks that run on the DISCUSSION only ───────────────────────────────
  if (discussion.trim()) {
    // 1. Paraphrase rendered as speech. The format IS the claim.
    if (!dialoguePermitted(fidelity)) {
      const lines = attributedDialogueLines(discussion, participantNames);
      if (lines.length) {
        add(FIDELITY_VIOLATION.INVENTED_DIALOGUE, RECORD_REGION.DISCUSSION,
          `${lines.length} line(s) are written as attributed speech, but no capture in this meeting carries the speaker's own wording.`);
      }
      // 2. First-person wording THE SOURCE DOES NOT SUPPORT.
      //
      // Supported quotations are removed before this check, and that exclusion
      // is load-bearing rather than a convenience: a notetaker may legitimately
      // type a verbatim fragment — `Sam said "I was not working that day"` — and
      // reproducing it is faithful, not invented. Caught by my own test, which
      // had asserted the blunter rule.
      const outsideSupportedQuotes = String(discussion).replace(QUOTED, (whole, inner) => (supports(inner) ? ' ' : whole));
      if (FIRST_PERSON.test(outsideSupportedQuotes)) {
        add(FIDELITY_VIOLATION.FIRST_PERSON_SPEECH, RECORD_REGION.DISCUSSION,
          'The account uses first-person wording the captured notes do not support, which presents the notetaker\'s summary as a participant\'s own words.');
      }
    } else {
      // 1b. Dialogue is permitted, so the risk shifts to WHO is credited.
      const invented = unsupportedAttributions(discussion, participantNames);
      if (invented.length) {
        add(FIDELITY_VIOLATION.UNSUPPORTED_ATTRIBUTION, RECORD_REGION.DISCUSSION,
          `Speech is attributed to ${invented.length} name(s) not recorded as present: ${invented.join(', ')}.`);
      }
    }
  }

  // ── Checks that run on the WHOLE employee-facing record ──────────────────
  //
  // THE GAP THIS CLOSES. The guard previously scanned only the discussion, so
  // Meeting Details > Purpose turned "2 October" into "2 October 2026"
  // unchallenged. A record is one document; a fabricated date in its header is
  // no less a fabrication than one in its body.
  for (const [region, text] of [[RECORD_REGION.DETAILS, details], [RECORD_REGION.DISCUSSION, discussion]]) {
    if (!text.trim()) continue;

    // 3. A quotation that is not in the source. Applies at EVERY fidelity: a
    //    quotation mark is a claim about exact words whatever the channel.
    const quotes = quotedSpans(text).filter(q => !supports(q));
    if (quotes.length) {
      add(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION, region,
        `${quotes.length} quoted passage(s) do not appear in what was captured.`);
    }

    // 4. Factual specificity neither the notes nor Compass's own structured
    //    data supports — an invented year, date, time, sum or percentage.
    const specifics = unsupportedSpecifics(text, supportCorpus);
    if (specifics.length) {
      add(FIDELITY_VIOLATION.UNSUPPORTED_SPECIFICITY, region,
        `${specifics.length} factual detail(s) are not supported by the notes or by the meeting's own recorded data: ${specifics.join(', ')}.`);
    }

    // 5. First person in the Details header is always wrong: it is a field list.
    if (region === RECORD_REGION.DETAILS) {
      const outside = String(text).replace(QUOTED, (whole, inner) => (supports(inner) ? ' ' : whole));
      if (FIRST_PERSON.test(outside)) {
        add(FIDELITY_VIOLATION.FIRST_PERSON_SPEECH, region,
          'The meeting details are written in the first person.');
      }
    }
  }
  return findings;
}

/** Regions with at least one finding. */
export function violatedRegions(violations) {
  return new Set((Array.isArray(violations) ? violations : []).map(v => v && v.region).filter(Boolean));
}

// ── The instruction given to the generator ─────────────────────────────────

/**
 * The discussion-section instruction, matched to what the source can support.
 *
 * This is the half that produces GOOD output. fidelityViolations is the half
 * that makes it a guarantee.
 */
export function discussionInstruction(fidelity, { chair = 'the chair', employee = 'the employee' } = {}) {
  const heading = discussionHeading(fidelity);
  if (dialoguePermitted(fidelity)) {
    return `## ${heading}
Some of this meeting was captured as spoken words and some as the notetaker's written notes. Preserve that difference — do NOT render everything as dialogue.
For content captured as spoken words you may keep a dialogue form, using only wording the capture actually supports. Correct obvious transcription slips; never smooth an answer into something more definite than it was.
For content captured as the notetaker's notes, write a third-person attributable account instead ("${chair} asked…", "${employee} stated that…"). Do not convert a note into speech and do not put it in quotation marks.
Never invent a question, an answer, a quotation or a detail that is not in the source.`;
  }
  return `## ${heading}
THE SOURCE IS THE NOTETAKER'S OWN WRITTEN NOTES — their summary of the discussion, NOT a record of anyone's exact words. Write a clear, well-organised, third-person account of what was discussed. Group related points and use short labelled paragraphs where that helps a reader.
You MUST NOT:
- write this section as dialogue, or prefix any line with a participant's name or initials;
- put quotation marks around anything a participant is said to have said;
- write in the first person as though quoting someone ("I was not working") — use reported speech ("${employee} stated that they were not working");
- invent the wording of a question or an answer;
- add any fact, date, time, figure, motive or sequence of events that is not in the notes;
- make an admission, a denial or a disagreement sound more definite than the notes make it.
Attribute properly in the third person and leave every uncertainty exactly as uncertain as the notes leave it. Where the notes do not say who spoke, do not guess.`;
}

/**
 * A deterministic, provably faithful discussion section.
 *
 * Used only when the guard rejects the generated one. It cannot be wrong,
 * because it copies the captured text and adds nothing. It is deliberately
 * plain rather than clever — a safety net, not the normal output — and it names
 * no capture ids or channels, because the employee record must not carry
 * engineering metadata.
 */
export function faithfulDiscussion(transcript, { fidelity = null } = {}) {
  const list = (Array.isArray(transcript) ? transcript : []).filter(e => e && String(e.text || '').trim());
  const kind = fidelity || sourceFidelity(list);
  if (!list.length) return '';
  const preamble = dialoguePermitted(kind)
    ? 'The following was captured during the meeting. Where it was taken down as notes rather than spoken words, it is the notetaker\'s summary.'
    : 'The following notes were taken during the meeting. They are the notetaker\'s summary of the discussion and not a record of anyone\'s exact words.';
  const lines = list.map(e => `- ${String(e.text).trim()}`);
  return `## ${discussionHeading(kind)}\n\n${preamble}\n\n${lines.join('\n')}`;
}

/**
 * Enforce source fidelity on a generated record.
 *
 * Returns the record to use, plus what was wrong with the generated one. On a
 * violation the DISCUSSION section is replaced and Meeting Details is kept —
 * Details is a field list drawn from structured state, not from the notes.
 *
 * Never throws, and never returns empty when there were notes: a guard that
 * destroyed the manager's work on a false positive would be worse than the
 * defect it prevents.
 */
/**
 * Meeting Details rebuilt from AUTHORITATIVE STRUCTURED DATA alone.
 *
 * Every field here is something Compass knows independently of the model, which
 * is why this is provably faithful — including the Purpose line, which states
 * only the meeting type and who it was with. The generated Purpose is exactly
 * what invented "2 October 2026", so when Details is rejected the generated
 * prose is the thing that goes.
 */
export function faithfulDetails(authoritative) {
  const a = authoritative || {};
  const field = (label, value) => `${label}: ${value || 'Not specified'}`;
  const rows = [
    field('Type', a.meetingType),
    field('Date', a.date),
    field('Start time', a.startTime),
    field('End time', a.endTime),
    ...(Array.isArray(a.adjournments) && a.adjournments.length
      ? [field('Adjournments', a.adjournments.join('; '))] : []),
    field('Chair', a.chair),
    field('Notetaker', a.notetaker),
    field('Employee', a.employee),
    `Representative/companion: ${a.representative || 'N/A'}`,
    `Other participants: ${(Array.isArray(a.participants) && a.participants.length) ? a.participants.join(', ') : 'None'}`,
    `Purpose: ${a.meetingType || 'Meeting'}${a.employee ? ` with ${a.employee}` : ''}.`,
  ];
  return `## Meeting Details\n\n${rows.join('\n')}`;
}

/**
 * Enforce source fidelity on a generated record, REGION BY REGION.
 *
 * Only the part that failed is replaced, so a fabricated Purpose does not cost
 * the manager a well-written discussion section and vice versa.
 *
 * Never throws, and never returns empty when there were notes: a guard that
 * destroyed the manager's work on a false positive would be worse than the
 * defect it prevents. Details is only replaced when authoritative data is
 * actually available to rebuild it from — inventing a blank header would be its
 * own kind of lie.
 */
export function applyFidelityGuard(record, transcript, { participantNames = [], authoritative = null } = {}) {
  const violations = fidelityViolations(record, transcript, { participantNames, authoritative });
  if (!violations.length) return { record, violations: [], replaced: false, replacedRegions: [] };

  const regions = violatedRegions(violations);
  const fidelity = sourceFidelity(transcript);
  const text = typeof record === 'string' ? record : '';

  // Split the record into its Details block and everything else, once.
  const detailsLines = [];
  const restLines = [];
  let inDetails = false;
  let level = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (isDetailsHeading(line)) { inDetails = true; level = headingLevel(line) || 1; detailsLines.push(line); continue; }
    if (inDetails) {
      const h = headingLevel(line);
      if (h > 0 && h <= level) inDetails = false;
      else { detailsLines.push(line); continue; }
    }
    restLines.push(line);
  }

  const replacedRegions = [];

  let head = detailsLines.join('\n').replace(/[\s\r\n]+$/, '');
  if (regions.has(RECORD_REGION.DETAILS)) {
    const rebuilt = authoritativeText(authoritative) ? faithfulDetails(authoritative) : '';
    if (rebuilt) { head = rebuilt; replacedRegions.push(RECORD_REGION.DETAILS); }
  }

  let body = restLines.join('\n').replace(/^[\s\r\n]+|[\s\r\n]+$/g, '');
  if (regions.has(RECORD_REGION.DISCUSSION)) {
    const faithful = faithfulDiscussion(transcript, { fidelity });
    if (faithful) { body = faithful; replacedRegions.push(RECORD_REGION.DISCUSSION); }
  }

  if (!replacedRegions.length) return { record, violations, replaced: false, replacedRegions: [] };
  return {
    record: [head, body].filter(s => s && s.trim()).join('\n\n'),
    violations,
    replaced: true,
    replacedRegions,
  };
}

/** What the manager is told when the guard replaced part of the record. */
export function describeFidelityFallback(replacedRegions = []) {
  const r = new Set(Array.isArray(replacedRegions) ? replacedRegions : []);
  const both = r.has(RECORD_REGION.DETAILS) && r.has(RECORD_REGION.DISCUSSION);
  if (both) {
    return 'Compass set out your notes and the meeting details as recorded. The drafted version added wording your notes do not support — please edit the record as needed.';
  }
  if (r.has(RECORD_REGION.DETAILS)) {
    return 'Compass set out the meeting details from the meeting\'s own recorded data. The drafted version added a detail your notes do not support — please edit the record as needed.';
  }
  return 'Compass set out your notes as recorded. The drafted version restated them as dialogue, which your notes do not support — please edit the record as needed.';
}
