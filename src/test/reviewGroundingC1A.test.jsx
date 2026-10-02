import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import {
  groundingFromMeeting, groundingFromRecord, sameRecord, isAnalysisStale,
} from '../lib/reviewGrounding.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C.1A — what Compass analyses must be what the user is reviewing.
//
// Human UAT read a Meeting Record whose Purpose recorded an allegation of
// unauthorised company-vehicle use, while Summary said "no substantive facts,
// allegations, or subject matter were recorded" and Advice said the transcript
// was "limited to the opening formalities".
//
// Both were true of DIFFERENT MEETINGS. The record was a September
// investigation; the analysis was left in component state from a standalone
// meeting reviewed minutes earlier whose three notes really were just opening
// formalities. Opening a saved record did `setReviewOutput(m.record)` and
// navigated — swapping the record and inheriting the previous analysis.
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const meetingsTab = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
const evidenceTab = readFileSync('src/components/caseTabs/EvidenceTab.jsx', 'utf8');
const allegations = readFileSync('src/components/AllegationsPanel.jsx', 'utf8');

const ALLEGATION_A = '## Meeting Details\nPurpose: investigate alleged unauthorised use of a company vehicle on two occasions.';
const ALLEGATION_B = '## Meeting Details\nPurpose: investigate an alleged breach of the social media policy.';

describe('C.1A — analysis travels with the record it was written for', () => {
  it('takes the stored analysis from the SAME meeting as the record', () => {
    const g = groundingFromMeeting({
      record: ALLEGATION_A,
      summary: '## Key Facts Established\n- Employee acknowledges using the vehicle twice',
      advisorNotes: '## HR Advisor Notes\nConfirm the authorisation policy.',
      riskScore: { rating: 'MEDIUM', summary: 'x' },
    });
    expect(g.record).toContain('company vehicle');
    expect(g.summary).toContain('acknowledges using the vehicle');
    expect(g.advisorNotes).toContain('authorisation policy');
    expect(g.riskScore.rating).toBe('MEDIUM');
  });

  it('splits a legacy mixed record so internal advice never enters the record half', () => {
    const mixed = '## Meeting Details\nPurpose: X.\n\n## HR Advisor Notes\nInternal only.';
    const g = groundingFromMeeting({ record: mixed });
    expect(g.record).not.toContain('Internal only');
    expect(g.advisorNotes).toContain('Internal only');
  });

  it('a bare record CLEARS analysis rather than inheriting the previous meeting’s', () => {
    const g = groundingFromRecord('## Meeting Details\nWitness statement.');
    expect(g.record).toContain('Witness statement');
    expect(g.summary).toBe('');
    expect(g.advisorNotes).toBe('');
    expect(g.riskScore).toBeNull();
  });

  it('prefers the meeting’s own advisorNotes over the legacy split', () => {
    const g = groundingFromMeeting({
      record: '## Meeting Details\nX.\n\n## HR Advisor Notes\nlegacy half',
      advisorNotes: 'the real column',
    });
    expect(g.advisorNotes).toBe('the real column');
  });
});

describe('C.1A — staleness after the record changes', () => {
  it('is not stale when the analysis matches the record', () => {
    expect(isAnalysisStale({ record: ALLEGATION_A, analysisFor: ALLEGATION_A, hasAnalysis: true })).toBe(false);
  });

  it('IS stale once the record is edited to a materially different allegation', () => {
    expect(isAnalysisStale({ record: ALLEGATION_B, analysisFor: ALLEGATION_A, hasAnalysis: true })).toBe(true);
  });

  it('ignores whitespace reflow, which is not a material change', () => {
    expect(sameRecord('a  b\n\nc', 'a b c')).toBe(true);
    expect(isAnalysisStale({ record: 'a  b', analysisFor: 'a b', hasAnalysis: true })).toBe(false);
  });

  it('is never stale when there is no analysis to be stale', () => {
    expect(isAnalysisStale({ record: ALLEGATION_B, analysisFor: null, hasAnalysis: false })).toBe(false);
    expect(isAnalysisStale({ record: ALLEGATION_B, analysisFor: ALLEGATION_A, hasAnalysis: false })).toBe(false);
  });

  it('restoring the original makes analysis written for the original current again', () => {
    // edited away…
    expect(isAnalysisStale({ record: ALLEGATION_B, analysisFor: ALLEGATION_A, hasAnalysis: true })).toBe(true);
    // …and restored back
    expect(isAnalysisStale({ record: ALLEGATION_A, analysisFor: ALLEGATION_A, hasAnalysis: true })).toBe(false);
  });

  it('analysis written for the EDITED record is stale once the original is restored', () => {
    expect(isAnalysisStale({ record: ALLEGATION_A, analysisFor: ALLEGATION_B, hasAnalysis: true })).toBe(true);
  });
});

describe('C.1A — the Review screen says so rather than implying currency', () => {
  const noop = () => {};
  const base = {
    caseInfo: { employee: 'Sam Employee', date: '02/10/2026' },
    meetingType: { label: 'Investigation' },
    isHR: true, requestHrReview: noop,
    reviewOutput: ALLEGATION_A, reviewOutputOriginal: ALLEGATION_A,
    meetingSummary: 'the triage read', confirmDialog: noop, setShowShareModal: noop,
    saveMeetingToCase: noop, setScreen: noop, showToast: noop,
    askCompassInput: '', setAskCompassInput: noop, askCompassHistory: [], setAskCompassHistory: noop,
    askCompass: noop, setAskCompassProcessing: noop, askCompassProcessing: false,
    editProcessing: false, editRecord: noop, editingRecord: false, setEditingRecord: noop,
    aiProcessing: false, aiError: '', setReviewOutput: noop, setShowSignModal: noop,
    riskScore: null, reviewGenerationFailed: false, onRetryGeneration: noop,
  };

  it('marks the rail stale when the record has moved on', () => {
    render(<ReviewScreen {...base} analysisStale={true} />);
    expect(screen.getByText(/written for an earlier version of the record/i)).toBeInTheDocument();
  });

  it('says nothing when the analysis is current', () => {
    render(<ReviewScreen {...base} analysisStale={false} />);
    expect(screen.queryByText(/earlier version of the record/i)).not.toBeInTheDocument();
  });

  it('still shows the analysis — provenance changed, not usefulness', () => {
    render(<ReviewScreen {...base} analysisStale={true} />);
    expect(screen.getByText(/the triage read/)).toBeInTheDocument();
  });
});

// ── The architectural fix, pinned where it lives ──
describe('C.1A — one entry point binds record and analysis', () => {
  it('App exposes a single presenter that sets the record AND its own analysis', () => {
    const i = app.indexOf('const presentMeetingRecord =');
    expect(i).toBeGreaterThan(-1);
    const body = app.slice(i, i + 2000);
    for (const setter of ['setReviewOutput(g.record)', 'setAdvisorNotes(g.advisorNotes)',
      'setMeetingSummary(g.summary)', 'setRiskScore(g.riskScore)', 'setAnalysisForRecord(']) {
      expect(body).toContain(setter);
    }
    // and everything else that was about the previous record
    expect(body).toContain('setReviewGaps([])');
    // The Ask conversation was cleared here in C.1A. Superseded: Review's thread
    // is now keyed by the record it concerns (askThreadKey), so presenting a
    // different record already shows a different conversation — and the blanket
    // clear would have wiped the organisation-wide widget's thread, which is a
    // different conversation entirely. The isolation is asserted in
    // askConversation.test.jsx; what matters here is that it is NOT done by
    // clearing shared state.
    expect(body).not.toContain('setAskCompassHistory([])');
    expect(app).toContain('askCompassHistory={threadFor(askThreads, reviewAskKey)}');
  });

  it.each([
    ['MeetingsTab', meetingsTab],
    ['EvidenceTab', evidenceTab],
    ['AllegationsPanel', allegations],
  ])('%s no longer swaps the record behind the analysis', (_name, src) => {
    expect(src).toContain('onPresentMeetingRecord');
    // the bare swap that caused the defect
    expect(src).not.toMatch(/setReviewOutput\((?:m|ev)\.record\)/);
  });

  it('generation and both restore paths bind analysis to the record they produced', () => {
    expect(app).toContain('setAnalysisForRecord(split.employeeFacing)');
    expect((app.match(/setAnalysisForRecord\(restored\.employeeFacing\)/g) || []).length).toBe(2);
  });

  it('a fresh review session starts with nothing bound', () => {
    expect(app).toContain('setAnalysisForRecord(null)');
  });
});

describe('C.1A — Ask is grounded in the record at request time', () => {
  it('accepts a grounding record and sends it with stated provenance', () => {
    const i = app.indexOf('const askCompass = async');
    const body = app.slice(i, i + 2600);
    expect(body).toContain('grounding = null');
    expect(body).toContain('MEETING RECORD UNDER REVIEW:');
    expect(body).toContain('treat allegations recorded in it as allegations rather than findings');
    // …and is actually APPENDED to the turn. Without this, deleting the
    // append leaves the block defined and unused, and the mutation survives.
    expect(body).toContain('+caseContext+groundingBlock');
    // both shapes of user turn: plain text, and the document-attachment form
    expect((body.match(/\+caseContext\+groundingBlock/g) || []).length).toBe(2);
  });

  it('Review passes the CURRENT record, not a captured one', () => {
    const i = app.indexOf('<ReviewScreen caseInfo={caseInfo}');
    const tag = app.slice(i, app.indexOf('/>', i));
    expect(tag).toContain('askCompass={(m,h,sh,sp)=>askCompass(m,h,sh,sp,{record:reviewOutput})}');
  });

  it('sends the employee-facing half only — internal advice is not shipped to Ask', () => {
    const i = app.indexOf('const groundingBlock =');
    const body = app.slice(i, i + 600);
    expect(body).toContain('grounding.record');
    expect(body).not.toContain('advisorNotes');
  });
});

// ── Phase 5: allegation must not become established fact ──
describe('C.1A — an allegation is not a finding', () => {
  it('instructs Ask to treat recorded allegations as allegations', () => {
    expect(app).toContain('treat allegations recorded in it as allegations rather than findings');
  });

  it('keeps the evidential contract that forbids converting assertions into facts', () => {
    expect(app).toContain('REVIEW_EVIDENTIAL_CONTRACT');
    expect(app).toMatch(/an ATTRIBUTED STATEMENT, something a participant said or asserted/);
  });

  it('keeps the rule that an assertion alone cannot establish a fact', () => {
    expect(app).toMatch(/a participant asserting something is not enough on its own/);
  });
});
