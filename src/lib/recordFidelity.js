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
export function initialsOf(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).map(w => w[0]).join('');
}

/** Every string that could legitimately prefix a line as "this person spoke". */
export function speakerLabels(names) {
  const out = new Set();
  for (const n of (Array.isArray(names) ? names : [])) {
    const name = String(n || '').trim();
    if (!name) continue;
    out.add(name.toLowerCase());
    const i = initialsOf(name);
    if (i) { out.add(i.toLowerCase()); out.add(i.toUpperCase().toLowerCase()); }
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

export const FIDELITY_VIOLATION = Object.freeze({
  INVENTED_DIALOGUE: 'invented_dialogue',
  FIRST_PERSON_SPEECH: 'first_person_speech',
  UNSUPPORTED_QUOTATION: 'unsupported_quotation',
});

/**
 * Does this generated record claim more fidelity than its source supports?
 *
 * Returns [] when clean. Three independent checks, so defeating one is not
 * enough — the UAT output trips all three.
 */
export function fidelityViolations(record, transcript, { participantNames = [] } = {}) {
  const fidelity = sourceFidelity(transcript);
  const discussion = discussionText(record);
  if (!discussion.trim()) return [];
  const findings = [];

  const sourceText = normalise((Array.isArray(transcript) ? transcript : []).map(e => e && e.text).filter(Boolean).join(' '));
  const supports = span => sourceText.includes(normalise(span));

  // 1. Paraphrase rendered as speech. The format IS the claim.
  if (!dialoguePermitted(fidelity)) {
    const lines = attributedDialogueLines(discussion, participantNames);
    if (lines.length) {
      findings.push({
        code: FIDELITY_VIOLATION.INVENTED_DIALOGUE,
        detail: `${lines.length} line(s) are written as attributed speech, but no capture in this meeting carries the speaker's own wording.`,
      });
    }
    // 2. First-person wording THE SOURCE DOES NOT SUPPORT.
    //
    // Supported quotations are removed before this check, and that exclusion is
    // load-bearing rather than a convenience: a notetaker may legitimately type
    // a verbatim fragment — `Sam said "I was not working that day"` — and
    // reproducing it is faithful, not invented. Caught by my own test, which
    // had asserted the blunter rule. Unsupported quotations are not removed, so
    // the UAT output's invented first-person speech is still caught here as
    // well as by check 3.
    const outsideSupportedQuotes = String(discussion).replace(QUOTED, (whole, inner) => (supports(inner) ? ' ' : whole));
    if (FIRST_PERSON.test(outsideSupportedQuotes)) {
      findings.push({
        code: FIDELITY_VIOLATION.FIRST_PERSON_SPEECH,
        detail: 'The account uses first-person wording the captured notes do not support, which presents the notetaker\'s summary as a participant\'s own words.',
      });
    }
  }

  // 3. A quotation that is not in the source. Applies at EVERY fidelity: a
  //    quotation mark is a claim about exact words whatever the channel, and a
  //    transcript-derived record may still be embellished.
  const unsupported = quotedSpans(discussion).filter(q => !supports(q));
  if (unsupported.length) {
    findings.push({
      code: FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION,
      detail: `${unsupported.length} quoted passage(s) do not appear in what was captured.`,
    });
  }
  return findings;
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
export function applyFidelityGuard(record, transcript, { participantNames = [] } = {}) {
  const violations = fidelityViolations(record, transcript, { participantNames });
  if (!violations.length) return { record, violations: [], replaced: false };

  const fidelity = sourceFidelity(transcript);
  const faithful = faithfulDiscussion(transcript, { fidelity });
  if (!faithful) return { record, violations, replaced: false };

  const text = typeof record === 'string' ? record : '';
  const lines = text.split('\n');
  const details = [];
  let inDetails = false;
  let level = 0;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (isDetailsHeading(line)) { inDetails = true; level = headingLevel(line) || 1; details.push(line); continue; }
    if (inDetails) {
      const h = headingLevel(line);
      if (h > 0 && h <= level) { inDetails = false; continue; }
      details.push(line);
    }
  }
  const head = details.join('\n').replace(/[\s\r\n]+$/, '');
  return {
    record: head ? `${head}\n\n${faithful}` : faithful,
    violations,
    replaced: true,
  };
}

/** The one sentence the manager is told when the guard replaced the section. */
export function describeFidelityFallback() {
  return 'Compass set out your notes as recorded. The drafted version restated them as dialogue, which your notes do not support — please edit the record as needed.';
}
