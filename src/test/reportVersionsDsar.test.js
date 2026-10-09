import { describe, it, expect } from 'vitest';

import { compileSubjectData, DSAR_SUBJECT_SOURCES } from '../lib/dsarCompile.js';
import { TABLE_CLASSIFICATION, DSAR_DISPOSITION, RECORDED_RLS_2026_10_03 } from '../lib/dataClassification.js';
import { CASCADE_COVERED_TABLES } from '../lib/dataInventory.js';
import { classifyReportVersion, REPORT_VERSION_STATE } from '../lib/reportVersionGateway.js';

// ═══════════════════════════════════════════════════════════════════════════
// B3.4 — investigation_report_versions in a subject access request.
//
// B3.1 shipped the store deliberately unwired (INCLUDED_NOT_WIRED, dsarDefect
// B3.4) because the B2 review had just established that a manifest entry is
// not an integration: investigation_finding_revisions was listed, classified
// included and covered by 21 passing tests while nothing fetched it. So these
// are behavioural tests against compileSubjectData, and the question "does
// anything actually CALL the gateway" is answered separately, in
// reportVersionsDsarWiring.test.jsx, which is the only shape that catches it.
//
// The disclosure rule being tested, in one line: every version is listed and
// counted by state, and no version's wording is reproduced in any state.
// That is neither blanket release nor blanket withholding — it is the
// treatment cases.investigationReport itself already gets.
// ═══════════════════════════════════════════════════════════════════════════

const base = {
  employeeRecords: [
    { name: 'Ada Lovelace', jobTitle: 'Engineer', location: 'London' },
    { name: 'Grace Hopper', jobTitle: 'Manager', location: 'London' },
  ],
  cases: [
    { id: 'c1', employeeName: 'Ada Lovelace', caseType: 'Misconduct', meetings: [] },
    { id: 'c9', employeeName: 'Grace Hopper', caseType: 'Misconduct', meetings: [] },
  ],
};

const draft = {
  id: 'v1', orgId: 'org-1', caseId: 'c1', versionNo: 1,
  body: 'An early account of the overtime question.',
  source: 'generated', createdAt: '2026-07-01T09:00:00Z', authorKind: 'user',
  adoptedAt: null, adoptionBasis: null, adoptionReason: null,
  isCurrent: false, supersededAt: null, supersededByVersionId: null,
};
const adoptedCurrent = {
  ...draft, id: 'v2', versionNo: 2, body: 'The adopted report.', source: 'edited',
  adoptedAt: '2026-07-02T09:00:00Z', adoptionBasis: 'assigned_investigator',
  isCurrent: true,
};
const adoptedSuperseded = {
  ...draft, id: 'v3', versionNo: 3, body: 'An earlier official report.',
  adoptedAt: '2026-07-03T09:00:00Z', adoptionBasis: 'assigned_investigator',
  isCurrent: false, supersededAt: '2026-07-04T09:00:00Z', supersededByVersionId: 'v2',
};

const compile = versions => compileSubjectData('Ada Lovelace', { ...base, reportVersions: versions });

describe('B3.4 — the version store is registered, classified and erasable', () => {
  it('is in the subject-source manifest, so the governance gate covers it', () => {
    expect(DSAR_SUBJECT_SOURCES.reportVersions).toBe('investigation_report_versions');
  });

  it('is classified as disclosable personal data and is no longer an unwired obligation', () => {
    const meta = TABLE_CLASSIFICATION.investigation_report_versions;
    expect(meta).toBeTruthy();
    expect(meta.dsar).toBe(DSAR_DISPOSITION.INCLUDED);
    // The defect marker must be GONE: leaving it while the table is wired
    // would under-report the obligation as still outstanding.
    expect(meta.dsarDefect).toBeUndefined();
    expect(meta.personRelated).toBe(true);
    expect(meta.caseRelated).toBe(true);
    expect(meta.orgScoped).toBe(true);
  });

  it('states the retention position rather than implying a purge exists', () => {
    expect(TABLE_CLASSIFICATION.investigation_report_versions.retention).toBe('not_enforced');
    expect(TABLE_CLASSIFICATION.investigation_report_versions.dsarNote).toMatch(/RETENTION IS THE OPEN QUESTION/);
  });

  it('is erased by "Delete all data" through the case cascade', () => {
    expect(CASCADE_COVERED_TABLES).toContain('investigation_report_versions');
  });

  it('records the RLS posture it actually ships with', () => {
    expect(RECORDED_RLS_2026_10_03.investigation_report_versions).toEqual({ rls: true, policies: 2 });
  });
});

describe('B3.4 — the five states are distinguished, not flattened', () => {
  it('classifies a never-adopted version as a draft', () => {
    expect(classifyReportVersion(draft)).toBe(REPORT_VERSION_STATE.DRAFT);
  });

  it('classifies the adopted, current version as the current adopted report', () => {
    expect(classifyReportVersion(adoptedCurrent)).toBe(REPORT_VERSION_STATE.CURRENT_ADOPTED);
  });

  it('classifies an adopted-then-replaced version as historically adopted', () => {
    expect(classifyReportVersion(adoptedSuperseded)).toBe(REPORT_VERSION_STATE.HISTORICALLY_ADOPTED);
  });

  it('names a shape it cannot classify instead of mis-filing it as a draft', () => {
    // Adopted, not current, not superseded. The adoption RPC never produces
    // this, but the CHECK constraints permit it, and telling a reviewer
    // something false would be worse than telling them Compass is unsure.
    const odd = { ...draft, adoptedAt: '2026-07-05T09:00:00Z', isCurrent: false, supersededAt: null };
    expect(classifyReportVersion(odd)).toBe(REPORT_VERSION_STATE.UNEXPECTED);
  });

  it('never throws on a malformed row', () => {
    for (const bad of [null, undefined, 'nonsense', 42, {}]) {
      expect(() => classifyReportVersion(bad)).not.toThrow();
    }
  });

  it('counts each state separately in the disposition', () => {
    const r = compile([draft, adoptedCurrent, adoptedSuperseded]);
    expect(r.reportVersionDisposition.counts).toEqual({
      currentAdopted: 1, historicallyAdopted: 1, drafts: 1, unexpected: 0,
    });
  });
});

describe('B3.4 — what a subject access request discloses', () => {
  it('does not silently omit the table: versions are present with their provenance', () => {
    const r = compile([adoptedCurrent]);
    expect(r.reportVersions).toHaveLength(1);
    expect(r.reportVersions[0].caseId).toBe('c1');
    expect(r.reportVersions[0].versionNo).toBe(2);
    expect(r.reportVersions[0].state).toBe('current_adopted');
    expect(r.reportVersions[0].source).toBe('edited');
    expect(r.reportVersions[0].adoptedAt).toBe('2026-07-02T09:00:00Z');
    expect(r.reportVersions[0].adoptionBasis).toBe('assigned_investigator');
  });

  it('does NOT reproduce the wording of ANY version — adopted, replaced or draft', () => {
    const r = compile([draft, adoptedCurrent, adoptedSuperseded]);
    const serialised = JSON.stringify(r.reportVersions);
    expect(serialised).not.toContain('An early account of the overtime question.');
    expect(serialised).not.toContain('The adopted report.');
    expect(serialised).not.toContain('An earlier official report.');
    r.reportVersions.forEach(v => {
      expect(v).not.toHaveProperty('body');
      expect(v).not.toHaveProperty('adoptionReason');
    });
  });

  it('flags that there IS text to decide about, so it cannot be quietly dropped', () => {
    const r = compile([draft]);
    expect(r.reportVersions[0].bodyRequiresReview).toBe(true);
  });

  it('does not claim there is a written HR reason when there is none', () => {
    const r = compile([adoptedCurrent]);
    expect(r.reportVersions[0].adoptionReasonRequiresReview).toBe(false);
  });

  it('flags an HR-exception reason for review rather than reproducing it', () => {
    const hrException = {
      ...adoptedCurrent, adoptionBasis: 'hr_exception',
      adoptionReason: 'The investigator left the business before adopting.',
    };
    const r = compile([hrException]);
    expect(r.reportVersions[0].adoptionBasis).toBe('hr_exception');
    expect(r.reportVersions[0].adoptionReasonRequiresReview).toBe(true);
    expect(JSON.stringify(r.reportVersions)).not.toContain('left the business');
  });

  it('treats whitespace-only wording as nothing to review', () => {
    const r = compile([{ ...draft, body: '   \n  ' }]);
    expect(r.reportVersions[0].bodyRequiresReview).toBe(false);
  });

  it('NEVER discloses the internal actors who authored or adopted a version', () => {
    const withActors = { ...adoptedCurrent, createdBy: 'user-inv-1', adoptedBy: 'user-hr-1' };
    const r = compile([withActors]);
    expect(r.reportVersions[0]).not.toHaveProperty('createdBy');
    expect(r.reportVersions[0]).not.toHaveProperty('adoptedBy');
    const serialised = JSON.stringify(r.reportVersions);
    expect(serialised).not.toContain('user-inv-1');
    expect(serialised).not.toContain('user-hr-1');
  });

  it('DOES disclose whether a person or a system authored the version', () => {
    expect(compile([adoptedCurrent]).reportVersions[0].authorKind).toBe('user');
    const machine = compile([{ ...adoptedCurrent, authorKind: 'system' }]);
    expect(machine.reportVersions[0].authorKind).toBe('system');
  });

  it('distinguishes "none recorded" from "could not read" in the disposition', () => {
    const none = compileSubjectData('Ada Lovelace', { ...base, reportVersions: [] });
    expect(none.reportVersionDisposition.excluded).toBe(true);
    expect(none.reportVersionDisposition.readFailed).toBe(false);
    expect(none.reportVersionDisposition.note).toMatch(/No investigation report .* has been saved as a version/);

    const failed = compileSubjectData('Ada Lovelace', { ...base, reportVersions: [], reportVersionFetchFailed: true });
    expect(failed.reportVersionDisposition.readFailed).toBe(true);
    expect(failed.reportVersionDisposition.note).toMatch(/could not read/i);
    expect(failed.reportVersionDisposition.note).toMatch(/completeness cannot be confirmed/i);
  });

  it('says plainly that a draft is neither automatically exempt nor automatically released', () => {
    const r = compile([draft]);
    expect(r.reportVersionDisposition.note).toMatch(/not automatically exempt and is not automatically released/);
  });
});

describe('B3.4 — the DSAR case boundary and cross-org isolation hold', () => {
  it('does not leak another subject\'s report versions', () => {
    const other = { ...adoptedCurrent, id: 'v9', caseId: 'c9' };
    const r = compile([adoptedCurrent, other]);
    expect(r.reportVersions.map(v => v.caseId)).toEqual(['c1']);
  });

  it('does not leak a version whose case is not in the authorised set at all', () => {
    const foreign = { ...adoptedCurrent, id: 'vx', caseId: 'case-from-another-org' };
    const r = compile([foreign]);
    expect(r.reportVersions).toHaveLength(0);
    // and it must read as a genuine absence, not as a silent drop
    expect(r.reportVersionDisposition.excluded).toBe(true);
  });

  it('filters on the CASE, not on org_id, so a mislabelled org cannot widen the package', () => {
    // A row carrying this subject's case but a foreign org_id is still theirs;
    // a row carrying the right org but another person's case is not. The case
    // is the authoritative parent, which is what identityBasis records.
    const foreignOrgOwnCase = { ...adoptedCurrent, orgId: 'org-999' };
    const ownOrgForeignCase = { ...adoptedCurrent, id: 'v8', caseId: 'c9' };
    const r = compile([foreignOrgOwnCase, ownOrgForeignCase]);
    expect(r.reportVersions).toHaveLength(1);
    expect(r.reportVersions[0].caseId).toBe('c1');
  });

  it('reports the basis on which versions were attributed to the subject', () => {
    expect(compile([adoptedCurrent]).identityBasisByCollection.reportVersions).toBe('case_id');
  });

  it('survives being handed nothing, or something that is not an array', () => {
    for (const bad of [undefined, null, 'nonsense', 42, {}]) {
      expect(compileSubjectData('Ada Lovelace', { ...base, reportVersions: bad }).reportVersions).toEqual([]);
    }
  });

  it('ignores null entries rather than throwing on them', () => {
    expect(compile([null, adoptedCurrent, undefined]).reportVersions).toHaveLength(1);
  });
});

describe('B3.4 — third-party protection covers every version state', () => {
  const named = body => ({ ...draft, body });

  it('flags a third party named in a NEVER-ADOPTED draft', () => {
    const r = compile([named('Grace Hopper told me she authorised the overtime.')]);
    const flagged = JSON.stringify(r.flaggedThirdPartyMentions || []);
    expect(flagged).toContain('Grace Hopper');
    expect(flagged).toContain('reportVersion.draft.body');
  });

  it('flags a third party named only in a REPLACED official report', () => {
    const r = compile([{ ...adoptedSuperseded, body: 'Grace Hopper confirmed the rota.' }]);
    const flagged = JSON.stringify(r.flaggedThirdPartyMentions || []);
    expect(flagged).toContain('Grace Hopper');
    expect(flagged).toContain('reportVersion.historically_adopted.body');
  });

  it('flags a third party named in an HR exception reason', () => {
    const r = compile([{
      ...adoptedCurrent, adoptionBasis: 'hr_exception',
      adoptionReason: 'Adopted by HR because Grace Hopper had left.',
    }]);
    const flagged = JSON.stringify(r.flaggedThirdPartyMentions || []);
    expect(flagged).toContain('Grace Hopper');
    expect(flagged).toContain('adoptionReason');
  });

  it('attributes the flag to the version it came from, so a reviewer can find it', () => {
    const r = compile([named('Grace Hopper told me she authorised the overtime.')]);
    const hit = (r.flaggedThirdPartyMentions || []).find(m => String(m.field || '').startsWith('reportVersion.'));
    expect(hit).toBeTruthy();
    expect(hit.caseId).toBe('c1');
    expect(hit.versionNo).toBe(1);
  });

  it('never auto-redacts: the flag is raised for human review, not silently stripped', () => {
    const r = compile([named('Grace Hopper told me she authorised the overtime.')]);
    expect((r.flaggedThirdPartyMentions || []).length).toBeGreaterThan(0);
    // and the wording itself still did not enter the disclosed payload
    expect(JSON.stringify(r.reportVersions)).not.toContain('Grace Hopper');
  });
});

describe('B3.4 — nothing else about the package changed', () => {
  it('leaves the existing three-state release-provenance model untouched', () => {
    const r = compile([adoptedCurrent]);
    // The disclosure-integrity correction's vocabulary must still be reachable
    // and unchanged by this release.
    expect(r).toHaveProperty('findingRevisionDisposition');
    expect(r).toHaveProperty('allegationDisclosure');
    expect(r).toHaveProperty('thirdPartyContainment');
  });

  it('does not disturb the finding-revision category', () => {
    const r = compileSubjectData('Ada Lovelace', {
      ...base,
      reportVersions: [adoptedCurrent],
      findingRevisions: [{
        id: 'r1', caseId: 'c1', allegationId: 'alg_1', field: 'investigator_finding',
        previousValue: 'old', newValue: 'new', actorKind: 'user',
        changedAt: '2026-07-01T09:00:00Z', seq: 41,
      }],
    });
    expect(r.findingRevisions).toHaveLength(1);
    expect(r.reportVersions).toHaveLength(1);
  });
});

describe('B3.4 — completeness across every subject-linked case', () => {
  // The HR Director compiling the package is HR in the org, so the SELECT
  // policy lets them read every version on every case in it. Completeness
  // therefore means: versions from ALL of the subject's cases, not just the
  // first one the compiler happens to see.
  const multi = {
    employeeRecords: [{ name: 'Ada Lovelace', jobTitle: 'Engineer', location: 'London' }],
    cases: [
      { id: 'c1', employeeName: 'Ada Lovelace', caseType: 'Misconduct', meetings: [] },
      { id: 'c2', employeeName: 'Ada Lovelace', caseType: 'Capability', meetings: [] },
      { id: 'c3', employeeName: 'Ada Lovelace', caseType: 'Grievance', meetings: [] },
    ],
  };

  it('collects versions from every one of the subject\'s cases', () => {
    const versions = [
      { ...draft, id: 'a', caseId: 'c1', versionNo: 1 },
      { ...adoptedCurrent, id: 'b', caseId: 'c2', versionNo: 1 },
      { ...adoptedSuperseded, id: 'c', caseId: 'c3', versionNo: 1 },
    ];
    const r = compileSubjectData('Ada Lovelace', { ...multi, reportVersions: versions });
    expect(r.reportVersions).toHaveLength(3);
    expect(r.reportVersions.map(v => v.caseId).sort()).toEqual(['c1', 'c2', 'c3']);
    // one of each state, counted per state rather than lumped together
    expect(r.reportVersionDisposition.counts).toEqual({
      currentAdopted: 1, historicallyAdopted: 1, drafts: 1, unexpected: 0,
    });
  });

  it('EVERY version carries an explicit human-review flag, in every state', () => {
    const versions = [
      { ...draft, id: 'a', caseId: 'c1' },
      { ...adoptedCurrent, id: 'b', caseId: 'c2' },
      { ...adoptedSuperseded, id: 'c', caseId: 'c3' },
    ];
    const r = compileSubjectData('Ada Lovelace', { ...multi, reportVersions: versions });
    expect(r.reportVersions).toHaveLength(3);
    r.reportVersions.forEach(v => {
      expect(v).toHaveProperty('bodyRequiresReview');
      expect(v.bodyRequiresReview).toBe(true);
      expect(v).toHaveProperty('adoptionReasonRequiresReview');
      // and no state leaks its wording
      expect(v).not.toHaveProperty('body');
    });
  });

  it('a case the subject is not linked to contributes nothing, even in the same org', () => {
    const versions = [
      { ...adoptedCurrent, id: 'b', caseId: 'c2' },
      { ...adoptedCurrent, id: 'z', caseId: 'someone-elses-case' },
    ];
    const r = compileSubjectData('Ada Lovelace', { ...multi, reportVersions: versions });
    expect(r.reportVersions.map(v => v.caseId)).toEqual(['c2']);
  });
});
