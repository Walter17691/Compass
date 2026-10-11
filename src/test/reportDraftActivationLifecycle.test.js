import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { REPORT_DRAFT_SAVE_ORG_ALLOW_LIST } from '../lib/reportDraftActivation.js';

// ─────────────────────────────────────────────────────────────────────────
// B3.2 — ACTIVATION IS GATED ON RESOLVING THE STEP 7 COLLISION.
//
// This is not a style check. Step 7 of the investigator checklist ("Submit
// findings to HR") runs attemptSubmitInvestigation -> concludeInvestigation,
// which GENERATES a report into cases.investigation_report and asks HR to
// review it. hasExistingReport() reads only that legacy field. Nothing in
// that path knows investigation_report_versions exists.
//
// Today that is harmless: production holds zero versions, and no
// organisation can save one. The first activated organisation ends both
// facts at once — and then an investigator can author version N and have a
// generated report reviewed instead, with their work neither used nor
// mentioned.
//
// So the allow-list and the submission path are coupled whether or not
// anyone wants them to be, and this test makes the coupling fail loudly
// rather than quietly. Adding an organisation id REQUIRES either teaching
// the submission path about versions, or deliberately deleting this test
// and saying why.
//
// THE INTENDED LIFECYCLE, which nothing may short-circuit:
//   save draft -> adopt report -> submit the ADOPTED version -> HR decides.
// Submitting the latest draft directly is not an acceptable shortcut: an
// unadopted draft is work in progress, and adoption is the act that makes a
// version into the report.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => readFileSync(p, 'utf8');
const APP = 'src/App.jsx';

/**
 * Does the submission path consult the version store at all?
 *
 * Deliberately generous about HOW — any mention of the version table, the
 * adoption RPC, or an adopted-version concept inside the two functions that
 * make up the submit path counts. The test is asking "has anyone thought
 * about versions here yet", not "was it done my way".
 */
function submissionPathKnowsAboutVersions() {
  const src = read(APP);
  const start = src.indexOf('const finalizeInvestigationSubmission');
  const end = src.indexOf('const proceedPastInvestigationQualityCheck');
  if (start < 0 || end < 0 || end <= start) {
    // The functions were renamed or restructured — that is itself a change
    // to the submission path, so fail rather than silently pass.
    return null;
  }
  const submitPath = src.slice(start, end);
  return /investigation_report_versions|reportVersion|adoptedVersion|adopt_investigation_report_version|adoptedAt/i.test(submitPath);
}

describe('B3.2 — the allow-list cannot be populated while Step 7 ignores saved versions', () => {
  it('is empty today, and the submission path still knows nothing about versions', () => {
    expect(REPORT_DRAFT_SAVE_ORG_ALLOW_LIST).toEqual([]);
    const knows = submissionPathKnowsAboutVersions();
    expect(knows, 'the submit path functions must still be findable by name').not.toBeNull();
    // This is the documented current state. When it flips to true, the
    // collision has been addressed and the guard below stops blocking.
    expect(knows).toBe(false);
  });

  it('BLOCKS activation: an organisation may not be added while the collision stands', () => {
    const activated = REPORT_DRAFT_SAVE_ORG_ALLOW_LIST.length > 0;
    const resolved = submissionPathKnowsAboutVersions() === true;
    expect(
      !activated || resolved,
      'REPORT_DRAFT_SAVE_ORG_ALLOW_LIST is no longer empty, but "Submit findings to HR" still '
      + 'generates a legacy report and never consults investigation_report_versions. An activated '
      + 'investigator can author a version and have it silently bypassed. Resolve the lifecycle '
      + '(save draft -> adopt -> submit the adopted version -> HR decides) before activating.',
    ).toBe(true);
  });

  it('records the collision where someone changing the allow-list will read it', () => {
    const src = read('src/lib/reportDraftActivation.js');
    expect(src).toMatch(/LIFECYCLE COLLISION/);
    expect(src).toMatch(/save draft -> adopt report -> submit the ADOPTED version/);
    expect(src).toMatch(/reportDraftActivationLifecycle\.test\.js/);
  });

  it('does not implement submitting the latest draft as a shortcut', () => {
    const src = read(APP);
    // No path may take "the most recent version" and submit it without an
    // adoption step in between.
    expect(src).not.toMatch(/submitLatestDraft|submitLatestVersion|submitDraftToHr/i);
  });
});
