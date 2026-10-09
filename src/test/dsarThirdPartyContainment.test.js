import { describe, it, expect } from 'vitest';
import { compileSubjectData } from '../lib/dsarCompile.js';
import {
  DISCLOSURE_BASIS,
  disclosableStaffRoleCase, disclosableStaffRoleWellbeingNote,
  disclosableStaffRoleHrReview, disclosableOwnHrReview,
  disclosableRedundancyCase, summariseThirdPartyContainment,
} from '../lib/dsarThirdPartyContainment.js';

// ═══════════════════════════════════════════════════════════════════════════
// A DSAR IS NOT A SEARCH WARRANT — adversarial containment tests.
//
// THE DEFECT. `actedAsStaff` stripped only `evidence` and emitted the rest of
// the matched case. `meetings` survived — the whole JSONB array with every
// unsplit `record` (so `## HR Advisor Notes` included), `transcript`,
// `letterOutput`, `signature`, `riskScore`, `reviewDraft` — alongside the other
// employee's name, email, `description`, `outcome`, `outcomeNotes` and
// `investigationReport`. It bypassed `disclosableCase` entirely. A manager's own
// DSAR returned the complete case files of everyone they had managed, and the
// screen told the reviewer they were "included in the download below".
//
// THESE TESTS ARE WRITTEN FROM THE ATTACKER'S SIDE. The subject is a manager
// filing their own DSAR in order to read their reports' case files. Every test
// asserts BOTH halves of the fix:
//   * the record is still FOUND and the subject's own data still disclosed
//     (suppressing it would be the opposite error, and is not the fix); and
//   * the other person's record does not travel.
// ═══════════════════════════════════════════════════════════════════════════

// ── The adversarial fixture ────────────────────────────────────────────────
//
// Dana is the requester. Priya is Dana's report. Dana wants Priya's file.
const PRIYA_CASE = {
  id: 'case-priya', employeeName: 'Priya Shah', email: 'priya@acme.test',
  employeeId: 'emp-priya', caseType: 'Misconduct', stage: 'investigation',
  dateReceived: '2026-05-01', createdAt: '2026-05-01T00:00:00Z',
  // Dana is recorded as the investigating manager — this is why the row matches
  investigatingManager: 'Dana Director',
  description: 'Priya is alleged to have falsified an expense claim.',
  outcome: 'Final written warning',
  outcomeNotes: 'HR view: weak evidence but Priya admitted it, settle at FWW.',
  investigationReport: 'INVESTIGATION REPORT: Priya Shah. Witness A states...',
  appealText: 'I appeal because the process was unfair. — Priya',
  meetings: [{
    id: 'm1', type: 'disciplinary', date: '2026-05-10',
    record: 'Priya said she was under pressure.\n\n## HR Advisor Notes\nTribunal risk high. Settle.',
    transcript: [{ speaker: 'Priya', text: 'I did not read the policy.' }],
    letterOutput: 'Dear Priya, following your hearing...',
    signature: 'data:image/png;base64,PRIYASIG',
    riskScore: { rating: 'high', summary: 'Likely tribunal' },
    reviewDraft: { recordOriginal: 'draft about Priya' },
    prediction: 'Priya will appeal',
  }],
  evidence: [{ id: 'ev1', name: 'expenses.pdf', record: 'Full expense detail for Priya' }],
  ohProcess: { consentObtained: true, recommendations: 'Priya: phased return' },
  confidential: true,
};

const baseData = {
  employeeRecords: [
    { id: 'emp-dana', name: 'Dana Director', jobTitle: 'Director' },
    { id: 'emp-priya', name: 'Priya Shah', jobTitle: 'Analyst', manager: 'Dana Director' },
  ],
  cases: [PRIYA_CASE],
};

/** Withheld entries are {field, basis, reason}; this pulls the field names. */
const fields = (withheld = []) => withheld.map(w => (typeof w === 'string' ? w : w.field));

/** Everything in Priya's file that must never reach Dana's package. */
const PRIYA_SECRETS = [
  'falsified an expense claim',
  'weak evidence but Priya admitted it',
  'INVESTIGATION REPORT',
  'Witness A states',
  'under pressure',
  'HR Advisor Notes',
  'Tribunal risk high',
  'I did not read the policy',
  'Dear Priya, following your hearing',
  'PRIYASIG',
  'Likely tribunal',
  'draft about Priya',
  'Priya will appeal',
  'Full expense detail',
  'phased return',
  'I appeal because the process was unfair',
];

describe('ADVERSARIAL — a manager cannot read their report\'s case file through their own DSAR', () => {
  it('still RECORDS that the subject was the investigating manager (not suppressed)', () => {
    const r = compileSubjectData('Dana Director', baseData);
    expect(r.actedAsStaff.cases).toHaveLength(1);
    expect(r.actedAsStaff.cases[0].id).toBe('case-priya');
    expect(r.actedAsStaff.cases[0].rolesHeld).toEqual(['investigatingManager']);
    expect(r.actedAsStaff.cases[0].caseType).toBe('Misconduct');
    expect(r.actedAsStaff.cases[0].dateReceived).toBe('2026-05-01');
  });

  it('discloses NONE of the other employee\'s case content, field by field', () => {
    const r = compileSubjectData('Dana Director', baseData);
    const asText = JSON.stringify(r.actedAsStaff);
    for (const secret of PRIYA_SECRETS) {
      expect(asText, `leaked: ${secret}`).not.toContain(secret);
    }
  });

  it('leaks nothing through the WHOLE package, not just the actedAsStaff branch', () => {
    // The adversarial version of the above: a projection that fixed one key and
    // left the raw row reachable under another would pass the test above.
    const r = compileSubjectData('Dana Director', baseData);
    const whole = JSON.stringify(r);
    for (const secret of PRIYA_SECRETS) {
      expect(whole, `leaked somewhere in the package: ${secret}`).not.toContain(secret);
    }
  });

  it('does not carry the meetings array at all', () => {
    const r = compileSubjectData('Dana Director', baseData);
    expect(r.actedAsStaff.cases[0]).not.toHaveProperty('meetings');
    expect(r.actedAsStaff.cases[0]).not.toHaveProperty('evidence');
    expect(r.actedAsStaff.cases[0]).not.toHaveProperty('outcomeNotes');
    expect(r.actedAsStaff.cases[0]).not.toHaveProperty('investigationReport');
  });

  it('reports what it withheld, with a basis and a reason on every item', () => {
    const r = compileSubjectData('Dana Director', baseData);
    const withheld = r.actedAsStaff.cases[0].withheldAsThirdPartyData;
    for (const f of ['evidence', 'outcomeNotes', 'investigationReport', 'description', 'outcome', 'appealText', 'ohProcess']) {
      expect(fields(withheld), `${f} should be reported as withheld`).toContain(f);
    }
    // not a bare name list: each item carries why it was held back
    for (const w of withheld) {
      expect(w.basis).toBe(DISCLOSURE_BASIS.THIRD_PARTY);
      expect(w.reason).toMatch(/Art 15\(4\)/);
      expect(w.reason).toMatch(/not withheld permanently/i);
    }
  });

  it('treats MIXED meeting records as review-required, NOT as third-party suppression', () => {
    // The over-suppression risk: a meeting on a case the requester investigated
    // records THEIR words and conduct too. Withholding the array outright would
    // suppress the requester's own personal data.
    const r = compileSubjectData('Dana Director', baseData);
    const c = r.actedAsStaff.cases[0];
    expect(fields(c.withheldAsThirdPartyData)).not.toContain('meetings');
    const mixed = c.reviewRequired.find(x => x.field === 'meetings');
    expect(mixed).toBeTruthy();
    expect(mixed.basis).toBe(DISCLOSURE_BASIS.REVIEW_REQUIRED);
    expect(mixed.reason).toMatch(/MIXED personal data/);
    expect(mixed.reason).toMatch(/release the requester's own contribution/);
  });

  it('names the source records so the HR Director can retrieve them', () => {
    const r = compileSubjectData('Dana Director', baseData);
    const c = r.actedAsStaff.cases[0];
    expect(c.sourceRecords).toEqual([{
      kind: 'meeting', meetingId: 'm1', meetingType: 'disciplinary',
      date: '2026-05-10', hasRecord: true, hasTranscript: true,
    }]);
    // identifiable, but still carrying none of the content
    expect(JSON.stringify(c.sourceRecords)).not.toContain('HR Advisor Notes');
    expect(JSON.stringify(c.sourceRecords)).not.toContain('under pressure');
  });

  it('flags the other employee\'s identity for a human rather than disclosing or dropping it', () => {
    const r = compileSubjectData('Dana Director', baseData);
    const flagged = r.actedAsStaff.cases[0].reviewRequired.map(x => x.field);
    expect(flagged).toContain('employeeName');
    expect(JSON.stringify(r.actedAsStaff.cases)).not.toContain('Priya Shah');
  });

  it('records every role the subject held, where they held more than one', () => {
    const data = { ...baseData, cases: [{ ...PRIYA_CASE, manager: 'Dana Director', disciplinaryOfficer: 'Dana Director' }] };
    const r = compileSubjectData('Dana Director', data);
    expect(r.actedAsStaff.cases[0].rolesHeld).toEqual(['disciplinaryOfficer', 'investigatingManager', 'manager']);
  });

  it('fails CLOSED on a field nobody has classified', () => {
    const data = { ...baseData, cases: [{ ...PRIYA_CASE, someFutureColumn: 'Priya secret' }] };
    const r = compileSubjectData('Dana Director', data);
    expect(r.actedAsStaff.cases[0].unrecognisedFieldsWithheld).toContain('someFutureColumn');
    expect(JSON.stringify(r)).not.toContain('Priya secret');
  });

  it('does NOT touch the subject\'s own case, which must still disclose in full', () => {
    // The containment must not bleed into legitimate subject data.
    const own = {
      id: 'case-dana', employeeName: 'Dana Director', employeeEmail: 'dana@acme.test',
      caseType: 'Grievance', stage: 'investigation', meetings: [], evidence: [],
      description: 'Dana raised a grievance about workload.',
    };
    const r = compileSubjectData('Dana Director', { ...baseData, cases: [own, PRIYA_CASE] });
    expect(r.cases).toHaveLength(1);
    expect(r.cases[0].id).toBe('case-dana');
    expect(r.cases[0].description).toBe('Dana raised a grievance about workload.');
    expect(r.actedAsStaff.cases).toHaveLength(1);
  });
});

describe('ADVERSARIAL — another employee\'s wellbeing note', () => {
  const note = {
    id: 'w1', employeeName: 'Priya Shah', employeeId: 'emp-priya',
    manager: 'Dana Director', date: '2026-04-02',
    content: 'Priya disclosed a diagnosis of depression and is on medication.',
    category: 'mental health',
  };

  it('records the fact, and withholds the health content', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, wellbeingNotes: [note] });
    expect(r.actedAsStaff.wellbeingNotes).toHaveLength(1);
    expect(r.actedAsStaff.wellbeingNotes[0].date).toBe('2026-04-02');
    expect(r.actedAsStaff.wellbeingNotes[0].recordedAs).toBe('manager');
    const asText = JSON.stringify(r);
    expect(asText).not.toContain('diagnosis of depression');
    expect(asText).not.toContain('mental health');
    expect(asText).not.toContain('Priya Shah');
  });

  it('gives the reviewer a ROUTE to it rather than a dead end', () => {
    // Revised: the first cut returned reviewRequired: [], making this the one
    // source with no path to release. A note naming the requester as manager may
    // also record the requester's own management actions.
    const out = disclosableStaffRoleWellbeingNote(note);
    expect(fields(out.withheldAsThirdPartyData)).toContain('content');
    const review = out.reviewRequired.find(x => x.field === 'content');
    expect(review).toBeTruthy();
    expect(review.basis).toBe(DISCLOSURE_BASIS.REVIEW_REQUIRED);
    expect(review.reason).toMatch(/requester's own management actions/);
    expect(review.sourceRecords[0]).toEqual({ kind: 'wellbeingNote', noteId: 'w1', date: '2026-04-02' });
    // and the content itself still does not travel
    expect(JSON.stringify(out)).not.toContain('diagnosis of depression');
  });

  it('still returns the subject\'s OWN wellbeing note in full', () => {
    const mine = { id: 'w2', employeeName: 'Dana Director', manager: 'Someone Else', content: 'Dana reported stress.' };
    const r = compileSubjectData('Dana Director', { ...baseData, wellbeingNotes: [note, mine] });
    expect(r.wellbeingNotes).toHaveLength(1);
    expect(r.wellbeingNotes[0].content).toBe('Dana reported stress.');
  });
});

describe('ADVERSARIAL — HR review requests, role-dependent', () => {
  const asRequester = {
    id: 'h1', case_id: 'case-priya', status: 'pending', requested_by_name: 'Dana Director',
    reviewed_by_name: 'Grace Hopper',
    record_snapshot: 'Priya said X.\n\n## HR Advisor Notes\ninternal',
    comments: 'Grace: the record understates the admission.',
  };

  it('withholds the reviewer\'s comments when the subject only REQUESTED the review', () => {
    const out = disclosableStaffRoleHrReview(asRequester, { asReviewer: false });
    expect(out.recordedAs).toBe('requester');
    expect(fields(out.withheldAsThirdPartyData)).toContain('comments');
    expect(fields(out.withheldAsThirdPartyData)).toContain('record_snapshot');
    expect(JSON.stringify(out)).not.toContain('understates the admission');
    expect(JSON.stringify(out)).not.toContain('Priya said X');
  });

  it('flags the subject\'s OWN comments for review when they WROTE them', () => {
    const out = disclosableStaffRoleHrReview({ ...asRequester, comments: 'Dana: I disagree with the finding.' }, { asReviewer: true });
    expect(out.recordedAs).toBe('reviewer');
    expect(out.reviewRequired.map(x => x.field)).toContain('comments');
    expect(fields(out.withheldAsThirdPartyData)).not.toContain('comments');
    // still not auto-released into the payload
    expect(JSON.stringify(out)).not.toContain('I disagree with the finding');
  });

  it('withholds the snapshot in BOTH roles — it is a record about the other employee', () => {
    for (const asReviewer of [true, false]) {
      const out = disclosableStaffRoleHrReview(asRequester, { asReviewer });
      expect(fields(out.withheldAsThirdPartyData)).toContain('record_snapshot');
    }
  });
});

describe('ADVERSARIAL — the redundancy pool', () => {
  const pool = {
    id: 'rc1', type: 'collective', status: 'open',
    reason: 'Site closure', poolDescription: 'All analysts at the Leeds site',
    selectionCriteria: [{ id: 'c1', label: 'Performance' }],
    aiAdvice: 'Advise employer to weight performance to retain Grace.',
    atRiskEmployees: [
      { id: 'e1', name: 'Dana Director', score: 42, selected: false, redundancyPay: '4200' },
      { id: 'e2', name: 'Grace Hopper', score: 51, selected: true, redundancyPay: '9100' },
      { id: 'e3', name: 'Priya Shah', score: 18, selected: true, redundancyPay: '2200' },
    ],
  };

  it('discloses the subject\'s own entry IN FULL — derived data about them is theirs', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, redundancyCases: [pool] });
    expect(r.redundancyCases).toHaveLength(1);
    expect(r.redundancyCases[0].ownAtRiskEntry).toEqual({
      id: 'e1', name: 'Dana Director', score: 42, selected: false, redundancyPay: '4200',
    });
  });

  it('answers "one of how many" without naming the others', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, redundancyCases: [pool] });
    expect(r.redundancyCases[0].poolSize).toBe(3);
    const asText = JSON.stringify(r);
    expect(asText).not.toContain('Grace Hopper');
    expect(asText).not.toContain('Priya Shah');
    expect(asText).not.toContain('9100');
    expect(asText).not.toContain('2200');
    expect(asText).not.toContain('"score":51');
    expect(asText).not.toContain('"score":18');
  });

  it('withholds the employer\'s AI advice under a RECORDED justification', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, redundancyCases: [pool] });
    expect(JSON.stringify(r)).not.toContain('weight performance to retain');
    const w = r.redundancyCases[0].withheldAsThirdPartyData.find(x => x.field === 'aiAdvice');
    expect(w).toBeTruthy();
    // not third-party data — advice to the employer about a process
    expect(w.basis).toBe(DISCLOSURE_BASIS.LEGAL_WITHHELD);
    expect(w.reason).toMatch(/advice to the EMPLOYER/i);
    // and it reaches the reviewer's legally-withheld list by name
    expect(r.thirdPartyContainment.legallyWithheld.map(x => x.field)).toContain('aiAdvice');
  });

  it('states how many other employees were held back, not just that some were', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, redundancyCases: [pool] });
    const w = r.redundancyCases[0].withheldAsThirdPartyData.find(x => x.field === 'atRiskEmployees.otherEmployees');
    expect(w.reason).toMatch(/^2 other pooled employee\(s\)/);
  });

  it('review-flags the process description rather than dropping it', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, redundancyCases: [pool] });
    const flagged = r.redundancyCases[0].reviewRequired.map(x => x.field);
    expect(flagged).toEqual(expect.arrayContaining(['reason', 'poolDescription', 'selectionCriteria']));
  });

  it('matches the subject\'s entry case-insensitively, so a whitespace variant is not silently dropped', () => {
    const out = disclosableRedundancyCase(pool, { employeeName: '  dana director ' });
    expect(out.ownAtRiskEntry.id).toBe('e1');
  });

  it('fails closed on an unclassified pool column', () => {
    const out = disclosableRedundancyCase({ ...pool, secretColumn: 'x' }, { employeeName: 'Dana Director' });
    expect(out.unrecognisedFieldsWithheld).toContain('secretColumn');
  });
});

describe('ADVERSARIAL — evidence text on the subject\'s OWN case', () => {
  const ownCase = {
    id: 'case-dana', employeeName: 'Dana Director', employeeEmail: 'dana@acme.test',
    caseType: 'Grievance', meetings: [],
    evidence: [{
      id: 'ev9', name: 'Witness: Priya Shah (2026-05-02)', type: 'Witness statement',
      date: '2026-05-02', size: 2048,
      record: 'Priya Shah says: I saw Dana shouting, and I was frightened.',
      dataUrl: 'data:text/plain;base64,SECRETBYTES',
    }],
  };

  it('keeps the metadata, and no longer auto-discloses the statement text', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, cases: [ownCase] });
    const ev = r.cases[0].evidence[0];
    expect(ev.name).toBe('Witness: Priya Shah (2026-05-02)');
    expect(ev.recordRequiresReview).toBe(true);
    expect(ev).not.toHaveProperty('record');
    expect(ev).not.toHaveProperty('dataUrl');
    expect(JSON.stringify(r.cases)).not.toContain('I saw Dana shouting');
    expect(JSON.stringify(r)).not.toContain('SECRETBYTES');
  });

  it('raises a reviewer line naming the evidence item, so it can be released deliberately', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, cases: [ownCase] });
    const flagged = (r.caseDisclosure.reviewRequired || []).filter(x => x.field === 'evidence.record');
    expect(flagged).toHaveLength(1);
    expect(flagged[0].evidenceName).toBe('Witness: Priya Shah (2026-05-02)');
  });

  it('SCANS the statement text for third parties, which it previously did not', () => {
    const r = compileSubjectData('Dana Director', { ...baseData, cases: [ownCase] });
    const hit = (r.flaggedThirdPartyMentions || []).find(m => m.field === 'evidence.record');
    expect(hit).toBeTruthy();
    expect(hit.mentionedName).toBe('Priya Shah');
    expect(hit.caseId).toBe('case-dana');
    expect(hit.evidenceId).toBe('ev9');
  });
});

describe('the containment decisions reach the reviewer', () => {
  it('rolls every source up into one reviewRequired list', () => {
    const summary = summariseThirdPartyContainment({
      staffRoleCases: [disclosableStaffRoleCase(PRIYA_CASE, { rolesHeld: ['manager'] })],
      redundancyCases: [disclosableRedundancyCase({ id: 'rc1', reason: 'Site closure', atRiskEmployees: [] }, { employeeName: 'Dana Director' })],
    });
    expect(summary.reviewRequired.length).toBeGreaterThan(0);
    expect(summary.reviewRequired.every(r => typeof r.source === 'string' && typeof r.reason === 'string')).toBe(true);
    expect(summary.thirdPartyFieldsWithheld.some(f => f.startsWith('actedAsStaff.cases.'))).toBe(true);
  });

  it('is emitted by the compiler so the screen can merge it', () => {
    const r = compileSubjectData('Dana Director', baseData);
    expect(r.thirdPartyContainment).toBeTruthy();
    expect(Array.isArray(r.thirdPartyContainment.reviewRequired)).toBe(true);
    expect(r.thirdPartyContainment.thirdPartyFieldsWithheld.length).toBeGreaterThan(0);
  });

  it('survives malformed input without throwing', () => {
    for (const bad of [null, undefined, 'nonsense', 42]) {
      expect(disclosableStaffRoleCase(bad)).toBeNull();
      expect(disclosableStaffRoleWellbeingNote(bad)).toBeNull();
      expect(disclosableStaffRoleHrReview(bad)).toBeNull();
      expect(disclosableOwnHrReview(bad)).toBeNull();
      expect(disclosableRedundancyCase(bad)).toBeNull();
    }
    expect(summariseThirdPartyContainment()).toBeTruthy();
    expect(summariseThirdPartyContainment({}).reviewRequired).toEqual([]);
  });
});
