import { describe, it, expect } from 'vitest';

import { compileSubjectData, DSAR_SUBJECT_SOURCES } from '../lib/dsarCompile.js';
import { TABLE_CLASSIFICATION, DSAR_DISPOSITION, RECORDED_RLS_2026_10_03 } from '../lib/dataClassification.js';
import { CASCADE_COVERED_TABLES } from '../lib/dataInventory.js';
import { PENDING_PRODUCTION_SCHEMA } from '../lib/dataClassification.js';

// ═══════════════════════════════════════════════════════════════════════════
// IR-REPORT-01b / B2 — investigation_finding_revisions in a DSAR.
//
// Decision A4 set three requirements that pull against each other:
//   * superseded investigator narratives ARE potentially disclosable personal
//     data — so the table may not be withheld wholesale;
//   * the table may not be SILENTLY OMITTED;
//   * every draft may not be AUTOMATICALLY DISCLOSED;
//   * third-party confidentiality, redaction and exemption review must survive.
//
// They reconcile exactly one way, and it is the way this codebase already
// handles HR's own reasoning (case_decisions.reasoningRequiresReview,
// cases.outcomeNotes): compile the EXISTENCE and the metadata, flag the wording
// for the human review that reviewed_flagged_sections gates, and scan the raw
// superseded text for third-party mentions regardless.
//
// These are behavioural tests against compileSubjectData, not assertions about
// the source text of the module.
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

const adaRevision = {
  id: 'r1', caseId: 'c1', allegationId: 'alg_1', field: 'investigator_finding',
  previousValue: 'I consider the timeline unclear.',
  newValue: 'The timeline is resolved; the overtime was authorised.',
  changedBy: 'user-inv-1', actorKind: 'user', changedAt: '2026-07-01T09:00:00Z', seq: 41,
};

describe('B2 — the revision table is registered, classified and erasable', () => {
  it('is in the subject-source manifest, so the governance gate covers it', () => {
    expect(DSAR_SUBJECT_SOURCES.findingRevisions).toBe('investigation_finding_revisions');
  });

  it('is classified as disclosable personal data, not withheld and not "not personal data"', () => {
    const meta = TABLE_CLASSIFICATION.investigation_finding_revisions;
    expect(meta).toBeTruthy();
    expect(meta.dsar).toBe(DSAR_DISPOSITION.INCLUDED);
    expect(meta.personRelated).toBe(true);
    expect(meta.caseRelated).toBe(true);
    expect(meta.orgScoped).toBe(true);
  });

  it('states the retention position rather than implying a purge exists', () => {
    const meta = TABLE_CLASSIFICATION.investigation_finding_revisions;
    // A3: no arbitrary period, no automatic purge. 'not_enforced' is the only
    // truthful value in this schema, and the note must say retention is open.
    expect(meta.retention).toBe('not_enforced');
    expect(meta.dsarNote).toMatch(/RETENTION IS THE OPEN QUESTION/);
  });

  it('is erased by "Delete all data" through the case cascade', () => {
    expect(CASCADE_COVERED_TABLES).toContain('investigation_finding_revisions');
  });

  it('records the RLS posture it actually ships with', () => {
    expect(RECORDED_RLS_2026_10_03.investigation_finding_revisions).toEqual({ rls: true, policies: 2 });
  });

  it('is declared PROPOSED, not live, until production has been re-read', () => {
    // The posture above was measured on an isolated branch, not on production.
    // ON DEPLOYMENT: re-read pg_class/pg_policies against production, confirm
    // the entry still matches, then remove this name from
    // PENDING_PRODUCTION_SCHEMA — which will fail this test, deliberately, so
    // the removal is a conscious act rather than a side effect.
    expect(PENDING_PRODUCTION_SCHEMA).toContain('investigation_finding_revisions');
  });
});

describe('B2 — what a subject access request discloses', () => {
  it('does not silently omit the table: the category is present and populated', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [adaRevision] });
    expect(r.findingRevisions).toHaveLength(1);
    expect(r.findingRevisions[0].caseId).toBe('c1');
    expect(r.findingRevisions[0].allegationId).toBe('alg_1');
    expect(r.findingRevisions[0].field).toBe('investigator_finding');
    expect(r.findingRevisions[0].changedAt).toBe('2026-07-01T09:00:00Z');
  });

  it('does NOT automatically disclose the draft wording, on either side of the change', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [adaRevision] });
    const serialised = JSON.stringify(r.findingRevisions);
    expect(serialised).not.toContain('I consider the timeline unclear.');
    expect(serialised).not.toContain('The timeline is resolved');
    expect(r.findingRevisions[0]).not.toHaveProperty('previousValue');
    expect(r.findingRevisions[0]).not.toHaveProperty('newValue');
  });

  it('flags that there IS superseded wording to review, so it cannot be quietly dropped', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [adaRevision] });
    expect(r.findingRevisions[0].supersededTextRequiresReview).toBe(true);
    expect(r.findingRevisions[0].replacementTextRequiresReview).toBe(true);
  });

  it('does not claim there is text to review when a narrative was merely created or cleared', () => {
    const firstDraft = { ...adaRevision, previousValue: null };
    const cleared = { ...adaRevision, id: 'r2', newValue: null, seq: 42 };
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [firstDraft, cleared] });
    expect(r.findingRevisions[0].supersededTextRequiresReview).toBe(false);
    expect(r.findingRevisions[0].replacementTextRequiresReview).toBe(true);
    expect(r.findingRevisions[1].supersededTextRequiresReview).toBe(true);
    expect(r.findingRevisions[1].replacementTextRequiresReview).toBe(false);
  });

  it('treats whitespace-only wording as nothing to review', () => {
    const blank = { ...adaRevision, previousValue: '   \n  ' };
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [blank] });
    expect(r.findingRevisions[0].supersededTextRequiresReview).toBe(false);
  });

  it('NEVER discloses changed_by — the internal actor is not the subject\'s data to receive', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [adaRevision] });
    expect(r.findingRevisions[0]).not.toHaveProperty('changedBy');
    expect(JSON.stringify(r.findingRevisions)).not.toContain('user-inv-1');
  });

  it('DOES disclose whether a person or a system made the change', () => {
    // Whether a human or an automated process altered a record about the
    // subject is the subject's own information, and recording it is the point.
    const human = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [adaRevision] });
    expect(human.findingRevisions[0].actorKind).toBe('user');

    const machine = compileSubjectData('Ada Lovelace', {
      ...base,
      findingRevisions: [{ ...adaRevision, changedBy: null, actorKind: 'system' }],
    });
    expect(machine.findingRevisions[0].actorKind).toBe('system');
  });

  it('discloses the authoritative order, which changed_at alone cannot give', () => {
    // Two edits in one transaction share changed_at (measured on the B2 branch:
    // 7 rows, 4 distinct changed_at). seq is what makes the order answerable.
    const a = { ...adaRevision, seq: 41, changedAt: '2026-07-01T09:00:00Z' };
    const b = { ...adaRevision, id: 'r2', seq: 42, changedAt: '2026-07-01T09:00:00Z' };
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [a, b] });
    expect(r.findingRevisions.map(x => x.seq)).toEqual([41, 42]);
  });
});

describe('B2 — the DSAR case boundary holds for revisions', () => {
  it('does not leak another subject\'s revision history', () => {
    const other = { ...adaRevision, id: 'r9', caseId: 'c9' };
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [adaRevision, other] });
    expect(r.findingRevisions.map(x => x.caseId)).toEqual(['c1']);
  });

  it('does not leak a revision whose case is not in the authorised set at all', () => {
    const foreign = { ...adaRevision, id: 'rx', caseId: 'case-from-another-org' };
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [foreign] });
    expect(r.findingRevisions).toHaveLength(0);
  });

  it('reports the basis on which revisions were attributed to the subject', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [adaRevision] });
    expect(r.identityBasisByCollection.findingRevisions).toBe('case_id');
  });

  it('survives being handed nothing, or something that is not an array', () => {
    for (const bad of [undefined, null, 'nonsense', 42, {}]) {
      const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: bad });
      expect(r.findingRevisions).toEqual([]);
    }
  });

  it('ignores null entries rather than throwing on them', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [null, adaRevision, undefined] });
    expect(r.findingRevisions).toHaveLength(1);
  });
});

describe('B2 — third-party protection applies to superseded wording too', () => {
  // The risk this closes: a colleague named in a draft that was later edited
  // out of the live record would otherwise be released from the revision store
  // PRECISELY BECAUSE the name had been removed from the current text.
  const withThirdParty = {
    ...adaRevision,
    previousValue: 'Grace Hopper told me she authorised the overtime herself.',
    newValue: 'The overtime was authorised.',
  };

  it('flags a third party named only in the SUPERSEDED wording', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [withThirdParty] });
    const flagged = JSON.stringify(r.flaggedThirdPartyMentions || []);
    expect(flagged).toContain('Grace Hopper');
    expect(flagged).toContain('findingRevision.investigator_finding.superseded');
  });

  it('attributes the flag to the revision it came from, so a reviewer can find it', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [withThirdParty] });
    const hit = (r.flaggedThirdPartyMentions || []).find(m => String(m.field || '').startsWith('findingRevision.'));
    expect(hit).toBeTruthy();
    expect(hit.caseId).toBe('c1');
    expect(hit.allegationId).toBe('alg_1');
  });

  it('never auto-redacts: the flag is raised for human review, not silently stripped', () => {
    const r = compileSubjectData('Ada Lovelace', { ...base, findingRevisions: [withThirdParty] });
    expect((r.flaggedThirdPartyMentions || []).length).toBeGreaterThan(0);
    // and the wording itself still did not enter the disclosed payload
    expect(JSON.stringify(r.findingRevisions)).not.toContain('Grace Hopper');
  });
});
