import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileSubjectData } from '../lib/dsarCompile.js';
import { disclosableCase, disclosableMeeting, letterDisclosureStatus } from '../lib/dsarCaseDisclosure.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE 0 — DSAR CASE-MEETING REDACTION.
//
// The defect: the downloadable response package was built from `{ ...case }`, so
// historical formal meetings inside cases.meetings were exported whole —
// including, for 378 of 890 production meetings, the "## HR Advisor Notes"
// section, plus prediction (887), riskScore (52), unresolvedSuggestions (321) and
// reviewDraft.
//
// These tests assert against the ACTUAL SERIALISED PAYLOAD that
// `downloadJson(compiled, …)` writes to disk — not against helper return values.
// A redaction that holds in a helper and leaks in the file is not a redaction.
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
const stripJs = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const compilerSrc = stripJs(read('src/lib/dsarCompile.js'));
const dsarScreen = stripJs(read('src/screens/DsarScreen.jsx'));
const disclosureSrc = read('src/lib/dsarCaseDisclosure.js');

const DANA = 'emp-dana';
const OTHER = 'emp-other-same-name';

// ── §24 representative fixtures, shaped from the real production census ────

// A. historical disciplinary meeting: employee-facing record + HR Advisor Notes
//    + prediction + riskScore.
const disciplinaryMeeting = {
  id: 'm-disc', type: 'Disciplinary', date: '2026-03-02', manager: 'A. Rivera',
  record: '## Meeting Details\nHeld 2 March.\n\n## Meeting Dialogue\nDana explained the delay.\n\n## HR Advisor Notes\nDana may raise a grievance. Consider settlement.',
  transcript: [{ speaker: 'Dana', text: 'I want to explain the delay.' }],
  summary: 'Disciplinary hearing held.',
  prediction: 'Likely to escalate to tribunal.',
  riskScore: { rating: 'HIGH', summary: 'Elevated risk of claim', historyContext: 'two prior warnings' },
  unresolvedSuggestions: [{ kind: 'witness', description: 'Interview the shift lead' }],
  nextSteps: [{ description: 'Chase OH report', done: false }],
  letterOutput: '', letterTracking: {}, signId: null, signStatus: null,
  letterApprovedAt: null, letterApprovedBy: null,
  savedAt: '2026-03-02T17:00:00Z', savedBy: 'A. Rivera',
  signDocument: 'Dear Dana, following our meeting on 2 March…',
  participants: [{ name: 'Dana Keys', role: 'Employee' }, { name: 'A. Rivera', role: 'Chair' }],
};

// B. investigation meeting with transcript and witness references.
const investigationMeeting = {
  id: 'm-inv', type: 'Investigation', date: '2026-02-20', manager: 'A. Rivera',
  record: '## Meeting Dialogue\nPriya Shah was named as a witness.',
  transcript: [{ speaker: 'Dana', text: 'Priya Shah saw what happened.' }],
  prediction: 'Uncertain.', riskScore: null,
  participants: ['Dana Keys', 'A. Rivera'],
  letterOutput: '', letterTracking: {},
};

// C. appeal meeting.
const appealMeeting = {
  id: 'm-appeal', type: 'Disciplinary Appeal', date: '2026-04-10', manager: 'B. Okafor',
  record: '## Meeting Details\nAppeal heard.\n\n## HR Adviser Notes\nChair was briefed separately.',
  transcript: [], chairUserId: 'user-chair', letterOutput: '', letterTracking: {},
};

// D. outcome / letter data — one ISSUED, one draft-only.
const issuedLetterMeeting = {
  id: 'm-issued', type: 'Disciplinary', date: '2026-03-05',
  record: '## Meeting Details\nOutcome delivered.', transcript: [],
  letterOutput: 'Dear Dana, the outcome of the hearing is a first written warning.',
  letterApprovedAt: '2026-03-05T10:00:00Z', letterApprovedBy: 'A. Rivera',
  letterTracking: {}, signStatus: 'signed',
};
const draftLetterMeeting = {
  id: 'm-draft', type: 'Disciplinary', date: '2026-03-06',
  record: '', transcript: [],
  letterOutput: 'DRAFT — proposed dismissal wording for discussion.',
  letterApprovedAt: null, letterApprovedBy: null, letterTracking: {}, signStatus: null,
};

// G. a future internal field nobody has classified yet.
const futureFieldMeeting = {
  id: 'm-future', type: 'Investigation', date: '2026-05-01',
  record: '## Meeting Dialogue\nOrdinary content.', transcript: [],
  letterOutput: '', letterTracking: {},
  compassSentimentAnalysis: 'employee appears hostile',
};

const danaCase = {
  id: 'case-dana', employeeId: DANA, employeeName: 'Dana Keys', email: 'dana@example.com',
  caseType: 'misconduct', description: 'Timekeeping allegations.', dateReceived: '2026-02-18',
  stage: 'closed', outcome: 'First Written Warning', outcomeIssuedAt: '2026-03-05',
  warningDurationMonths: 6, warningExpiresAt: '2026-09-05',
  outcomeNotes: 'HR reasoning: escalate if repeated within six months.',
  investigationReport: 'Report body naming Priya Shah as a witness.',
  appealText: 'I appeal because I was not given a chance to explain.',
  manager: 'A. Rivera', investigatingManager: 'C. Bell', disciplinaryOfficer: 'A. Rivera',
  disciplinaryOfficerId: 'user-rivera', disciplinaryOfficerEmail: 'rivera@employer.example',
  ownerId: 'user-hr', assignedTo: 'user-hr', createdBy: 'user-hr',
  priority: 'high', urgency: 'high', confidential: true, investigationPaused: false,
  nextSteps: [{ description: 'Close case', done: true }],
  timelineOverrides: { stageEnteredAt: { closed: '2026-03-05' } },
  locationId: 'loc-1',
  evidence: [{ id: 'ev1', name: 'rota.pdf', dataUrl: 'data:application/pdf;base64,SECRETBYTES' }],
  createdAt: '2026-02-18', updatedAt: '2026-03-05',
  meetings: [disciplinaryMeeting, investigationMeeting, appealMeeting,
             issuedLetterMeeting, draftLetterMeeting, futureFieldMeeting],
  compassInternalScore: 77,   // G. unknown case-level field
};

// E. same-name employee, a DIFFERENT person.
const otherDanaCase = {
  id: 'case-other', employeeId: OTHER, employeeName: 'Dana Keys',
  caseType: 'grievance', description: 'A different person entirely.',
  meetings: [{ id: 'm-other', type: 'Grievance', date: '2026-01-05',
               record: 'Someone else’s record.', transcript: [], letterOutput: '', letterTracking: {} }],
};

// F. canonical public.meetings row (E2A path).
const canonicalTableMeeting = {
  id: 'm-table', subjectKind: 'employee', employeeId: DANA, employeeName: 'Dana Keys',
  meetingTypeId: 'informal', status: 'completed',
  record: 'What we discussed.\n\n## HR Advisor Notes\nWatch for escalation.',
  transcript: [{ speaker: 'Dana', text: 'my own words' }],
  advisorNotes: 'Internal only.', reviewDraft: { record: 'unfinished' },
  risk: { rating: 'MEDIUM' },
};

const compile = (over = {}) => compileSubjectData('Dana Keys', {
  canonicalEmployeeId: DANA,
  cases: [danaCase, otherDanaCase],
  ...over,
});

// THE ACTUAL DOWNLOAD PAYLOAD — DsarScreen does JSON.stringify(compiled, null, 2).
const download = (over = {}) => JSON.stringify(compile(over), null, 2);

// A withheld field's NAME legitimately appears in the package, inside the
// withheld/unrecognised report — that is the point of reporting it. What must
// never appear is the field as a DATA-CARRYING KEY on a disclosed case or
// meeting. So key-absence is asserted structurally and value-absence on the file.
const disclosedObjects = (out) => {
  const objs = [];
  (out.cases || []).forEach(c => { objs.push(c); (c.meetings || []).forEach(m => objs.push(m)); });
  (out.standaloneMeetings || []).forEach(m => objs.push(m));
  return objs;
};
const expectNoDataKey = (out, key) => {
  disclosedObjects(out).forEach(o => {
    expect(Object.prototype.hasOwnProperty.call(o, key), `${key} on ${o.id}`).toBe(false);
  });
};

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave 0 — the download path is the thing under test', () => {
  it('the screen serialises the WHOLE compiled object, so that is what is asserted', () => {
    // The guarantee: the screen must not FILTER the payload, or the redaction
    // assertions in this file would be testing something the user never
    // receives. It previously asserted the literal `downloadJson(compiled,`.
    // The completion-integrity slice wraps the payload to stamp
    // responseStatus/reviewedBy/reviewedAt onto the artefact, so the call is
    // now `downloadJson({ ...status, ...compiled }, filename)` — which still
    // removes nothing. Asserted as "compiled is spread in whole", paired with
    // the behavioural download tests in
    // src/test/dsarCompletionIntegrity.test.jsx, which parse the emitted blob
    // and assert the real payload rather than the shape of this call.
    expect(dsarScreen).toMatch(/JSON\.stringify\(data, null, 2\)/);
    expect(dsarScreen).toMatch(/\.\.\.compiled,/);
    // and nothing is cherry-picked out of it on the way
    expect(dsarScreen).not.toMatch(/downloadJson\(\{\s*cases:/);
  });

  it('cases are built from the projection, never spread', () => {
    expect(compilerSrc).toMatch(/subjectCases\.map\(disclosableCase\)/);
    // The old shape must not come back.
    expect(compilerSrc).not.toMatch(/subjectCases\.map\(c => \(\{ \.\.\.c/);
    expect(compilerSrc).not.toMatch(/\{ \.\.\.c, evidence:/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave 0 — internal analysis is absent from the downloaded file', () => {
  const file = download();

  it('HR Advisor Notes are not in the package', () => {
    expect(file).not.toContain('may raise a grievance');
    expect(file).not.toContain('Consider settlement');
    expect(file).not.toContain('HR Advisor Notes');
    // The British spelling variant too (fixture C uses "HR Adviser Notes").
    expect(file).not.toContain('Chair was briefed separately');
    expect(file).not.toContain('HR Adviser Notes');
  });

  it('prediction is not in the package', () => {
    expect(file).not.toContain('Likely to escalate to tribunal');
    expectNoDataKey(compile(), 'prediction');
  });

  it('riskScore is not in the package', () => {
    expect(file).not.toContain('Elevated risk of claim');
    expect(file).not.toContain('two prior warnings');
    expectNoDataKey(compile(), 'riskScore');
    expectNoDataKey(compile(), 'risk');
  });

  it('Compass suggestions and internal workflow are not in the package', () => {
    expect(file).not.toContain('Interview the shift lead');
    expect(file).not.toContain('Chase OH report');
    expectNoDataKey(compile(), 'unresolvedSuggestions');
    expectNoDataKey(compile(), 'nextSteps');
  });

  it('internal case triage and flags are not in the package', () => {
    ['priority', 'urgency', 'confidential', 'timelineOverrides', 'investigationPaused',
     'locationId', 'assignedTo', 'createdBy'].forEach(k => expectNoDataKey(compile(), k));
    expect(file).not.toContain('stageEnteredAt');
  });

  it('HR\'s private reasoning and the investigation report are not auto-disclosed', () => {
    expect(file).not.toContain('escalate if repeated within six months');
    expect(file).not.toContain('Report body naming Priya Shah');
    expectNoDataKey(compile(), 'outcomeNotes');
    expectNoDataKey(compile(), 'investigationReport');
  });

  it('...and they are FLAGGED for a decision, not silently dropped', () => {
    // Absence alone is not the guarantee. These are the arguable middle: the
    // reviewer has to be told they exist, or withholding them becomes a silent
    // decision nobody made — which is the same failure as disclosing them.
    const fields = compile().caseDisclosure.reviewRequired.map(r => r.field);
    expect(fields).toContain('outcomeNotes');
    expect(fields).toContain('investigationReport');
  });

  it('third-party contact details and internal ids are not in the package', () => {
    expect(file).not.toContain('rivera@employer.example');
    expect(file).not.toContain('user-rivera');
    ['ownerId', 'disciplinaryOfficerId', 'disciplinaryOfficerEmail'].forEach(k => expectNoDataKey(compile(), k));
  });

  it('evidence file bytes are still never disclosed', () => {
    expect(file).not.toContain('SECRETBYTES');
    // ...but the metadata still is, so the employee knows the document exists.
    expect(file).toContain('rota.pdf');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave 0 — the employee\'s own record is NOT lost', () => {
  const file = download();

  it('the employee-facing part of the meeting record is disclosed', () => {
    expect(file).toContain('Dana explained the delay');
    expect(file).toContain('Held 2 March');
  });

  it('the transcript is disclosed', () => {
    expect(file).toContain('I want to explain the delay');
  });

  it('what was actually sent to them for signature is disclosed', () => {
    expect(file).toContain('following our meeting on 2 March');
  });

  it('the outcome and warning are disclosed', () => {
    expect(file).toContain('First Written Warning');
    expect(file).toContain('2026-09-05');
  });

  it('their own appeal words are disclosed', () => {
    expect(file).toContain('I was not given a chance to explain');
  });

  it('who chaired and who investigated is disclosed, by name', () => {
    expect(file).toContain('A. Rivera');
    expect(file).toContain('C. Bell');
  });

  it('an ISSUED letter is disclosed', () => {
    expect(file).toContain('the outcome of the hearing is a first written warning');
  });

  it('a DRAFT-only letter is not disclosed, and is flagged instead', () => {
    expect(file).not.toContain('proposed dismissal wording');
    const out = compile();
    const flagged = out.caseDisclosure.reviewRequired.filter(r => r.field === 'letterOutput');
    expect(flagged).toHaveLength(1);
    expect(flagged[0].meetingId).toBe('m-draft');
  });

  it('the letter rule follows the product\'s own draft/issued provenance', () => {
    expect(letterDisclosureStatus(issuedLetterMeeting)).toBe('issued');
    expect(letterDisclosureStatus(draftLetterMeeting)).toBe('draft_unconfirmed');
    expect(letterDisclosureStatus({ letterOutput: '' })).toBe('none');
    // letterTracking populated counts as issued even without an approval stamp.
    expect(letterDisclosureStatus({ letterOutput: 'x', letterTracking: { l1: { sentAt: 'y' } } })).toBe('issued');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave 0 — fail closed on anything unrecognised', () => {
  it('an unknown internal MEETING field is withheld and named', () => {
    const file = download();
    expect(file).not.toContain('employee appears hostile');
    const m = disclosableMeeting(futureFieldMeeting);
    expect(m.unrecognisedFieldsWithheld).toContain('compassSentimentAnalysis');
  });

  it('an unknown internal CASE field is withheld and named', () => {
    expectNoDataKey(compile(), 'compassInternalScore');
    const c = disclosableCase(danaCase);
    expect(c.unrecognisedFieldsWithheld).toContain('compassInternalScore');
  });

  it('the reviewer is told, so a new field cannot leak quietly next release', () => {
    const out = compile();
    // EXACT, not arrayContaining: if a classified field silently became
    // "unrecognised" — because someone removed it from its classification list —
    // that is a classification regression and it must fail here.
    expect(out.caseDisclosure.unrecognisedFieldsWithheld)
      .toEqual(['compassInternalScore', 'compassSentimentAnalysis'].sort());
    expect(dsarScreen).toContain('does not recognise');
  });

  it('the design is an allow-list, stated as such', () => {
    expect(disclosureSrc).toMatch(/WHY AN ALLOW-LIST AND NOT A DENY-LIST/);
    // A deny-list would be a spread with deletions.
    expect(stripJs(disclosureSrc)).not.toMatch(/\.\.\.caseObj/);
    expect(stripJs(disclosureSrc)).not.toMatch(/\.\.\.meeting[,}]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave 0 — identity and third parties are unchanged', () => {
  it('the same-named OTHER employee\'s case is excluded entirely', () => {
    const file = download();
    expect(file).not.toContain('A different person entirely');
    expect(file).not.toContain('Someone else');
    const out = compile();
    expect(out.cases.map(c => c.id)).toEqual(['case-dana']);
  });

  it('third-party mentions are still surfaced for human review', () => {
    // The scanner recognises OTHER PEOPLE from the roster, so the roster has to
    // contain Priya for her to be recognisable as a third party at all.
    const out = compile({ employeeRecords: [
      { id: DANA, name: 'Dana Keys' }, { id: 'emp-priya', name: 'Priya Shah' },
    ] });
    // Priya Shah is named inside Dana's own meeting content.
    expect(JSON.stringify(out.flaggedThirdPartyMentions)).toContain('Priya Shah');
  });

  it('attendee names are disclosed, contact details are not', () => {
    const m = disclosableMeeting(disciplinaryMeeting);
    expect(m.participants).toEqual(['Dana Keys', 'A. Rivera']);
    expect(JSON.stringify(m)).not.toContain('role');
  });

  it('canonical table meetings keep their E2A treatment', () => {
    const out = compileSubjectData('Dana Keys', {
      canonicalEmployeeId: DANA, standaloneMeetings: [canonicalTableMeeting],
    });
    const file = JSON.stringify(out);
    expect(file).toContain('my own words');
    expect(file).toContain('What we discussed');
    expect(file).not.toContain('Watch for escalation');
    expect(file).not.toContain('Internal only');
    expect(file).not.toContain('unfinished');
  });

  it('BOTH formats use ONE internal vocabulary', () => {
    // The same content must be internal regardless of which store it lives in.
    expect(compilerSrc).toContain('MEETING_WITHHELD_INTERNAL');
    const tableOut = compileSubjectData('Dana Keys', {
      canonicalEmployeeId: DANA, standaloneMeetings: [canonicalTableMeeting],
    });
    expect(tableOut.standaloneMeetings[0].withheldAsInternalAnalysis)
      .toContain('record.hrAdvisorNotes');
    expect(disclosableMeeting(disciplinaryMeeting).withheldAsInternalAnalysis)
      .toContain('record.hrAdvisorNotes');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave 0 — the reviewer is told, and Compass claims no legal authority', () => {
  it('withheld internal analysis is reported', () => {
    const out = compile();
    expect(out.caseDisclosure.internalFieldsWithheld).toEqual(
      expect.arrayContaining(['prediction', 'riskScore', 'record.hrAdvisorNotes', 'unresolvedSuggestions'])
    );
    expect(out.caseDisclosure.meetingsWithWithheldContent).toBeGreaterThan(0);
  });

  it('the screen explains what was held back and asks the human to check', () => {
    expect(dsarScreen).toContain("Compass's own analysis has been held back");
    expect(dsarScreen).toContain('need');
    expect(dsarScreen).toContain('your decision');
  });

  it('no copy claims Compass decides what the law requires', () => {
    const claims = [
      /Compass determines what the law/i,
      /legally required to disclose/i,
      /this is all you must disclose/i,
      /GDPR compliant/i,
    ];
    claims.forEach(c => expect(dsarScreen, String(c)).not.toMatch(c));
    expect(disclosureSrc).toMatch(/It does not decide what the law requires/);
  });

  it('no source data is mutated by the projection', () => {
    // A FRESH clone on purpose. The shared fixture has already been through
    // compile() several times above, so asserting before/after on it would
    // compare a already-mutated object with itself and pass for the wrong reason.
    const fresh = JSON.parse(JSON.stringify(danaCase));
    const before = JSON.stringify(fresh);
    disclosableCase(fresh);
    disclosableMeeting(fresh.meetings[0]);
    expect(JSON.stringify(fresh)).toBe(before);
    // Every internal field the projection withholds is still THERE on the source.
    expect(fresh.priority).toBe('high');
    expect(fresh.meetings[0].prediction).toBe('Likely to escalate to tribunal.');
    expect(fresh.meetings[0].record).toContain('HR Advisor Notes');
  });
});
