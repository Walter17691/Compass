import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCaseContext, meetingsNeedingSummary, stripAdvisorNotes } from '../lib/caseContext.js';

// NEW-22/23/24/25 — the post-meeting Review path. Asked for "legal risks" and
// a HIGH/MEDIUM/LOW rating from a transcript alone, with no epistemic contract
// anywhere, it turned a disputed employee assertion into a finding, an
// unverified historical attribution into a procedural defect, and both into a
// tribunal-outcome and 25% compensation prediction — citing case law it has no
// way to verify. It then persisted all of that into meeting.record, which
// buildCaseContext fed back as authoritative case grounding.
//
// Layer 1 tests pin the deterministic prompt contract. Layer 2 tests exercise
// the grounding boundary as real code. Neither asserts model output.
const app = readFileSync('src/App.jsx', 'utf8');

const contract = (() => {
  const start = app.indexOf('const REVIEW_EVIDENTIAL_CONTRACT');
  const end = app.indexOf('export default function Compass');
  expect(start).toBeGreaterThan(-1);
  return app.slice(start, end);
})();

const promptBlock = (marker, len = 4200) => {
  const i = app.indexOf(marker);
  expect(i).toBeGreaterThan(-1);
  return app.slice(i, i + len);
};

// ─────────────────────────── SHARED CONTRACT ───────────────────────────
describe('shared evidential contract', () => {
  it('names all five epistemic categories and forbids collapsing them', () => {
    for (const k of ['ESTABLISHED FACT', 'ATTRIBUTED STATEMENT', 'DISPUTED MATTER', 'UNRESOLVED or UNKNOWN', 'INFERENCE']) {
      expect(contract).toContain(k);
    }
    expect(contract).toMatch(/Keep these apart and never collapse one into another/);
  });

  it('claims are not facts, for either side', () => {
    expect(contract).toMatch(/A statement by the employee is not automatically an established fact, and neither is a statement by a manager or the employer/);
    expect(contract).toMatch(/stays attributed to whoever made it unless it is independently established/);
  });

  it('absence of evidence is not evidence of absence, and UNKNOWN is not a defect', () => {
    expect(contract).toMatch(/Absence of evidence is not evidence of absence/);
    expect(contract).toMatch(/unknown, not recorded, not verified or unresolved does NOT mean there was a defect, a breach, a conflict, unfairness or non-compliance/);
  });

  it('forbids manufacturing inconsistencies from differences of emphasis', () => {
    expect(contract).toMatch(/Do not manufacture a contradiction or inconsistency merely because two statements differ in emphasis or wording/);
  });

  it('forbids tribunal-outcome, sanction-validity and compensation predictions', () => {
    expect(contract).toMatch(/Do not predict what an employment tribunal would decide, whether a sanction or warning could be sustained, whether a dismissal would be found unfair, or what compensation or percentage uplift might follow/);
  });

  it('permits general principles but not case-specific conclusions from unestablished premises', () => {
    expect(contract).toMatch(/You may explain a general legal or procedural principle where it genuinely helps/);
    expect(contract).toMatch(/do not turn a general principle into a conclusion about THIS case unless the available facts actually establish the premise/);
  });

  it('requires checklist framing where something is unresolved', () => {
    expect(contract).toMatch(/say what should be confirmed, checked, verified, established, reviewed, considered or recorded — do not decide it/);
  });

  it('reuses the existing citation-safety wording rather than a second formulation', () => {
    expect(app).toContain('const NO_INVENTED_AUTHORITIES = "Never cite a specific named tribunal case, decision, or legal citation');
    expect(contract).toContain('+ NO_INVENTED_AUTHORITIES');
    // Exactly one definition of that wording anywhere.
    expect((app.match(/Never cite a specific named tribunal case/g) || []).length).toBe(1);
  });

  it('runPrediction still carries the identical wording via the shared constant', () => {
    const pred = promptBlock('UK employment tribunal outcome predictor', 700);
    expect(pred).toContain('${NO_INVENTED_AUTHORITIES} ## headers.');
    expect(pred).toMatch(/You must NEVER recommend a specific sanction, disciplinary outcome, or final decision/);
  });
});

// ─────────────────────────── A. MEETING SUMMARY ───────────────────────────
describe('A. Meeting Summary prompt contract', () => {
  const p = promptBlock('You are Compass, an Employee Relations copilot writing a short internal triage summary');

  it('carries the shared contract', () => {
    expect(p).toContain('${REVIEW_EVIDENTIAL_CONTRACT}');
  });

  it('Key Facts Established requires actual establishment; contested points go to Disputed Points', () => {
    expect(p).toMatch(/Key Facts Established carries only what the material actually establishes/);
    expect(p).toMatch(/a participant asserting something is not enough on its own, and anything still contested belongs under Disputed Points/);
  });

  it('New Evidence records that something was RAISED without implying it is proven', () => {
    expect(p).toMatch(/records that evidence or an issue was RAISED, without implying it is proven/);
  });

  it('Outstanding Questions stay questions', () => {
    expect(p).toMatch(/keeps unresolved matters as questions rather than resolving them/);
  });

  it('Actions Required uses checklist verbs and decides nothing', () => {
    expect(p).toMatch(/Confirm\.\.\., Check\.\.\., Verify\.\.\., Establish\.\.\., Review\.\.\., Consider\.\.\. or Record\.\.\./);
    expect(p).toMatch(/never use it to decide an unresolved factual or legal question/);
  });

  it('Potential Impact stays conditional, with the worked good/bad pair', () => {
    expect(p).toMatch(/Potential Impact stays conditional wherever its premise is unresolved/);
    expect(p).toContain('If records confirm that the policy was not communicated before the incident');
    expect(p).toContain('never "The failure to communicate the policy undermines the original decision."');
  });

  it('preserves the existing headings and formatting rules', () => {
    for (const h of ['## Key Facts Established', '## New Information', '## Disputed Points', '## Potential Inconsistencies',
      '## New Witnesses or Evidence Mentioned', '## Outstanding Questions', '## Actions Required', '## Potential Impact on Existing Allegations']) {
      expect(p).toContain(h);
    }
    expect(p).toMatch(/No preamble, no bold, no emoji, no tables/);
  });
});

// ─────────────────────────── B. HR ADVISOR NOTES ───────────────────────────
describe('B. HR Advisor Notes prompt contract', () => {
  const p = promptBlock('You are a senior UK HR documentation specialist. Generate a meeting record');

  it('is reframed from "expert legal guidance / legal risks" to grounded procedural guidance', () => {
    expect(p).toContain('## HR Advisor Notes (grounded UK HR procedural guidance in flowing prose');
    expect(app).not.toContain('expert legal guidance in flowing prose from a senior employment lawyer');
  });

  it('carries the shared contract', () => {
    expect(p).toContain('${REVIEW_EVIDENTIAL_CONTRACT}');
  });

  it('still permits genuinely useful HR guidance', () => {
    expect(p).toMatch(/may explain relevant procedural considerations, identify what needs verifying, explain why a confirmed fact would matter, and recommend reasonable next steps/);
  });

  it('unresolved or disputed facts cannot become legal conclusions', () => {
    expect(p).toMatch(/must NOT treat a participant's assertion as established/);
    expect(p).toMatch(/treat missing evidence as proof that something did not happen/);
    expect(p).toMatch(/convert an unknown, disputed or unresolved matter into a defect, breach, conflict, unfairness or non-compliance/);
  });

  it('no sanction-validity, tribunal-outcome, exposure or uplift prediction', () => {
    expect(p).toMatch(/must not say that a warning could not be sustained/);
    expect(p).toMatch(/that a sanction falls outside the band of reasonable responses/);
    expect(p).toMatch(/that a dismissal would be unfair/);
    expect(p).toMatch(/that a tribunal would reach any particular result/);
    expect(p).toMatch(/carries high, medium or low tribunal exposure/);
    expect(p).toMatch(/must not quantify compensation or any ACAS percentage uplift for this case/);
  });

  it('requires verification wording where information is insufficient', () => {
    expect(p).toMatch(/Where the information is insufficient, say what should be checked/);
    expect(p).toContain('Check whether the vehicle policy was communicated to the employee before the incident');
  });

  it('appeal independence: UNKNOWN is a verification point, never a conflict or defect', () => {
    expect(p).toMatch(/treat that as a verification point and nothing more/);
    expect(p).toMatch(/does not independently verify an officer's historical involvement from the structured record/);
    expect(p).toMatch(/incomplete historical attribution is not a conflict and not a procedural defect/);
    expect(p).toMatch(/does not need re-authorising here/);
    // A genuinely recorded conflict is still reportable.
    expect(p).toMatch(/A conflict genuinely recorded in the case record is different and should be stated plainly/);
  });

  it('preserves the three-section structure and the initials rule', () => {
    expect(p).toMatch(/EXACTLY these three sections and NO others/);
    expect(p).toMatch(/Use ONLY these initials, never full names in the dialogue/);
  });
});

// ─────────────────────────── C. RISK ASSESSMENT ───────────────────────────
describe('C. Risk Assessment prompt contract', () => {
  const p = promptBlock('UK employment law risk specialist', 3000);

  it('carries the shared contract', () => {
    expect(p).toContain("+' '+REVIEW_EVIDENTIAL_CONTRACT+'");
  });

  it('rates only what the record establishes', () => {
    expect(p).toMatch(/Rate only what the supplied record and context actually establish/);
  });

  it('assertion, dispute or UNKNOWN cannot alone justify HIGH or MEDIUM', () => {
    expect(p).toMatch(/An allegation, an assertion, a disputed point, or anything unknown, not recorded or not verified cannot on its own justify HIGH or MEDIUM/);
  });

  it('unresolved issues produce verification wording, not an asserted adverse premise', () => {
    expect(p).toMatch(/say in the summary what needs verifying rather than asserting the adverse premise, and rate on what is established/);
  });

  it('missing evidence is never proof of a procedural failure', () => {
    expect(p).toMatch(/Missing evidence is never proof of a procedural failure/);
  });

  it('JSON shape, rating field and max_tokens are unchanged', () => {
    // De-anchored: the example no longer seeds HIGH as the value.
    expect(p).toContain('{"rating":"<HIGH|MEDIUM|LOW>","summary":"two or three plain English sentences"}');
    expect(p).toMatch(/The rating field must be exactly one of HIGH, MEDIUM or LOW/);
    // max_tokens sits in the request body, immediately before the system prompt.
    const i = app.indexOf('UK employment law risk specialist');
    expect(app.slice(i - 300, i)).toContain('max_tokens:300');
    expect(app.slice(i - 300, i)).toContain('stream:false');
  });

  it('the organisational-history separation safeguard is unchanged', () => {
    // The source escapes apostrophes inside this single-quoted JS string.
    expect(p).toContain('keep organisation-wide patterns');
    expect(p).toContain("own case history analytically separate");
    expect(p).toContain('base-rate context, not this person');
  });
});

// ─────────────────────────── D. STRIPPING HELPER ───────────────────────────
const RECORD_WITH_ADVISOR = [
  '## Meeting Details',
  'Type: Disciplinary Appeal',
  'Chair: UAT - HR Manager',
  '',
  '## Meeting Dialogue',
  'UHM: Please set out your grounds of appeal.',
  'UFGP: I was not aware of the vehicle policy requirement.',
  'UHM: I will write the HR Advisor Notes up after this meeting.',
  '',
  '## HR Advisor Notes',
  'TEST_UNSUPPORTED_TRIBUNAL_CONCLUSION — the warning is likely outside the band of reasonable responses.',
].join('\n');

const RECORD_NO_ADVISOR = [
  '## Meeting Details',
  'Type: Investigation',
  '',
  '## Meeting Dialogue',
  'WC: Talk me through what happened.',
].join('\n');

describe('D. stripAdvisorNotes', () => {
  it('1. removes the Advisor section and preserves Details and Dialogue', () => {
    const out = stripAdvisorNotes(RECORD_WITH_ADVISOR);
    expect(out).toContain('## Meeting Details');
    expect(out).toContain('Chair: UAT - HR Manager');
    expect(out).toContain('## Meeting Dialogue');
    expect(out).toContain('I was not aware of the vehicle policy requirement.');
    expect(out).not.toContain('## HR Advisor Notes');
    expect(out).not.toContain('TEST_UNSUPPORTED_TRIBUNAL_CONCLUSION');
    expect(out).not.toContain('band of reasonable responses');
  });

  it('2. a record with no Advisor section is returned byte for byte', () => {
    expect(stripAdvisorNotes(RECORD_NO_ADVISOR)).toBe(RECORD_NO_ADVISOR);
  });

  it('3. Advisor Notes as the final section is removed cleanly, with no trailing blank tail', () => {
    const out = stripAdvisorNotes(RECORD_WITH_ADVISOR);
    expect(out.endsWith('UHM: I will write the HR Advisor Notes up after this meeting.')).toBe(true);
  });

  it('3b. Advisor Notes in the middle stops at the next same-level heading', () => {
    const mid = '## Meeting Details\nA\n\n## HR Advisor Notes\nADVISORY_BODY\n\n## Meeting Dialogue\nB';
    const out = stripAdvisorNotes(mid);
    expect(out).toContain('## Meeting Details');
    expect(out).toContain('## Meeting Dialogue');
    expect(out).toContain('B');
    expect(out).not.toContain('ADVISORY_BODY');
  });

  it('3c. a lower-level heading inside the advisory body does not end the skip early', () => {
    const nested = '## Meeting Dialogue\nD\n\n## HR Advisor Notes\nADVISORY_BODY\n### Sub point\nMORE_ADVISORY\n\n## Next\nKEEP';
    const out = stripAdvisorNotes(nested);
    expect(out).not.toContain('ADVISORY_BODY');
    expect(out).not.toContain('MORE_ADVISORY');
    expect(out).not.toContain('### Sub point');
    expect(out).toContain('KEEP');
  });

  it('4. CRLF input is handled', () => {
    const crlf = RECORD_WITH_ADVISOR.replace(/\n/g, '\r\n');
    const out = stripAdvisorNotes(crlf);
    expect(out).not.toContain('TEST_UNSUPPORTED_TRIBUNAL_CONCLUSION');
    expect(out).toContain('## Meeting Dialogue');
    expect(out).toContain('\r\n'); // line endings preserved for the kept content
  });

  it('5. the phrase inside ordinary dialogue does not trigger stripping', () => {
    const out = stripAdvisorNotes(RECORD_WITH_ADVISOR);
    expect(out).toContain('UHM: I will write the HR Advisor Notes up after this meeting.');
    const dialogueOnly = '## Meeting Dialogue\nWC: The HR Advisor Notes are not ready yet.';
    expect(stripAdvisorNotes(dialogueOnly)).toBe(dialogueOnly);
  });

  it('5b. tolerates heading level and spacing variation', () => {
    for (const h of ['## HR Advisor Notes', '###  HR Advisor Notes', '## HR Advisor notes', '##HR Advisor Notes']) {
      const rec = `## Meeting Dialogue\nKEEP_ME\n\n${h}\nADVISORY_BODY`;
      const out = stripAdvisorNotes(rec);
      expect(out).toContain('KEEP_ME');
      if (h === '##HR Advisor Notes') continue; // no space after # is not a markdown heading
      expect(out).not.toContain('ADVISORY_BODY');
    }
  });

  it('6. the stored record object is not mutated', () => {
    const meeting = { id: 'm1', type: 'Disciplinary Appeal', date: '22/09/2026', record: RECORD_WITH_ADVISOR };
    const snapshot = JSON.parse(JSON.stringify(meeting));
    stripAdvisorNotes(meeting.record);
    buildCaseContext({ employeeName: 'X', meetings: [meeting] });
    expect(meeting).toEqual(snapshot);
    expect(meeting.record).toContain('TEST_UNSUPPORTED_TRIBUNAL_CONCLUSION');
  });

  it('handles null, undefined and empty without throwing', () => {
    expect(stripAdvisorNotes(null)).toBe(null);
    expect(stripAdvisorNotes(undefined)).toBe(undefined);
    expect(stripAdvisorNotes('')).toBe('');
  });
});

// ─────────────────────────── E. CONTAMINATION PATH ───────────────────────────
describe('E. Advisor Notes cannot re-enter case grounding', () => {
  const meeting = { id: 'm1', type: 'Disciplinary Appeal', date: '22/09/2026', record: RECORD_WITH_ADVISOR };
  const cs = { id: 'c1', employeeName: 'UAT - Fresh Golden Path 2', caseType: 'misconduct', meetings: [meeting] };

  it('the saved fixture itself still contains the advisory conclusion', () => {
    expect(cs.meetings[0].record).toContain('TEST_UNSUPPORTED_TRIBUNAL_CONCLUSION');
  });

  it('7. buildCaseContext output does not contain Advisor Notes', () => {
    const ctx = buildCaseContext(cs);
    expect(ctx).not.toContain('TEST_UNSUPPORTED_TRIBUNAL_CONCLUSION');
    expect(ctx).not.toContain('## HR Advisor Notes');
    expect(ctx).not.toContain('band of reasonable responses');
  });

  it('8. buildCaseContext still contains the factual meeting record', () => {
    const ctx = buildCaseContext(cs);
    expect(ctx).toContain('MEETINGS:');
    expect(ctx).toContain('Disciplinary Appeal');
    expect(ctx).toContain('## Meeting Details');
  });

  it('signal-generation grounding built from that context is clean', () => {
    // App.jsx builds the signal prompt as "CASE RECORD:\n" + context.
    const signalPrompt = 'CASE RECORD:\n' + buildCaseContext(cs);
    expect(signalPrompt).not.toContain('TEST_UNSUPPORTED_TRIBUNAL_CONCLUSION');
  });

  it('the cached-summary compression path is sanitised too', () => {
    // summarizeMeetingsForCase feeds buildCaseContext's fallback body for
    // older meetings, so it must compress the factual record only.
    expect(app).toContain('${(stripAdvisorNotes(m.record)||"").slice(0, 3000)}');
  });

  it('meetingsNeedingSummary budgets on the same sanitised record', () => {
    const big = { id: 'm2', type: 'Investigation', date: '01/01/2026', record: 'x'.repeat(7000) + '\n\n## HR Advisor Notes\nADVISORY' };
    const needing = meetingsNeedingSummary({ meetings: [big] });
    expect(Array.isArray(needing)).toBe(true);
    // and the helper itself never returns advisory text
    expect(stripAdvisorNotes(big.record)).not.toContain('ADVISORY');
  });

  it('every buildCaseContext consumer inherits the boundary through the one builder', () => {
    // Ask Compass, case overview, next best action and unanswered questions all
    // route through buildHardenedCaseContext -> buildCaseContext.
    expect(app).toContain('return buildCaseContext(cs, caseAllegations, caseTaskList, summaries);');
    // One real call site; the other matches are prose references inside comments.
    const realCalls = (app.match(/[^/\s]\s*buildCaseContext\(cs,/g) || []).length;
    expect(realCalls).toBe(1);
  });
});

// ── FINAL REMEDIATION (NEW-22/23) ─────────────────────────────────────────
// Human UAT on the regenerated Review showed the evidential contract working,
// but surfaced a different failure class: Compass stating a legal requirement
// that does not exist. It asserted "the ACAS Code requires that appeal
// hearings are recorded" (it does not) and treated "Notetaker: Not specified"
// as a record-adequacy concern — while itself generating the written record.
// And HIGH/MEDIUM/LOW had no positive definitions at all, with the example
// JSON seeding "HIGH".
describe('A. notetaker / record self-awareness', () => {
  const p = promptBlock('You are a senior UK HR documentation specialist. Generate a meeting record', 7000);

  it('a named notetaker is optional unless authoritative context says otherwise', () => {
    expect(p).toMatch(/a named notetaker is optional unless the authoritative information supplied establishes otherwise/);
  });

  it('"Not specified" is explicitly not evidence that no adequate record exists', () => {
    expect(p).toMatch(/means only that nobody has been named/);
    expect(p).toMatch(/does NOT mean no notes were taken, that no adequate record exists/);
    expect(p).toMatch(/that the hearing was not appropriately recorded, that there is a procedural defect, or that there is a compliance concern/);
  });

  it('no procedural or compliance concern may be raised from an absent notetaker alone', () => {
    expect(p).toMatch(/never raise the absence of a named notetaker as a concern, a risk or something to verify/);
  });

  it('the prompt identifies the generated record as the written record of the hearing', () => {
    expect(p).toMatch(/The meeting record you are producing here is itself a written record of this hearing/);
    expect(p).toMatch(/never speculate about whether a record of the hearing exists/);
  });

  it('genuine record-quality concerns remain reportable', () => {
    expect(p).toMatch(/Genuine record concerns remain fully reportable where the supplied information establishes them/);
    for (const c of ['the record is disputed', 'that it is inaccurate', 'material information is missing from an existing record', 'affirmatively states no record was kept']) {
      expect(p).toContain(c);
    }
  });
});

describe('B. legal / ACAS accuracy boundary', () => {
  const boundary = (() => {
    const start = app.indexOf('const LEGAL_ACCURACY_BOUNDARY');
    const end = app.indexOf('const REVIEW_EVIDENTIAL_CONTRACT');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return app.slice(start, end);
  })();

  it('is carried by the shared contract, so all three Review prompts inherit it', () => {
    expect(contract).toContain('+ " " + LEGAL_ACCURACY_BOUNDARY');
    expect((app.match(/LEGAL_ACCURACY_BOUNDARY/g) || []).length).toBe(2); // definition + single use
  });

  it('forbids inventing, embellishing or overstating a requirement', () => {
    expect(boundary).toMatch(/do not invent, embellish or overstate a legal or ACAS requirement/);
  });

  it('distinguishes statute / Code requirement / guidance / good practice', () => {
    expect(boundary).toMatch(/a statutory or legal requirement; a requirement of the ACAS Code of Practice; ACAS guidance or recommended practice; and ordinary organisational good practice/);
    expect(boundary).toMatch(/never present one as another/);
  });

  it('requires authoritative grounding before asserting a requirement', () => {
    expect(boundary).toMatch(/only where the authoritative information supplied to you establishes that requirement/);
  });

  it('falls back to cautious guidance plus checking the source when ungrounded', () => {
    expect(boundary).toMatch(/give cautious general procedural guidance and suggest checking the current authoritative source instead/);
    expect(boundary).toMatch(/never manufacture a mandatory rule from memory/);
  });

  it('draft and consultation material is not current law', () => {
    expect(boundary).toMatch(/consultation documents, proposals and draft Codes are not current law and not current statutory requirements/);
    expect(boundary).toMatch(/Never present a draft or consultation version as the Code currently in force/);
  });

  it('specifically forbids the reproduced defect: recording / transcription / notetaker', () => {
    expect(boundary).toMatch(/do NOT say that the ACAS Code requires an appeal hearing to be recorded, requires it to be transcribed, or requires a named notetaker to attend — it requires none of those/);
  });

  it('states the verified position, distinguishing case records from the written appeal outcome', () => {
    expect(boundary).toMatch(/ACAS advises employers to keep appropriate written records of disciplinary and grievance cases/);
    expect(boundary).toMatch(/the appeal result should be confirmed to the employee in writing/);
    expect(boundary).toMatch(/Neither of those is a requirement that the hearing itself be recorded or that a notetaker attends/);
  });

  it('carries a non-runtime maintenance comment tied to the in-force Code', () => {
    const src = app.slice(app.indexOf('// NEW-22 (final)'), app.indexOf('const LEGAL_ACCURACY_BOUNDARY'));
    expect(src).toMatch(/MAINTENANCE/);
    expect(src).toMatch(/verified against\s*\n\/\/ the Code in force/);
    expect(src).toMatch(/consultation on 30 July 2026 and is NOT in\s*\n\/\/ force/);
    expect(src).toMatch(/this wording must be reviewed and updated/);
  });

  it('adds no named case law or statutory citations, and keeps the existing citation ban', () => {
    expect(boundary).not.toMatch(/v\s+[A-Z]\w+|Iceland|section \d+|s\.\d+|1992|1996|2010/);
    expect(contract).toContain('+ NO_INVENTED_AUTHORITIES');
  });
});

describe('C. positive risk rubric', () => {
  const p = promptBlock('UK employment law risk specialist', 6000);

  it('HIGH is positively defined and requires an established serious problem', () => {
    expect(p).toMatch(/HIGH: only where the record actually establishes a serious procedural or legal problem/);
    expect(p).toMatch(/clear and material potential consequence needing urgent HR or legal attention/);
  });

  it('an unresolved serious allegation alone cannot justify HIGH', () => {
    expect(p).toMatch(/A serious allegation that WOULD be significant if substantiated is not enough on its own/);
    expect(p).toMatch(/do not reach for HIGH because an allegation would be serious if it turned out to be true/);
  });

  it('MEDIUM is positively defined', () => {
    expect(p).toMatch(/MEDIUM: where the record establishes a material issue needing HR attention that is not presently established as a serious legal or procedural failure/);
    expect(p).toMatch(/unresolved matters are never treated as proven adverse facts/);
  });

  it('LOW is positively defined', () => {
    expect(p).toMatch(/LOW: where the record does not establish a material procedural or legal problem/);
    expect(p).toMatch(/routine, minor, or simply needs ordinary verification or follow-up/);
  });

  it('the appeal existing alone cannot drive the rating, and LOW is not a default either', () => {
    expect(p).toMatch(/Do not default to LOW merely because matters are unresolved/);
    expect(p).toMatch(/do not default to MEDIUM or HIGH merely because an appeal exists/);
  });

  it('rates the established record, not the worst plausible scenario', () => {
    expect(p).toMatch(/rate the risk the available record ESTABLISHES, never the worst plausible scenario/);
  });

  it('a genuinely established serious failure must still be capable of HIGH', () => {
    expect(p).toMatch(/A genuinely established serious procedural or legal failure must still be rated HIGH/);
  });

  it('HIGH is no longer seeded as the example or default JSON value', () => {
    expect(app).not.toContain('{"rating":"HIGH"');
    expect(p).toContain('{"rating":"<HIGH|MEDIUM|LOW>"');
  });

  it('the JSON contract stays parse-compatible and the parser is unchanged', () => {
    // Placeholder is a plain JSON string value, so the shape the parser sees
    // is identical; the parser itself was not touched.
    expect(JSON.parse('{"rating":"<HIGH|MEDIUM|LOW>","summary":"x"}').rating).toBe('<HIGH|MEDIUM|LOW>');
    expect(app).toContain('setRiskScore({...JSON.parse(text.replace(/```json|```/g,"").trim()), historyContext});');
    expect(app).toContain('setRiskScore({rating:"UNKNOWN",summary:"Could not assess.",flags:[]})');
  });

  it('max_tokens, streaming and org-history separation are unchanged', () => {
    const i = app.indexOf('UK employment law risk specialist');
    expect(app.slice(i - 300, i)).toContain('max_tokens:300');
    expect(app.slice(i - 300, i)).toContain('stream:false');
    expect(p).toContain('keep organisation-wide patterns');
    expect(p).toContain('base-rate context, not this person');
  });
});
