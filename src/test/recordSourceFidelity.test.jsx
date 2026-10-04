import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SOURCE_FIDELITY, FIDELITY_VIOLATION, QUOTATION_FLOOR, RECORD_REGION,
  carriesOwnWords, sourceFidelity, dialoguePermitted, discussionHeading,
  discussionText, detailsText, participantInitials, speakerLabels,
  attributedDialogueLines, unsupportedAttributions, unsupportedSpecifics,
  authoritativeText, dateRenderings, quotedSpans, fidelityViolations, discussionInstruction,
  faithfulDiscussion, faithfulDetails, applyFidelityGuard,
  describeFidelityFallback, violatedRegions,
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

// CLASS A — what Compass knows about this meeting independently of the model.
// The DETAILS fixture states a date and times, and those are legitimate ONLY
// because they come from here. Passing this is not a convenience: without it
// the guard correctly refuses "4 October 2026" as unsupported.
const AUTH = {
  meetingType: 'Investigation Meeting',
  date: '4 October 2026',
  startTime: '20:44',
  endTime: '21:19',
  chair: CHAIR,
  employee: EMPLOYEE,
  notetaker: '',
  representative: '',
  participants: [],
  adjournments: [],
};

const guard = (record, transcript, over = {}) =>
  applyFidelityGuard(record, transcript, { participantNames: NAMES, authoritative: AUTH, ...over });

const heard = (text) => note(text, { channel: CAPTURE_CHANNEL.SPEECH_MIC });
const imported = (text) => note(text, { channel: CAPTURE_CHANNEL.IMPORT });
const legacy = (text) => { const n = note(text); delete n.channel; delete n.captureId; return n; };

const codes = (r, t, names = NAMES, auth = AUTH) => fidelityViolations(r, t, { participantNames: names, authoritative: auth }).map(v => v.code);

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
    const out = guard(BAD_RECORD, SOURCE_NOTES);
    expect(out.replaced).toBe(true);
    expect(out.record).toContain('Type: Investigation Meeting');
    expect(out.record).not.toContain('UD(:');
    expect(out.record).not.toContain('I was not working');
    expect(out.record).not.toContain('Can you tell me what happened');
  });

  it('6. and the replacement contains the notes verbatim, losing nothing', () => {
    const out = guard(BAD_RECORD, SOURCE_NOTES);
    for (const n of SOURCE_NOTES) expect(out.record).toContain(n.text);
  });

  it('7. a clean record is returned untouched', () => {
    const out = guard(GOOD_RECORD, SOURCE_NOTES);
    expect(out.replaced).toBe(false);
    expect(out.record).toBe(GOOD_RECORD);
  });

  it('8. the replacement itself passes the guard — no second-order violation', () => {
    const out = guard(BAD_RECORD, SOURCE_NOTES);
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

  it('22. initials ignore punctuation tokens and dashes', () => {
    // The defect: name.split(" ").map(w=>w[0]).join("") presented "UD(" and
    // "ZUTS—ST" — an opening bracket and an em-dash — as human initials.
    expect(participantInitials(CHAIR)).not.toContain('(');
    expect(participantInitials(EMPLOYEE)).not.toMatch(/[—–-]/);
    expect(participantInitials(CHAIR)).toBe('UDT');
    expect(participantInitials(EMPLOYEE)).toBe('ZUTS');
    expect(participantInitials('Jane Smith')).toBe('JS');
  });

  it('23. a single-name participant is not reduced to one letter, and a label that cannot be derived falls back to the role', () => {
    expect(participantInitials('Sam')).toBe('Sam');
    expect(participantInitials('', { fallback: 'Chair' })).toBe('Chair');
    expect(participantInitials('—', { fallback: 'Employee' })).toBe('Employee');
    expect(participantInitials('(((', { fallback: 'Chair' })).toBe('Chair');
  });

  it('24. the guard still recognises the OLD naive labels as speaker labels', () => {
    // Otherwise cleaning up initials would quietly blind the guard to the exact
    // output that caused the blocker.
    expect(speakerLabels([CHAIR]).has('ud(')).toBe(true);
    expect(speakerLabels([EMPLOYEE]).has('zuts—st')).toBe(true);
    expect(speakerLabels([CHAIR]).has('udt')).toBe(true);
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

  it('27. an empty meeting has no fidelity claim and nothing to fall back to', () => {
    expect(sourceFidelity([])).toBe(SOURCE_FIDELITY.EMPTY);
    expect(faithfulDiscussion([])).toBe('');
    // With no notes AND no authoritative context, nothing supports the record's
    // own dates — so the guard correctly objects rather than waving it through.
    expect(codes(GOOD_RECORD, [], NAMES, null)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_SPECIFICITY);
    // And with nothing to rebuild from, it refuses to blank the record.
    const out = applyFidelityGuard(GOOD_RECORD, [], { participantNames: NAMES, authoritative: null });
    expect(out.replaced).toBe(false);
    expect(out.record).toBe(GOOD_RECORD);
  });

  it('28. the employee record carries no capture ids or channel names', () => {
    const out = guard(BAD_RECORD, SOURCE_NOTES);
    expect(out.record).not.toMatch(/captureId|channel|typing|speech_mic|utt_/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. the guard fails safe', () => {
  it('29. malformed AI output never throws and never loses the notes', () => {
    for (const bad of [null, undefined, '', 42, {}, [], '   ']) {
      const out = guard(bad, SOURCE_NOTES);
      expect(() => out.record).not.toThrow();
      expect(typeof out.record === 'string' || out.record === bad).toBe(true);
    }
  });

  it('30. Meeting Details supported by authoritative data passes; without it, the same text does not', () => {
    expect(codes(DETAILS, SOURCE_NOTES)).toEqual([]);
    // The date is legitimate ONLY because class A vouches for it.
    expect(codes(DETAILS, SOURCE_NOTES, NAMES, null)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_SPECIFICITY);
  });

  it('31. the guard never returns empty when there were notes', () => {
    const out = guard(BAD_RECORD, SOURCE_NOTES);
    expect(out.record.trim().length).toBeGreaterThan(0);
  });

  it('32. generation failure does not destroy raw source — the guard never touches transcript', () => {
    const before = JSON.parse(JSON.stringify(SOURCE_NOTES));
    guard(BAD_RECORD, SOURCE_NOTES);
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
    expect(guard(split.employeeFacing, SOURCE_NOTES).replaced).toBe(false);
  });

  it('39. the advisory section is not scanned for fidelity — it is analysis, not a record of speech', () => {
    const full = `${GOOD_RECORD}\n\n## HR Advisor Notes\n\nConsider whether "the rota should be checked" before concluding.`;
    const split = splitMeetingRecord(full);
    expect(codes(split.employeeFacing, SOURCE_NOTES)).toEqual([]);
  });

  it('40. Trust Slice 1b/1c: a guarded record still snapshots and compares identically', () => {
    const out = guard(BAD_RECORD, SOURCE_NOTES);
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
    const a = guard(BAD_RECORD, SOURCE_NOTES);
    const b = guard(BAD_RECORD, SOURCE_NOTES);
    expect(a).toEqual(b);
  });

  it('46. applying the guard twice is idempotent', () => {
    const once = guard(BAD_RECORD, SOURCE_NOTES);
    const twice = guard(once.record, SOURCE_NOTES);
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

// ═══════════════════════════════════════════════════════════════════════════
// FIDELITY COMPLETION — the guard protects the WHOLE employee-facing record.
//
// The previous pass protected the discussion section only, and human UAT proved
// that insufficient: Meeting Details > Purpose turned the notes' "2 October"
// into "2 October 2026". The year was plausible — the meeting really is in 2026
// — and plausibility is not evidence.
// ═══════════════════════════════════════════════════════════════════════════
describe('I. the full-record fidelity boundary', () => {
  // The real UAT header, with the real invented year.
  const INVENTED_YEAR = `## Meeting Details

Type: Investigation Meeting
Date: 4 October 2026
Chair: ${CHAIR}
Employee: ${EMPLOYEE}
Purpose: This meeting was held to investigate the circumstances surrounding a missing stock count on 2 October 2026 and to give the employee the opportunity to respond.

## Record of Discussion

The chair raised the missing stock count on 2 October.`;

  it('51. an unsupported YEAR cannot appear in a generated Purpose', () => {
    const v = fidelityViolations(INVENTED_YEAR, SOURCE_NOTES, { participantNames: NAMES, authoritative: AUTH });
    expect(v.map(x => x.code)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_SPECIFICITY);
    expect(v.find(x => x.code === FIDELITY_VIOLATION.UNSUPPORTED_SPECIFICITY).region).toBe(RECORD_REGION.DETAILS);
    expect(v.find(x => x.code === FIDELITY_VIOLATION.UNSUPPORTED_SPECIFICITY).detail).toContain('2 October 2026');
  });

  it('52. the AUTHORITATIVE meeting date may appear — Compass knows it independently', () => {
    expect(unsupportedSpecifics('Date: 4 October 2026', authoritativeText(AUTH))).toEqual([]);
    expect(codes(DETAILS, SOURCE_NOTES)).toEqual([]);
  });

  it('52b. the authoritative date is recognised however it is FORMATTED', () => {
    // caseInfo.date is ISO and the model writes "4 October 2026". Without this
    // the guard would call Compass's own meeting date an invented fact and
    // rebuild Meeting Details on essentially every real meeting.
    const iso = authoritativeText({ meetingType: 'Investigation Meeting', date: '2026-10-04' });
    for (const written of ['4 October 2026', 'October 4, 2026', '04/10/2026', '2026-10-04', '4th October 2026']) {
      expect(unsupportedSpecifics(`Date: ${written}`, iso), written).toEqual([]);
    }
    // A DIFFERENT date is still refused.
    expect(unsupportedSpecifics('Date: 7 October 2026', iso)).toEqual(['7 October 2026']);
    // Day-first input is read day-first, as this product does everywhere.
    const uk = authoritativeText({ date: '04/10/2026' });
    expect(unsupportedSpecifics('on 4 October 2026', uk)).toEqual([]);
    // Unparseable values pass through rather than being dropped.
    expect(dateRenderings('sometime last week')).toEqual(['sometime last week']);
    expect(dateRenderings('')).toEqual([]);
  });

  it('53. "2 October" alone is fine — it is in the notes; the YEAR is what was invented', () => {
    const corpus = `${SOURCE_NOTES.map(n => n.text).join(' ')} | ${authoritativeText(AUTH)}`;
    expect(unsupportedSpecifics('the stock count on 2 October', corpus)).toEqual([]);
    expect(unsupportedSpecifics('the stock count on 2 October 2026', corpus)).toEqual(['2 October 2026']);
  });

  it('54. a bare supported year is not flagged, so the check is not a blanket date ban', () => {
    const corpus = `${SOURCE_NOTES.map(n => n.text).join(' ')} | ${authoritativeText(AUTH)}`;
    expect(unsupportedSpecifics('reviewed during 2026', corpus)).toEqual([]);
    expect(unsupportedSpecifics('reviewed during 2019', corpus)).toEqual(['2019']);
  });

  it('55. REFORMATTING is not an invention — "2nd Oct" is still "2 October"', () => {
    const corpus = SOURCE_NOTES.map(n => n.text).join(' ');
    expect(unsupportedSpecifics('on 2nd Oct', corpus)).toEqual([]);
    expect(unsupportedSpecifics('on 2nd October', corpus)).toEqual([]);
    expect(unsupportedSpecifics('on October 2', corpus)).toEqual([]);
  });

  it('56. unsupported CHRONOLOGY — an invented clock time cannot survive', () => {
    const r = `${DETAILS}\n\n## Record of Discussion\n\nThe stock count was found to be missing at 14:30.`;
    expect(codes(r, SOURCE_NOTES)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_SPECIFICITY);
    // The meeting's own start time IS supported.
    expect(unsupportedSpecifics('The meeting began at 20:44.', authoritativeText(AUTH))).toEqual([]);
  });

  it('57. unsupported figures and sums cannot survive', () => {
    const corpus = `${SOURCE_NOTES.map(n => n.text).join(' ')} | ${authoritativeText(AUTH)}`;
    expect(unsupportedSpecifics('stock worth £4,200 was missing', corpus)).toEqual(['£4,200']);
    expect(unsupportedSpecifics('a 30% shortfall', corpus)).toEqual(['30%']);
  });

  it('58. an unsupported QUOTATION in Meeting Details is caught too', () => {
    const r = `## Meeting Details\n\nType: Investigation Meeting\nDate: 4 October 2026\nPurpose: Held because Sam said "I refuse to complete any stock counts".\n\n## Record of Discussion\n\nThe chair raised the stock count.`;
    const v = fidelityViolations(r, SOURCE_NOTES, { participantNames: NAMES, authoritative: AUTH });
    expect(v.some(x => x.code === FIDELITY_VIOLATION.UNSUPPORTED_QUOTATION && x.region === RECORD_REGION.DETAILS)).toBe(true);
  });

  it('59. unsupported FIRST PERSON in Meeting Details is caught too', () => {
    const r = `## Meeting Details\n\nType: Investigation Meeting\nDate: 4 October 2026\nPurpose: I held this meeting to investigate my concerns.\n\n## Record of Discussion\n\nThe chair raised the stock count.`;
    const v = fidelityViolations(r, SOURCE_NOTES, { participantNames: NAMES, authoritative: AUTH });
    expect(v.some(x => x.code === FIDELITY_VIOLATION.FIRST_PERSON_SPEECH && x.region === RECORD_REGION.DETAILS)).toBe(true);
  });

  it('60. unsupported ATTRIBUTION — dialogue credited to someone not present', () => {
    const src = [heard('Were you at work on 2 October?')];
    const r = `${DETAILS}\n\n## Meeting Dialogue\n\nUDT: Were you at work on 2 October?\nJohn Baker: I saw him leave early.`;
    const v = fidelityViolations(r, src, { participantNames: NAMES, authoritative: AUTH });
    expect(v.map(x => x.code)).toContain(FIDELITY_VIOLATION.UNSUPPORTED_ATTRIBUTION);
    expect(v.find(x => x.code === FIDELITY_VIOLATION.UNSUPPORTED_ATTRIBUTION).detail).toContain('John Baker');
  });

  it('61. a structural label is never mistaken for an invented witness', () => {
    const src = [heard('Were you at work?')];
    for (const label of ['Evidence', 'Follow-up', 'Next steps', 'Employee response', 'Actions']) {
      const r = `${DETAILS}\n\n## Meeting Dialogue\n\n${label}: the rota should be checked.`;
      expect(codes(r, src), label).not.toContain(FIDELITY_VIOLATION.UNSUPPORTED_ATTRIBUTION);
    }
  });

  it('61b. detailsText extracts the header block and nothing else', () => {
    expect(detailsText(GOOD_RECORD)).toContain('Type: Investigation Meeting');
    expect(detailsText(GOOD_RECORD)).not.toContain('The chair raised');
    // Details and discussion partition the record — neither sees the other.
    expect(discussionText(GOOD_RECORD)).not.toContain('Type: Investigation Meeting');
    expect(detailsText('no headings here at all')).toBe('');
  });

  it('61c. unsupportedAttributions names the invented speaker and ignores the known ones', () => {
    const text = `UDT: Were you at work?\nJohn Baker: I saw him leave.\nEvidence: the rota.\n${EMPLOYEE}: No.`;
    expect(unsupportedAttributions(text, NAMES)).toEqual(['John Baker']);
    expect(unsupportedAttributions('', NAMES)).toEqual([]);
  });

  it('62. a KNOWN participant is never flagged as an invented attribution', () => {
    const src = [heard('No I was not working that day.')];
    const r = `${DETAILS}\n\n## Meeting Dialogue\n\nZUTS: No I was not working that day.`;
    expect(codes(r, src)).not.toContain(FIDELITY_VIOLATION.UNSUPPORTED_ATTRIBUTION);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('J. region-aware fallback keeps what was sound', () => {
  const BAD_DETAILS_GOOD_BODY = `## Meeting Details

Type: Investigation Meeting
Date: 4 October 2026
Purpose: To investigate the missing stock count on 2 October 2026.

## Record of Discussion

The chair raised the missing stock count on 2 October.`;

  it('63. only the OFFENDING region is replaced', () => {
    const out = guard(BAD_DETAILS_GOOD_BODY, SOURCE_NOTES);
    expect(out.replaced).toBe(true);
    expect(out.replacedRegions).toEqual([RECORD_REGION.DETAILS]);
    // The sound discussion section survives verbatim.
    expect(out.record).toContain('The chair raised the missing stock count on 2 October.');
    // The invented year is gone.
    expect(out.record).not.toContain('2 October 2026');
  });

  it('64. the rebuilt Meeting Details comes only from authoritative data', () => {
    const d = faithfulDetails(AUTH);
    expect(d).toContain('Type: Investigation Meeting');
    expect(d).toContain('Date: 4 October 2026');
    expect(d).toContain('Start time: 20:44');
    expect(d).toContain(`Employee: ${EMPLOYEE}`);
    // A neutral Purpose that asserts nothing about the incident.
    expect(d).toContain('Purpose: Investigation Meeting with');
    expect(d).not.toContain('stock count');
    // And it passes its own guard.
    expect(codes(`${d}\n\n## Record of Discussion\n\nThe chair raised the stock count.`, SOURCE_NOTES)).toEqual([]);
  });

  it('65. a discussion-only violation leaves Meeting Details alone', () => {
    const out = guard(BAD_RECORD, SOURCE_NOTES);
    expect(out.replacedRegions).toEqual([RECORD_REGION.DISCUSSION]);
    expect(out.record).toContain('Purpose: To investigate the circumstances surrounding a missing stock count.');
  });

  it('66. both regions bad replaces both, and the result is clean', () => {
    const bothBad = `## Meeting Details\n\nType: Investigation Meeting\nPurpose: Held about the count on 2 October 2026.\n\n## Meeting Dialogue\n\nUD(: "I was not working on 2 October."`;
    const out = guard(bothBad, SOURCE_NOTES);
    expect(new Set(out.replacedRegions)).toEqual(new Set([RECORD_REGION.DETAILS, RECORD_REGION.DISCUSSION]));
    expect(codes(out.record, SOURCE_NOTES)).toEqual([]);
    for (const n of SOURCE_NOTES) expect(out.record).toContain(n.text);
  });

  it('67. the fallback retains source meaning — every note survives verbatim', () => {
    const out = guard(BAD_RECORD, SOURCE_NOTES);
    const body = discussionText(out.record);
    for (const n of SOURCE_NOTES) expect(body).toContain(n.text);
  });

  it('68. the manager is told which part was replaced', () => {
    expect(describeFidelityFallback([RECORD_REGION.DETAILS])).toMatch(/meeting details/i);
    expect(describeFidelityFallback([RECORD_REGION.DISCUSSION])).toMatch(/your notes/i);
    expect(describeFidelityFallback([RECORD_REGION.DETAILS, RECORD_REGION.DISCUSSION])).toMatch(/notes and the meeting details/i);
  });

  it('69. violatedRegions reports exactly the regions with findings', () => {
    const v = fidelityViolations(BAD_DETAILS_GOOD_BODY, SOURCE_NOTES, { participantNames: NAMES, authoritative: AUTH });
    expect(violatedRegions(v)).toEqual(new Set([RECORD_REGION.DETAILS]));
  });

  it('70. the raw transcript is never mutated by any of this', () => {
    const before = JSON.parse(JSON.stringify(SOURCE_NOTES));
    guard(BAD_RECORD, SOURCE_NOTES);
    guard(BAD_DETAILS_GOOD_BODY, SOURCE_NOTES);
    expect(SOURCE_NOTES).toEqual(before);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NO HIDDEN STRONGER VERSION. The anti-pattern: the UI guard corrects the
// record, but some internal feature still consumes the rejected reconstruction.
// ═══════════════════════════════════════════════════════════════════════════
describe('K. no downstream surface receives rejected text', () => {
  const appCode = readFileSync('src/App.jsx', 'utf8');

  it('71. the PRE-GUARD text has exactly one destination: the guard itself', () => {
    // Enumerated rather than negative-matched, so a new consumer added later
    // fails this test instead of slipping through.
    const uses = appCode.split('\n')
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /\bfullRecord\b/.test(l) && !/^\s*(\/\/|\*)/.test(l.trim()));
    const kinds = uses.map(([, l]) => l.trim());
    expect(kinds).toEqual([
      'let fullRecord = "";',
      'fullRecord = await streamClaude(',
      'if(!fullRecord.trim()) throw new Error("Compass AI returned an empty response.");',
      'const split = splitMeetingRecord(fullRecord);',
    ]);
  });

  it('72. RISK SCORE receives the guarded record, never the pre-guard text', () => {
    expect(appCode).toContain('runRiskScore(guardedRecord || allNotes');
    expect(appCode).not.toContain('runRiskScore(fullRecord');
  });

  it('73. the authoritative record written to the case is the guarded text', () => {
    // meeting.record is what case context, the investigation report, outcome
    // drafting, Ask Compass and case signals all read, so guarding it here is
    // what closes every one of those paths at once.
    expect(appCode).toContain('setReviewOutput(guarded.record)');
    expect(appCode).toContain('setReviewOutputOriginal(guarded.record)');
    expect(appCode).toContain('setAnalysisForRecord(guarded.record)');
  });

  it('74. ASK COMPASS on review is handed the same guarded record', () => {
    expect(appCode).toContain('askCompass(m,h,sh,sp,{record:reviewOutput})');
    expect(appCode).not.toMatch(/askCompass\([^)]*fullRecord/);
  });

  it('75. nothing passes the internal advisory half downstream as evidence', () => {
    // split.internal has exactly one destination: the HR-facing panel state.
    const uses = (appCode.match(/split\.internal/g) || []).length;
    expect(uses).toBe(1);
    expect(appCode).toContain('setAdvisorNotes(split.internal)');
  });

  it('76. the guarded record is the only employee-facing text, so split.employeeFacing feeds only the guard', () => {
    const uses = (appCode.match(/split\.employeeFacing/g) || []).length;
    expect(uses).toBe(1);
    expect(appCode).toContain('applyFidelityGuard(split.employeeFacing, allNotes');
  });

  it('77. fidelity is computed from capture channels and authoritative state only', () => {
    expect(appCode).toContain('const recordFidelityKind = sourceFidelity(allNotes);');
    expect(appCode).toContain('const fidelityAuthoritative = {');
    expect(appCode).toContain('authoritative: fidelityAuthoritative,');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('L. one canonical prompt output contract', () => {
  const appCode = readFileSync('src/App.jsx', 'utf8');
  const promptStart = appCode.indexOf('You are a senior UK HR documentation specialist.');
  const promptEnd = appCode.indexOf('t=>setReviewOutput(t)', promptStart);

  it('78. the anchors resolve, so the assertions below are not vacuous', () => {
    expect(promptStart).toBeGreaterThan(-1);
    expect(promptEnd).toBeGreaterThan(promptStart);
  });

  it('79. the prompt no longer asks for sections the contract forbids', () => {
    const block = appCode.slice(promptStart, promptEnd);
    // The contradiction: the system half demanded exactly three sections while
    // the user half appended five more.
    for (const ghost of ['## Key Points', '## Employee Position', '## Management Position', '## Procedural Checks', '## Actions & Next Steps']) {
      expect(block, ghost).not.toContain(ghost);
    }
  });

  it('80. the only headings requested are the three canonical ones', () => {
    const block = appCode.slice(promptStart, promptEnd);
    const headings = [...new Set((block.match(/## [A-Z][A-Za-z &/]*/g) || []).map(h => h.trim()))];
    expect(headings.sort()).toEqual(['## HR Advisor Notes', '## Meeting Details']);
    // The third is supplied by discussionInstruction, which contributes exactly
    // one heading and varies it by fidelity.
    for (const f of [SOURCE_FIDELITY.PARAPHRASE_ONLY, SOURCE_FIDELITY.VERBATIM_PRESENT]) {
      expect((discussionInstruction(f, {}).match(/^## /gm) || []).length).toBe(1);
    }
    expect(block).toContain('${discussionInstruction(recordFidelityKind');
  });

  it('81. paraphrase-only records do NOT regain dialogue prefixes now initials are cleaner', () => {
    const block = appCode.slice(promptStart, promptEnd);
    // The initials rule is inside the dialogue-permitted branch only.
    expect(block).toContain('${dialoguePermitted(recordFidelityKind) ?');
    const para = discussionInstruction(SOURCE_FIDELITY.PARAPHRASE_ONLY, {});
    expect(para).toMatch(/prefix any line with a participant's name or initials/i);
    // And the guard still refuses them whatever the prompt says.
    expect(codes(`${DETAILS}\n\n## Record of Discussion\n\nUDT: The count was discussed.`, SOURCE_NOTES))
      .toContain(FIDELITY_VIOLATION.INVENTED_DIALOGUE);
  });

  it('82. the Purpose field is explicitly held to source fidelity', () => {
    const block = appCode.slice(promptStart, promptEnd);
    expect(block).toMatch(/never "2 October 2026"/);
  });
});
