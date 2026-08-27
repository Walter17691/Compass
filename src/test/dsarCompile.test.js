import { describe, it, expect } from 'vitest';
import { compileSubjectData } from '../lib/dsarCompile.js';

const baseData = {
  employeeRecords: [
    { name: 'Ada Lovelace', jobTitle: 'Engineer', startDate: '01/01/2020', location: 'London' },
    { name: 'Grace Hopper', jobTitle: 'Manager', startDate: '01/01/2015', location: 'London' },
  ],
  cases: [
    {
      id: 'c1',
      employeeName: 'Ada Lovelace',
      caseType: 'Grievance',
      meetings: [
        { id: 'm1', type: 'Investigation', date: '2026-01-01', record: 'Ada raised a concern about Grace Hopper being unfair.', transcript: [{ speaker: 'HR', text: 'Can you tell me more about Grace Hopper?' }] },
      ],
    },
    {
      id: 'c2',
      employeeName: 'Grace Hopper',
      caseType: 'Misconduct',
      meetings: [{ id: 'm2', type: 'Investigation', date: '2026-02-01', record: 'Unrelated to Ada.' }],
    },
  ],
  starterInstances: [{ id: 's1', name: 'Ada Lovelace', tasks: [] }],
};

describe('compileSubjectData', () => {
  it('includes only the named subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0].id).toBe('c1');
  });

  it('includes the subject\'s employee record and onboarding data', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.employeeRecord.jobTitle).toBe('Engineer');
    expect(result.onboarding).toHaveLength(1);
  });

  it('returns null employeeRecord and empty arrays for an unknown person', () => {
    const result = compileSubjectData('Nobody Here', baseData);
    expect(result.employeeRecord).toBeNull();
    expect(result.cases).toHaveLength(0);
    expect(result.onboarding).toHaveLength(0);
  });

  it('flags third-party name mentions in meeting record text', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    const recordFlags = result.flaggedThirdPartyMentions.filter(f => f.field === 'record');
    expect(recordFlags).toHaveLength(1);
    expect(recordFlags[0].mentionedName).toBe('Grace Hopper');
  });

  it('flags third-party name mentions inside transcript utterances', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    const transcriptFlags = result.flaggedThirdPartyMentions.filter(f => f.field.startsWith('transcript'));
    expect(transcriptFlags).toHaveLength(1);
    expect(transcriptFlags[0].mentionedName).toBe('Grace Hopper');
  });

  it('does not flag the subject\'s own name', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.flaggedThirdPartyMentions.some(f => f.mentionedName === 'Ada Lovelace')).toBe(false);
  });
});

// Phase 6.5 hardening (Batch 5) — a DSAR response must cover everything
// Compass holds about the named individual, not just what's embedded on
// the case object. These sources live in their own state/tables and were
// previously omitted from the export entirely.
describe('compileSubjectData — additional data sources (Phase 6.5, Batch 5)', () => {
  const extendedData = {
    ...baseData,
    wellbeingNotes: [
      { id: 'w1', employeeName: 'Ada Lovelace', content: 'Ada mentioned feeling unsupported by Grace Hopper.' },
      { id: 'w2', employeeName: 'Grace Hopper', content: 'Unrelated note about Grace.' },
    ],
    concernReferrals: [
      { id: 'r1', employeeName: 'Ada Lovelace', description: 'Concern raised about workload.', witnesses: 'Saw Grace Hopper involved too.' },
      { id: 'r2', employeeName: 'Grace Hopper', description: 'Unrelated referral.' },
    ],
    allegations: [
      { id: 'a1', caseId: 'c1', title: 'Unfair treatment', peopleInvolved: 'Grace Hopper was also present.' },
      { id: 'a2', caseId: 'c2', title: 'Unrelated allegation' },
    ],
    caseSignals: [
      { id: 'sig1', caseId: 'c1', title: 'Guardrail flag on c1' },
      { id: 'sig2', caseId: 'c2', title: 'Guardrail flag on c2' },
    ],
    hrReviewRequests: [
      { id: 'hr1', case_id: 'c1', status: 'approved' },
      { id: 'hr2', case_id: 'c2', status: 'approved' },
    ],
    auditLog: [
      { id: 'log1', caseId: 'c1', action: 'Case opened' },
      { id: 'log2', caseId: 'c2', action: 'Unrelated case action' },
      { id: 'log3', caseId: null, action: 'Org-level action, not case-linked', detail: 'Someone Else' },
      { id: 'log4', caseId: null, action: 'Employee record updated', detail: 'Ada Lovelace' },
    ],
  };

  it('includes only the subject\'s own wellbeing notes', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.wellbeingNotes).toEqual([extendedData.wellbeingNotes[0]]);
  });

  it('includes only the subject\'s own concern referrals', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.concernReferrals).toEqual([extendedData.concernReferrals[0]]);
  });

  it('includes only allegations on the subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.allegations).toEqual([extendedData.allegations[0]]);
  });

  it('includes only case signals on the subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.caseSignals).toEqual([extendedData.caseSignals[0]]);
  });

  it('includes only HR review requests on the subject\'s own cases, matching the raw case_id shape', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.hrReviewRequests).toEqual([extendedData.hrReviewRequests[0]]);
  });

  // Phase 6.5 hardening (Prompt 14, Section 6 — closes independent audit
  // finding 4.4) — was "excluding org-level entries with no case link",
  // asserting the exact bug: a case-less audit entry whose detail is
  // literally the subject's own name (employee record edits, onboarding/
  // offboarding, portal access — audit(action, employeeName), no case in
  // scope) was silently dropped from every DSAR export.
  it('includes case-linked audit entries, plus case-less entries whose detail is exactly the subject\'s name — excluding both an unrelated case and an unrelated name', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.auditLog).toEqual([extendedData.auditLog[0], extendedData.auditLog[3]]);
  });

  it('flags a third-party name mentioned in a wellbeing note', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'wellbeingNote.content' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('flags a third-party name mentioned in a concern referral', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'concernReferral.witnesses' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('flags a third-party name mentioned in an allegation field', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'allegation.peopleInvolved' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('defaults every new source to an empty array when omitted, matching the original call shape', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.wellbeingNotes).toEqual([]);
    expect(result.concernReferrals).toEqual([]);
    expect(result.allegations).toEqual([]);
    expect(result.caseSignals).toEqual([]);
    expect(result.hrReviewRequests).toEqual([]);
    expect(result.auditLog).toEqual([]);
  });
});

// Phase 6.5 hardening (data-lifecycle review) — caseTasks (the "tasks"
// category the wider data-inventory review names explicitly) and
// signingRequests/portalAccounts (the two categories with zero
// client-facing RLS — passed in already-fetched from
// api/portal/_dsar-lookup.js, since this module has no way to query them
// itself).
describe('compileSubjectData — tasks, signing requests and portal access (Phase 6.5)', () => {
  const extendedData = {
    ...baseData,
    caseTasks: [
      { id: 't1', caseId: 'c1', name: 'Interview Ada' },
      { id: 't2', caseId: 'c2', name: 'Unrelated task' },
    ],
    signingRequests: [
      { sign_id: 'sr1', employee_name: 'Ada Lovelace', document: 'Investigation record — mentions Grace Hopper as chair.', status: 'signed' },
      { sign_id: 'sr2', employee_name: 'Grace Hopper', document: 'Unrelated document', status: 'sent' },
    ],
    portalAccounts: [
      { id: 'pa1', employee_name: 'Ada Lovelace', employee_email: 'ada@example.com' },
      { id: 'pa2', employee_name: 'Grace Hopper', employee_email: 'grace@example.com' },
    ],
  };

  it('includes only tasks on the subject\'s own cases', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.caseTasks).toEqual([extendedData.caseTasks[0]]);
  });

  it('includes only the subject\'s own signing requests, matched by employee_name', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.signingRequests).toEqual([extendedData.signingRequests[0]]);
  });

  it('flags a third-party name mentioned inside a signing request\'s document text', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.flaggedThirdPartyMentions.some(f => f.field === 'signingRequest.document' && f.mentionedName === 'Grace Hopper')).toBe(true);
  });

  it('includes only the subject\'s own portal account', () => {
    const result = compileSubjectData('Ada Lovelace', extendedData);
    expect(result.portalAccounts).toEqual([extendedData.portalAccounts[0]]);
  });

  it('defaults tasks/signingRequests/portalAccounts to empty arrays when omitted', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.caseTasks).toEqual([]);
    expect(result.signingRequests).toEqual([]);
    expect(result.portalAccounts).toEqual([]);
  });
});

// Phase 6.5 hardening (data-lifecycle review) — a name is not a stable
// identity. The task's own required scenario: a DSAR for Employee A must
// not include Employee B merely because they share a similar name.
describe('compileSubjectData — same-name collision detection (Phase 6.5)', () => {
  it('does not flag a collision for an ordinary, unambiguous subject', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.possibleNameCollision).toBe(false);
  });

  it('flags a collision when two employee_records rows share the exact same name', () => {
    const data = {
      ...baseData,
      employeeRecords: [
        { name: 'Sam Employee', jobTitle: 'Engineer', location: 'London' },
        { name: 'Sam Employee', jobTitle: 'Sales', location: 'Manchester' },
      ],
    };
    const result = compileSubjectData('Sam Employee', data);
    expect(result.possibleNameCollision).toBe(true);
  });

  it('flags a collision when the subject\'s own cases carry more than one distinct employee_email', () => {
    const data = {
      ...baseData,
      cases: [
        { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam.london@acme.com', meetings: [] },
        { id: 'c2', employeeName: 'Sam Employee', employeeEmail: 'sam.manchester@acme.com', meetings: [] },
      ],
    };
    const result = compileSubjectData('Sam Employee', data);
    expect(result.possibleNameCollision).toBe(true);
    // Both cases are still included — the flag is a warning for HR to
    // investigate before relying on the export, not a silent exclusion.
    expect(result.cases).toHaveLength(2);
  });

  it('does not flag a collision when cases share the same email, or have no email on file at all', () => {
    const data = {
      ...baseData,
      cases: [
        { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com', meetings: [] },
        { id: 'c2', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com', meetings: [] },
        { id: 'c3', employeeName: 'Sam Employee', meetings: [] },
      ],
    };
    const result = compileSubjectData('Sam Employee', data);
    expect(result.possibleNameCollision).toBe(false);
  });
});

// Phase 6.5 hardening (Prompt 14, Section 6 continued — closes
// independent audit finding 4.3). The audit's own framing: the compiler
// only ever covered "employee who is the subject of a case" — never a
// DSAR about a person who is also (or only) a Compass user, or who acts
// as a manager/investigator/officer/reviewer on someone ELSE's case.
describe('compileSubjectData — internal-user tables and staff-role columns (Phase 6.5, closes finding 4.3)', () => {
  const staffData = {
    ...baseData,
    dsarRequests: [
      { id: 'd1', employeeName: 'Ada Lovelace', status: 'completed' },
      { id: 'd2', employeeName: 'Grace Hopper', status: 'received' },
    ],
    orgMembers: [
      { id: 'om1', user_id: 'u-ada', org_id: 'org-1', name: 'Ada Lovelace', role: 'line_manager' },
      { id: 'om2', user_id: 'u-grace', org_id: 'org-1', name: 'Grace Hopper', role: 'hr_director' },
    ],
    profiles: [
      { id: 'u-ada', name: 'Ada Lovelace', role: 'line_manager' },
      { id: 'u-grace', name: 'Grace Hopper', role: 'hr_director' },
    ],
    caseViews: [
      { case_id: 'c2', user_id: 'u-ada', last_viewed_at: '2026-01-05' },
      { case_id: 'c1', user_id: 'u-grace', last_viewed_at: '2026-01-06' },
    ],
    portalInvites: [
      { id: 'pi1', employee_name: 'Ada Lovelace', email: 'ada@example.com' },
      { id: 'pi2', employee_name: 'Grace Hopper', email: 'grace@example.com' },
    ],
  };

  it('includes only the subject\'s own prior DSAR requests', () => {
    const result = compileSubjectData('Ada Lovelace', staffData);
    expect(result.dsarRequests).toEqual([staffData.dsarRequests[0]]);
  });

  it('includes the subject\'s own org membership, profile, case views (by resolved user id) and portal invite', () => {
    const result = compileSubjectData('Ada Lovelace', staffData);
    expect(result.orgMembership).toEqual([staffData.orgMembers[0]]);
    expect(result.profiles).toEqual([staffData.profiles[0]]);
    expect(result.caseViews).toEqual([staffData.caseViews[0]]);
    expect(result.portalInvites).toEqual([staffData.portalInvites[0]]);
  });

  it('defaults every internal-user source to an empty array when omitted', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.dsarRequests).toEqual([]);
    expect(result.orgMembership).toEqual([]);
    expect(result.profiles).toEqual([]);
    expect(result.caseViews).toEqual([]);
    expect(result.portalInvites).toEqual([]);
  });

  it('includes audit log entries recording the subject\'s own actions, even on a case that isn\'t theirs', () => {
    const data = {
      ...baseData,
      auditLog: [
        { id: 'log1', caseId: 'c2', action: 'Case opened', user: 'Ada Lovelace' },
        { id: 'log2', caseId: 'c2', action: 'Unrelated action', user: 'Grace Hopper' },
      ],
    };
    const result = compileSubjectData('Ada Lovelace', data);
    expect(result.auditLog).toEqual([data.auditLog[0]]);
  });

  it('lists cases where the subject is named as manager, investigating manager or disciplinary officer on someone else\'s case, excluding the subject\'s own cases', () => {
    const data = {
      ...baseData,
      cases: [
        { id: 'c1', employeeName: 'Ada Lovelace', manager: 'Ada Lovelace', meetings: [] }, // subject's own case — must not double-count
        { id: 'c2', employeeName: 'Grace Hopper', manager: 'Ada Lovelace', meetings: [] },
        { id: 'c3', employeeName: 'Priya Shah', investigatingManager: 'Ada Lovelace', meetings: [] },
        { id: 'c4', employeeName: 'Sam Employee', disciplinaryOfficer: 'Ada Lovelace', meetings: [] },
        { id: 'c5', employeeName: 'Someone Else', manager: 'Grace Hopper', meetings: [] },
      ],
    };
    const result = compileSubjectData('Ada Lovelace', data);
    expect(result.actedAsStaff.cases.map(c => c.id).sort()).toEqual(['c2', 'c3', 'c4']);
  });

  it('lists employee_records where the subject is named as another employee\'s manager', () => {
    const data = {
      ...baseData,
      employeeRecords: [
        { name: 'Ada Lovelace', manager: 'Grace Hopper' },
        { name: 'Priya Shah', manager: 'Ada Lovelace' },
      ],
    };
    const result = compileSubjectData('Ada Lovelace', data);
    expect(result.actedAsStaff.employeeRecords).toEqual([data.employeeRecords[1]]);
  });

  it('lists wellbeing notes where the subject is named as the manager, for someone else\'s note', () => {
    const data = {
      ...baseData,
      wellbeingNotes: [
        { id: 'w1', employeeName: 'Priya Shah', manager: 'Ada Lovelace', content: 'x' },
        { id: 'w2', employeeName: 'Ada Lovelace', manager: 'Grace Hopper', content: 'y' },
      ],
    };
    const result = compileSubjectData('Ada Lovelace', data);
    expect(result.actedAsStaff.wellbeingNotes).toEqual([data.wellbeingNotes[0]]);
  });

  it('lists hr_review_requests where the subject requested or reviewed, excluding requests already covered via the subject\'s own cases', () => {
    const data = {
      ...baseData,
      hrReviewRequests: [
        { id: 'hr1', case_id: 'c2', requested_by_name: 'Ada Lovelace' },
        { id: 'hr2', case_id: 'c2', reviewed_by_name: 'Ada Lovelace' },
        { id: 'hr3', case_id: 'c1', requested_by_name: 'Ada Lovelace' }, // subject's own case — already in subjectHrReviewRequests
        { id: 'hr4', case_id: 'c2', requested_by_name: 'Grace Hopper' },
      ],
    };
    const result = compileSubjectData('Ada Lovelace', data);
    expect(result.actedAsStaff.hrReviewRequests.map(r => r.id).sort()).toEqual(['hr1', 'hr2']);
  });

  it('defaults every actedAsStaff category to an empty array when the source data is omitted', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.actedAsStaff).toEqual({ cases: [], employeeRecords: [], wellbeingNotes: [], hrReviewRequests: [] });
  });
});

// Phase 6.5 hardening (closes independent audit finding 4.3's
// Organisational Intelligence gap) — org_events/improvement_initiatives/
// manager_capability_insights/organisation_themes have no
// subject-identifying column, so they're defensively scanned for the
// subject's own name the same way meeting text is scanned for OTHER
// people's names — this content isn't supposed to name anyone by design,
// so any hit here is worth a human looking at.
describe('compileSubjectData — organisational intelligence name-mention scan (Phase 6.5, closes finding 4.3)', () => {
  const orgIntelData = {
    ...baseData,
    orgEvents: [{ id: 'e1', description: 'Restructure discussed with Ada Lovelace present.', eventDate: '2026-03-01' }],
    improvementInitiatives: [{ id: 'i1', title: 'Reduce grievance backlog', problemIdentified: 'Ada Lovelace flagged repeated delays.' }],
    managerCapabilityInsights: [{ id: 'm1', suggested_response: 'Consider coaching support for Ada Lovelace.', created_at: '2026-03-02' }],
    organisationThemes: [{ id: 't1', description: 'Recurring theme involving Ada Lovelace across cases.' }],
  };

  it('flags the subject\'s name appearing in an org event description', () => {
    const result = compileSubjectData('Ada Lovelace', orgIntelData);
    expect(result.subjectMentionsInOrgNarratives.some(f => f.field === 'orgEvent.description')).toBe(true);
  });

  it('flags the subject\'s name appearing in an improvement initiative\'s title or problem statement', () => {
    const result = compileSubjectData('Ada Lovelace', orgIntelData);
    expect(result.subjectMentionsInOrgNarratives.some(f => f.field === 'improvementInitiative.problemIdentified')).toBe(true);
  });

  it('flags the subject\'s name appearing in a manager capability insight\'s suggested response', () => {
    const result = compileSubjectData('Ada Lovelace', orgIntelData);
    expect(result.subjectMentionsInOrgNarratives.some(f => f.field === 'managerCapabilityInsight.suggestedResponse')).toBe(true);
  });

  it('flags the subject\'s name appearing in an organisation theme description', () => {
    const result = compileSubjectData('Ada Lovelace', orgIntelData);
    expect(result.subjectMentionsInOrgNarratives.some(f => f.field === 'organisationTheme.description')).toBe(true);
  });

  it('does not flag anything when the subject is not named in any organisational narrative', () => {
    const result = compileSubjectData('Grace Hopper', orgIntelData);
    expect(result.subjectMentionsInOrgNarratives).toEqual([]);
  });

  it('defaults to an empty array when no organisational intelligence data is passed', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.subjectMentionsInOrgNarratives).toEqual([]);
  });
});

describe('compileSubjectData — case_access grants, third-party witness mentions, manager-side signatory (Prompt 16 audit, closes H14/H15/H16)', () => {
  it('includes case_access rows granted to the subject, resolved via their org membership user id', () => {
    const data = {
      ...baseData,
      orgMembers: [{ user_id: 'u-ada', name: 'Ada Lovelace' }, { user_id: 'u-grace', name: 'Grace Hopper' }],
      caseAccess: [
        { id: 'ca1', caseId: 'c2', userId: 'u-ada', role: 'investigator' },
        { id: 'ca2', caseId: 'c1', userId: 'u-grace', role: 'notetaker' },
      ],
    };
    const result = compileSubjectData('Ada Lovelace', data);
    expect(result.caseAccessGrants).toEqual([data.caseAccess[0]]);
  });

  it('defaults caseAccessGrants to an empty array when caseAccess is omitted', () => {
    const result = compileSubjectData('Ada Lovelace', baseData);
    expect(result.caseAccessGrants).toEqual([]);
  });

  it('flags a pure witness/third party\'s name mentioned in someone else\'s allegation, even though they were never a case subject', () => {
    const data = {
      ...baseData,
      allegations: [
        { id: 'a1', caseId: 'c2', witnessEvidence: 'Sam Witness confirmed the account.', peopleInvolved: 'Grace Hopper, Sam Witness' },
      ],
    };
    const result = compileSubjectData('Sam Witness', data);
    // Sam Witness is not a case subject or employee record anywhere in
    // baseData — every structured field is empty for them.
    expect(result.cases).toEqual([]);
    expect(result.allegations).toEqual([]);
    expect(result.subjectMentionsAsThirdParty.some(f => f.field === 'allegation.witnessEvidence' && f.caseId === 'c2')).toBe(true);
    expect(result.subjectMentionsAsThirdParty.some(f => f.field === 'allegation.peopleInvolved')).toBe(true);
  });

  it('flags a witness mentioned in a concern referral submitted about someone else', () => {
    const data = {
      ...baseData,
      concernReferrals: [{ id: 'cr1', employeeName: 'Grace Hopper', witnesses: 'Sam Witness saw the incident.' }],
    };
    const result = compileSubjectData('Sam Witness', data);
    expect(result.subjectMentionsAsThirdParty.some(f => f.field === 'concernReferral.witnesses')).toBe(true);
  });

  it('flags a witness mentioned in another case\'s meeting record or transcript', () => {
    const result = compileSubjectData('New Witness', {
      ...baseData,
      cases: [
        ...baseData.cases,
        { id: 'c3', employeeName: 'Grace Hopper', meetings: [{ id: 'm3', type: 'Investigation', date: '2026-04-01', record: 'New Witness described what they saw.', transcript: [{ speaker: 'HR', text: 'Thank you, New Witness.' }] }] },
      ],
    });
    expect(result.subjectMentionsAsThirdParty.some(f => f.field === 'record' && f.caseId === 'c3')).toBe(true);
    expect(result.subjectMentionsAsThirdParty.some(f => f.field.startsWith('transcript') && f.caseId === 'c3')).toBe(true);
  });

  it('does not flag the third-party scan against the subject\'s own case, since that content is already fully included above', () => {
    // c1's own meeting record genuinely does contain the subject's full
    // name — proving the exclusion is actually doing something, not just
    // silent because no match would have occurred anyway.
    const data = {
      ...baseData,
      cases: [
        { ...baseData.cases[0], meetings: [{ ...baseData.cases[0].meetings[0], record: 'Ada Lovelace raised a concern about Grace Hopper being unfair.' }] },
        baseData.cases[1],
      ],
    };
    const result = compileSubjectData('Ada Lovelace', data);
    expect(result.subjectMentionsAsThirdParty.some(f => f.caseId === 'c1')).toBe(false);
  });

  it('also matches signing requests where the subject is the manager-side signatory, not the employee', () => {
    const data = {
      ...baseData,
      signingRequests: [
        { sign_id: 'sr1', employee_name: 'Ada Lovelace', manager_name: 'Priya Manager', document: 'Meeting record.' },
      ],
    };
    const result = compileSubjectData('Priya Manager', data);
    expect(result.signingRequests).toEqual([data.signingRequests[0]]);
  });
});
