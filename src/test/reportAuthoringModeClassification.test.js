import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { TABLE_CLASSIFICATION, RECORDED_RLS_2026_10_03 } from '../lib/dataClassification.js';

// ═══════════════════════════════════════════════════════════════════════════
// B3.2 — authoring_mode AND request_digest, ASSESSED RATHER THAN IGNORED.
//
// Two columns exist on investigation_report_versions that are not information
// about the subject: a one-way digest of the save request, and a flag saying
// which editor produced the version. The brief for this slice was explicit —
// do not auto-disclose them, and do not categorically exclude them without a
// documented assessment. These tests hold that assessment in place: the
// reasoning stays written down, and the columns stay out of the DSAR read.
// ═══════════════════════════════════════════════════════════════════════════

const gateway = () => readFileSync('src/lib/reportVersionGateway.js', 'utf8');
const dsarColumns = () => {
  const src = gateway();
  const start = src.indexOf('const DSAR_COLUMNS');
  return src.slice(start, src.indexOf('].join', start));
};
const caseColumns = () => {
  const src = gateway();
  const start = src.indexOf('const CASE_COLUMNS');
  return src.slice(start, src.indexOf('].join', start));
};

describe('B3.2 — neither column reaches a subject access response', () => {
  it('the DSAR read selects neither authoring_mode nor request_digest', () => {
    const cols = dsarColumns();
    expect(cols).not.toMatch(/authoring_mode/);
    expect(cols).not.toMatch(/request_digest/);
    expect(cols).not.toMatch(/request_id/);
    // CONTROL: it does select what the compiler needs, so the absences mean
    // something rather than passing against an empty list.
    expect(cols).toMatch(/'body'/);
    expect(cols).toMatch(/'author_kind'/);
    expect(cols).toMatch(/'adoption_basis'/);
  });

  it('the case read selects authoring_mode, because the editor must open a version as written', () => {
    const cols = caseColumns();
    expect(cols).toMatch(/authoring_mode/);
    // …and still not the digest, which no screen displays.
    expect(cols).not.toMatch(/request_digest/);
    // …and still not the body, which is fetched one version at a time.
    expect(cols).not.toMatch(/'body'/);
  });

  it('the compiler is never handed either field', () => {
    const src = readFileSync('src/lib/dsarCompile.js', 'utf8');
    expect(src).not.toMatch(/authoringMode|authoring_mode/);
    expect(src).not.toMatch(/requestDigest|request_digest/);
  });
});

describe('B3.2 — the assessment is written down, not assumed', () => {
  const entry = () => {
    const src = readFileSync('src/lib/dataClassification.js', 'utf8');
    const start = src.indexOf('investigation_report_versions: t(');
    return src.slice(start, src.indexOf('}),', start));
  };

  it('names both columns and says why each is withheld', () => {
    const e = entry();
    expect(e).toMatch(/request_digest/);
    expect(e).toMatch(/authoring_mode/);
    expect(e).toMatch(/one-way/i);
    expect(e).toMatch(/NULL means not recorded/i);
  });

  it('records that this is a judgement a reviewer may disagree with', () => {
    expect(entry()).toMatch(/not categorically excluded|reviewer can disagree/i);
  });

  it('leaves the table classified and included exactly as before', () => {
    expect(TABLE_CLASSIFICATION.investigation_report_versions).toBeTruthy();
    expect(RECORDED_RLS_2026_10_03.investigation_report_versions).toEqual({ rls: true, policies: 2 });
  });
});

describe('B3.2 — the safeguards the DSAR work put in place are untouched', () => {
  const dsar = () => readFileSync('src/lib/dsarCompile.js', 'utf8');

  it('human review of report bodies still applies', () => {
    expect(dsar()).toMatch(/bodyRequiresReview/);
  });

  it('third-party containment still scans every version body', () => {
    expect(dsar()).toMatch(/scanText\(v\.body/);
  });

  it('incomplete collection is still reported rather than hidden', () => {
    const src = dsar();
    expect(src).toMatch(/collectionComplete/);
    expect(src).toMatch(/incompleteCollections/);
  });
});
