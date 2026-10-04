import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SOURCE_FIDELITY, FIDELITY_VIOLATION, QUOTATION_FLOOR,
  carriesOwnWords, sourceFidelity, dialoguePermitted, discussionHeading,
  discussionText, initialsOf, speakerLabels, attributedDialogueLines,
  quotedSpans, fidelityViolations, discussionInstruction, faithfulDiscussion,
  applyFidelityGuard, describeFidelityFallback,
} from '../lib/recordFidelity.js';
import { CAPTURE_CHANNEL } from '../lib/noteCapture.js';
import { splitMeetingRecord } from '../lib/meetingRecordSections.js';
import { employeeFacingSnapshot, snapshotDivergence } from '../lib/signedSnapshot.js';

// ═══════════════════════════════════════════════════════════════════════════
// TRUST UAT BLOCKER 2 — A GENERATED RECORD MUST NOT INVENT VERBATIM DIALOGUE.
//
// Human UAT typed four PARAPHRASED third-person notes and the generated record
// came back as first-person dialogue, including a question nobody asked in those
// words. The record is the document the employee is asked to sign.
//
// The principle under test: COMPASS MAY IMPROVE STRUCTURE AND CLARITY BUT MUST
// NOT INCREASE THE APPARENT CERTAINTY OF THE SOURCE EVIDENCE.
//
// These are output tests. The fixtures below are the real shapes: SOURCE_NOTES
// is what the tester actually typed, and BAD_RECORD is what Compass actually
// produced from it, initials and all.
// ═══════════════════════════════════════════════════════════════════════════

const CHAIR = 'UAT D4.3 (test)';
const EMPLOYEE = 'ZZ UAT Trust Slice — Sam Testcase';
const NAMES = [CHAIR, EMPLOYEE];

const note = (text, over = {}) => ({
  id: `c${text.length}`, captureId: `c${text.length}`, channel: CAPTURE_CHANNEL.TYPING,
  speaker: CHAIR, text, ts: '20:45:40', pending: false, aiAttributed: true, ...over,
});

// The four notes the tester typed. Paraphrase, third person, no quotation marks.
const SOURCE_NOTES = [
  note('Asked Sam about the missing stock count on 2 October.'),
  note('Sam said they were not working on 2 October.'),
  note('Sam said they had informed their manager that they were unavailable.'),
  note('Sam was asked whether they had any evidence of that conversation and said they would check.'),
];

const DETAILS = `## Meeting Details

Type: Investigation Meeting
Date: 4 October 2026
Chair: ${CHAIR}
Notetaker: Not specified
Employee: ${EMPLOYEE}
Purpose: To investigate the circumstances surrounding a missing stock count.`;

// What Compass actually produced. Note the invented question in line 4 — nobody
// said "Do you have any evidence of that conversation with your manager?"
const BAD_RECORD = `${DETAILS}

## Meeting Dialogue

UD(: "I would like to ask you about the missing stock count on 2 October. Can you tell me what happened?"
ZUTS—ST: "I was not working on 2 October."
ZUTS—ST: "I had informed my manager that I was unavailable on that date."
UD(: "Do you have any evidence of that conversation with your manager?"
ZUTS—ST: "I will need to check and come back to you on that."`;

// The same meeting, written at the fidelity the notes support.
const GOOD_RECORD = `${DETAILS}

## Record of Discussion

The chair raised the missing stock count on 2 October.

${EMPLOYEE} stated that they were not working on 2 October, and said they had informed their manager that they were unavailable.

${EMPLOYEE} was asked whether they could provide evidence of that conversation and said they would check.`;

const heard = (text) => note(text, { channel: CAPTURE_CHANNEL.SPEECH_MIC });
const imported = (text) => note(text, { channel: CAPTURE_CHANNEL.IMPORT });
const legacy = (text) => { const n = note(text); delete n.channel; delete n.captureId; return n; };

const codes = (r, t, names = NAMES) => fidelityViolations(r, t, { participantNames: names }).map(v => v.code);

// ═══════════════════════════════════════════════════════════════════════════
describe('A. the UAT output is caught', () => {
  it('1. manual paraphrase does not become a quote', () => {
    expect(codes(BAD_RECORD, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });

  it('2. manual paraphrase does not become invented first-person dialogue', () => {
    const c = codes(BAD_RECORD, SOURCE_NOTES);
    expect(c).toContain(FIDELITY_VIOLATION.INVENTED_DIALOGUE);
    expect(c).toContain(FIDELITY_VIOLATION.FIRST_PERSON_SPEECH);
  });

  it('3. a manager shorthand note does not become an invented fuller question', () => {
    // "Asked Sam about the missing stock count" became "I would like to ask you
    // about the missing stock count on 2 October. Can you tell me what happened?"
    const only = `${DETAILS}\n\n## Meeting Dialogue\n\nUD(: Can you tell me what happened?`;
    expect(codes(only, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.INVENTED_DIALOGUE);
  });

  it('4. the faithful version passes clean', () => {
    expect(codes(GOOD_RECORD, SOURCE_NOTES)).toEqual([]);
  });

  it('5. the guard REPLACES the invented section and keeps Meeting Details', () => {
    const out = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    expect(out.replaced).toBe(true);
    expect(out.record).toContain('Type: Investigation Meeting');
    expect(out.record).not.toContain('UD(:');
    expect(out.record).not.toContain('I was not working');
    expect(out.record).not.toContain('Can you tell me what happened');
  });

  it('6. and the replacement contains the notes verbatim, losing nothing', () => {
    const out = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    for (const n of SOURCE_NOTES) expect(out.record).toContain(n.text);
  });

  it('7. a clean record is returned untouched', () => {
    const out = applyFidelityGuard(GOOD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    expect(out.replaced).toBe(false);
    expect(out.record).toBe(GOOD_RECORD);
  });

  it('8. the replacement itself passes the guard — no second-order violation', () => {
    const out = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    expect(codes(out.record, SOURCE_NOTES)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. certainty is never increased', () => {
  it('9. no new factual detail is introduced — an invented year is a quotation-free lie we still catch via dialogue form', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\nUD(: The stock count went missing at 14:30 on 2 October 2026.`;
    expect(codes(r, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.INVENTED_DIALOGUE);
  });

  it('10. an admission is not strengthened into a quotation', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\nSam admitted: "I did not complete the stock count."`;
    expect(codes(r, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });

  it('11. a denial is not strengthened into a quotation', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\nThe employee denied it, saying "I was absolutely not there at any point."`;
    expect(codes(r, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });

  it('12. uncertainty is preserved — "said they would check" may not become a commitment quote', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\nSam confirmed: "I will send you the rota by Friday."`;
    expect(codes(r, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });

  it('13. first person anywhere in a paraphrase-sourced account is refused', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\nSam explained that I had not been informed.`;
    expect(codes(r, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.FIRST_PERSON_SPEECH);
  });

  it('14. two source notes MAY be combined when meaning is unchanged', () => {
    // Notes 2 and 3 merged into one sentence, third person, no quotes: allowed.
    const r = `${DETAILS}\n\n## Record of Discussion\n\nSam stated that they were not working on 2 October and had informed their manager that they were unavailable.`;
    expect(codes(r, SOURCE_NOTES)).toEqual([]);
  });

  it('15. a quotation that IS in the source is allowed', () => {
    const src = [note('Sam said "I was not working that day" when asked directly.')];
    const r = `${DETAILS}\n\n## Record of Discussion\n\nSam said "I was not working that day" when asked.`;
    expect(codes(r, src)).not.toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });

  it('16. a short quoted term is not treated as reported speech', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\nThe chair referred to the "Stock Policy" during the discussion.`;
    expect('Stock Policy'.length).toBeLessThan(QUOTATION_FLOOR);
    expect(codes(r, SOURCE_NOTES)).not.toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. capture provenance drives the model', () => {
  it('17. typed, flushed and system notes do not carry own words', () => {
    expect(carriesOwnWords(note('x'))).toBe(false);
    expect(carriesOwnWords(note('x', { channel: CAPTURE_CHANNEL.FLUSH }))).toBe(false);
    expect(carriesOwnWords(note('x', { channel: CAPTURE_CHANNEL.SYSTEM }))).toBe(false);
  });

  it('18. speech and imported transcript do carry own words', () => {
    expect(carriesOwnWords(heard('x'))).toBe(true);
    expect(carriesOwnWords(note('x', { channel: CAPTURE_CHANNEL.SPEECH_SCREEN }))).toBe(true);
    expect(carriesOwnWords(imported('x'))).toBe(true);
  });

  it('19. a LEGACY note with no channel fails to the LESS certain reading', () => {
    // Unknown stays unknown. It must not be promoted to verbatim.
    expect(carriesOwnWords(legacy('x'))).toBe(false);
    expect(sourceFidelity([legacy('x')])).toBe(SOURCE_FIDELITY.PARAPHRASE_ONLY);
    expect(dialoguePermitted(sourceFidelity([legacy('x')]))).toBe(false);
  });

  it('20. the heading itself does not claim dialogue for a paraphrase source', () => {
    expect(discussionHeading(SOURCE_FIDELITY.PARAPHRASE_ONLY)).toBe('Record of Discussion');
    expect(discussionHeading(SOURCE_FIDELITY.VERBATIM_PRESENT)).toBe('Meeting Dialogue');
  });

  it('21. the instruction forbids dialogue for paraphrase and permits it for speech', () => {
    const para = discussionInstruction(SOURCE_FIDELITY.PARAPHRASE_ONLY, { employee: EMPLOYEE });
    expect(para).toMatch(/MUST NOT/);
    expect(para).toMatch(/not a record of anyone's exact words|NOT a record of anyone's exact words/i);
    const verb = discussionInstruction(SOURCE_FIDELITY.VERBATIM_PRESENT, { employee: EMPLOYEE });
    expect(verb).toMatch(/dialogue form/i);
    expect(verb).toMatch(/do NOT render everything as dialogue/i);
  });

  it('22. the initials derivation that produced UD( and ZUTS—ST is reproduced exactly', () => {
    // Documents the formatting defect rather than silently differing from it.
    expect(initialsOf(CHAIR)).toBe('UD(');
    expect(initialsOf(EMPLOYEE)).toBe('ZUTS—ST');
    expect(initialsOf('Jane Smith')).toBe('JS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. transcript-derived and mixed meetings', () => {
  it('23. transcript-derived dialogue preserving supported wording passes', () => {
    const src = [heard('Were you at work on 2 October?'), heard('No, I was not working that day.')];
    const r = `${DETAILS}\n\n## Meeting Dialogue\n\nUD(: Were you at work on 2 October?\nZUTS—ST: No, I was not working that day.`;
    expect(codes(r, src)).toEqual([]);
  });

  it('24. transcript-derived dialogue with an INVENTED quotation is still caught', () => {
    const src = [heard('Were you at work on 2 October?')];
    const r = `${DETAILS}\n\n## Meeting Dialogue\n\nUD(: Were you at work?\nZUTS—ST: "I have never worked a single shift there."`;
    expect(codes(r, src)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });

  it('25. imported transcript is not silently upgraded — its quotes must still be supported', () => {
    const src = [imported('Chair: did you attend? Employee: no.')];
    const r = `${DETAILS}\n\n## Meeting Dialogue\n\nUD(: "Did you attend the stocktake on the second?"`;
    expect(codes(r, src)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION);
  });

  it('26. a MIXED meeting permits dialogue but is told not to flatten the notes into it', () => {
    const mixed = [heard('No, I was not working that day.'), note('Asked Sam about the stock count.')];
    expect(sourceFidelity(mixed)).toBe(SOURCE_FIDELITY.VERBATIM_PRESENT);
    const instruction = discussionInstruction(SOURCE_FIDELITY.VERBATIM_PRESENT, {});
    expect(instruction).toMatch(/third-person attributable account/i);
    expect(instruction).toMatch(/Do not convert a note into speech/i);
  });

  it('27. an empty meeting has no fidelity claim and nothing to guard', () => {
    expect(sourceFidelity([])).toBe(SOURCE_FIDELITY.EMPTY);
    expect(fidelityViolations(GOOD_RECORD, [])).toEqual([]);
    expect(faithfulDiscussion([])).toBe('');
  });

  it('28. the employee record carries no capture ids or channel names', () => {
    const out = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    expect(out.record).not.toMatch(/captureId|channel|typing|speech_mic|utt_/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. the guard fails safe', () => {
  it('29. malformed AI output never throws and never loses the notes', () => {
    for (const bad of [null, undefined, '', 42, {}, [], '   ']) {
      const out = applyFidelityGuard(bad, SOURCE_NOTES, { participantNames: NAMES });
      expect(() => out.record).not.toThrow();
      expect(typeof out.record === 'string' || out.record === bad).toBe(true);
    }
  });

  it('30. a record with no discussion section is not flagged', () => {
    expect(fidelityViolations(DETAILS, SOURCE_NOTES, { participantNames: NAMES })).toEqual([]);
  });

  it('31. the guard never returns empty when there were notes', () => {
    const out = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    expect(out.record.trim().length).toBeGreaterThan(0);
  });

  it('32. generation failure does not destroy raw source — the guard never touches transcript', () => {
    const before = JSON.parse(JSON.stringify(SOURCE_NOTES));
    applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    expect(SOURCE_NOTES).toEqual(before);
  });

  it('33. an unknown participant label is not mistaken for a speaker', () => {
    // "Employee response:" is a structural label, not a person. Must not trip.
    const r = `${DETAILS}\n\n## Record of Discussion\n\nEmployee response: Sam stated that they were not working on 2 October.`;
    expect(codes(r, SOURCE_NOTES)).toEqual([]);
  });

  it('34. but a real participant name as a label IS a speech claim', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\n${EMPLOYEE}: They were not working that day.`;
    expect(codes(r, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.INVENTED_DIALOGUE);
  });

  it('35. the manager is told, in plain words, that the section was replaced', () => {
    expect(describeFidelityFallback()).toMatch(/your notes/i);
    expect(describeFidelityFallback()).not.toMatch(/fidelity|violation|guard|captureId/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. section boundaries and existing invariants hold', () => {
  it('36. the discussion is derived by EXCLUDING Meeting Details, not by naming a heading', () => {
    const renamed = `${DETAILS}\n\n## Something Else Entirely\n\nUD(: "I was not working on 2 October."`;
    expect(codes(renamed, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.INVENTED_DIALOGUE);
  });

  it('37. Meeting Details field lines are never read as dialogue', () => {
    expect(discussionText(DETAILS).trim()).toBe('');
    expect(attributedDialogueLines(DETAILS, NAMES)).toEqual([]);
  });

  it('38. Trust Slice: the advisory section is still stripped from the employee record', () => {
    const full = `${GOOD_RECORD}\n\n## HR Advisor Notes\n\nInternal commentary that must not reach the employee.`;
    const split = splitMeetingRecord(full);
    expect(split.employeeFacing).not.toContain('Internal commentary');
    expect(split.internal).toContain('Internal commentary');
    // And the guard operates on the employee-facing half only.
    expect(applyFidelityGuard(split.employeeFacing, SOURCE_NOTES, { participantNames: NAMES }).replaced).toBe(false);
  });

  it('39. the advisory section is not scanned for fidelity — it is analysis, not a record of speech', () => {
    const full = `${GOOD_RECORD}\n\n## HR Advisor Notes\n\nConsider whether "the rota should be checked" before concluding.`;
    const split = splitMeetingRecord(full);
    expect(codes(split.employeeFacing, SOURCE_NOTES)).toEqual([]);
  });

  it('40. Trust Slice 1b/1c: a guarded record still snapshots and compares identically', () => {
    const out = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    const snap = employeeFacingSnapshot({ record: out.record });
    expect(snap).toBeTruthy();
    expect(snapshotDivergence(snap, { record: out.record })).toBeFalsy();
  });

  it('41. quotedSpans finds curly and straight quotes alike', () => {
    expect(quotedSpans('he said “I was not working that day” then left')).toHaveLength(1);
    expect(quotedSpans('he said "I was not working that day" then left')).toHaveLength(1);
  });

  it('42. speakerLabels covers full name, first name and initials', () => {
    const l = speakerLabels([CHAIR]);
    expect(l.has(CHAIR.toLowerCase())).toBe(true);
    expect(l.has('ud(')).toBe(true);
    expect(l.has('uat')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. MUTATION TESTS — the fidelity guard is load-bearing', () => {
  it('43. each of the three checks independently rejects the UAT output', () => {
    // No single check is carrying the result alone, so removing one still
    // leaves the blocker caught — defence in depth, asserted rather than hoped.
    const onlyDialogue = `${DETAILS}\n\n## Record of Discussion\n\nUD(: The stock count was discussed.`;
    const onlyFirstPerson = `${DETAILS}\n\n## Record of Discussion\n\nSam explained that my manager was told.`;
    const onlyQuote = `${DETAILS}\n\n## Record of Discussion\n\nSam stated "something nobody actually said here".`;
    expect(codes(onlyDialogue, SOURCE_NOTES)).toEqual([FIDELITY_VIOLATION.INVENTED_DIALOGUE]);
    expect(codes(onlyFirstPerson, SOURCE_NOTES)).toEqual([FIDELITY_VIOLATION.FIRST_PERSON_SPEECH]);
    expect(codes(onlyQuote, SOURCE_NOTES)).toEqual([FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION]);
  });

  it('44. the quotation check is derivation-based, not a blanket ban on quotes', () => {
    const src = [note('Sam said "I was not working that day" when asked directly.')];
    const supported = `${DETAILS}\n\n## Record of Discussion\n\nThe note records "I was not working that day" as the response.`;
    expect(codes(supported, src)).toEqual([]);
  });

  it('45. the guard is a pure function of (record, transcript) — same input, same output', () => {
    const a = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    const b = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    expect(a).toEqual(b);
  });

  it('46. applying the guard twice is idempotent', () => {
    const once = applyFidelityGuard(BAD_RECORD, SOURCE_NOTES, { participantNames: NAMES });
    const twice = applyFidelityGuard(once.record, SOURCE_NOTES, { participantNames: NAMES });
    expect(twice.replaced).toBe(false);
    expect(twice.record).toBe(once.record);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('H. the generation path actually uses the guard', () => {
  const appCode = readFileSync('src/App.jsx', 'utf8');

  it('47. the authoritative record, the editable surface and the analysis all take the GUARDED text', () => {
    const from = appCode.indexOf('const split = splitMeetingRecord(fullRecord);');
    expect(from, 'anchor').toBeGreaterThan(-1);
    const region = appCode.slice(from, from + 1600);
    expect(region).toContain('applyFidelityGuard(split.employeeFacing, allNotes');
    // Every consumer reads guarded.record — none reads split.employeeFacing.
    for (const setter of ['setReviewOutput(guarded.record)', 'setReviewOutputOriginal(guarded.record)', 'setAnalysisForRecord(guarded.record)']) {
      expect(region, setter).toContain(setter);
    }
    expect(region).not.toContain('setReviewOutput(split.employeeFacing)');
  });

  it('48. fidelity is computed from the capture channels, never from a guess', () => {
    expect(appCode).toContain('const recordFidelityKind = sourceFidelity(allNotes);');
  });
});
