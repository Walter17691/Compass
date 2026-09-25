import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import {
  splitMeetingRecord, employeeFacingRecord, internalAnalysis, hasMixedSections,
} from '../lib/meetingRecordSections.js';
import { suggestionKey, isSameSuggestion, mergeSuggestions } from '../lib/suggestionIdentity.js';
import { buildReviewDraft, supersedeReviewDraft } from '../lib/reviewDraft.js';
import { stripAdvisorNotes } from '../lib/caseContext.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';

// ─────────────────────────────────────────────────────────────────────────
// Three defects found in the same human UAT (2026-09-25):
//
//  1. "Edit record" exposed the internal HR Advisor Notes, so internal Compass
//     analysis was editable, confirmable as the authoritative record, and — if a
//     heading variant ever defeated the exact-string cut in the signature path —
//     sendable to the employee.
//  2. The End-meeting Meeting Quality Check blocked the flow to warn that the user
//     intended to review the record before deciding an outcome, which is what
//     review_draft exists to represent.
//  3. The same proposed evidence update appeared twice.
//
// The invariant this file protects:  employeeFacingRecord !== internalCompassAnalysis
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const reviewSrc = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
const recordSrc = readFileSync('src/screens/RecordScreen.jsx', 'utf8');
const strip = src => src.split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');
const appCode = strip(app);
const reviewCode = strip(reviewSrc);
const recordCode = strip(recordSrc);

const FACING = '## Meeting Details\n\nType: Disciplinary Hearing\nDate: 4 October 2026\n\n## Meeting Dialogue\n\nHR: Thank you for attending.\nAT: I understood the purpose.';
const INTERNAL = '## HR Advisor Notes\n\nThe record does not establish that allegations were put. Tribunal exposure is material.';
const MIXED = `${FACING}\n\n${INTERNAL}`;

describe('the employee-facing / internal boundary', () => {
  it('splits a generated record into its two payloads', () => {
    const { employeeFacing, internal } = splitMeetingRecord(MIXED);
    expect(employeeFacing).toBe(FACING);
    expect(internal).toBe(INTERNAL);
    expect(employeeFacing).not.toContain('HR Advisor');
    expect(employeeFacing).not.toContain('Tribunal exposure');
  });

  it('a record with no advisory section is returned untouched', () => {
    const { employeeFacing, internal } = splitMeetingRecord(FACING);
    expect(employeeFacing).toBe(FACING);
    expect(internal).toBe('');
    expect(hasMixedSections(FACING)).toBe(false);
    expect(hasMixedSections(MIXED)).toBe(true);
  });

  it('heading variants an LLM might emit are all caught — the latent breach', () => {
    // The old signature cut was `indexOf("## HR Advisor")`. Every one of these
    // would have defeated it, and internal advice would have reached the employee.
    for (const heading of [
      '### HR Advisor Notes',        // deeper level
      '# HR Advisor Notes',          // shallower
      '## HR Adviser Notes',         // British spelling
      '##HR Advisor Notes',          // no space after the hashes
      '##   HR Advisor Notes',       // extra spaces
      '## hr advisor notes',         // lower case
    ]) {
      const mixed = `${FACING}\n\n${heading}\n\nInternal commentary here.`;
      const { employeeFacing, internal } = splitMeetingRecord(mixed);
      expect(employeeFacing, heading).toBe(FACING);
      expect(internal, heading).toContain('Internal commentary here.');
    }
  });

  it('the same words inside dialogue never trigger a split', () => {
    const chatty = '## Meeting Details\n\nType: Hearing\n\n## Meeting Dialogue\n\nHR: I will write the HR Advisor Notes up later.';
    expect(splitMeetingRecord(chatty).internal).toBe('');
    expect(splitMeetingRecord(chatty).employeeFacing).toBe(chatty);
  });

  it('a lower-level heading inside the advisory body does not end it early', () => {
    const nested = `${FACING}\n\n## HR Advisor Notes\n\nBody.\n\n### Sub point\n\nMore internal text.`;
    const { employeeFacing, internal } = splitMeetingRecord(nested);
    expect(employeeFacing).toBe(FACING);
    expect(internal).toContain('More internal text.');
  });

  it('a following same-level heading DOES end it', () => {
    const after = `${FACING}\n\n## HR Advisor Notes\n\nInternal.\n\n## Attendance\n\nAll present.`;
    const { employeeFacing, internal } = splitMeetingRecord(after);
    expect(employeeFacing).toContain('## Attendance');
    expect(employeeFacing).toContain('All present.');
    expect(internal).toContain('Internal.');
    expect(internal).not.toContain('All present.');
  });

  it('CRLF input survives, and non-strings are handled', () => {
    const crlf = MIXED.replace(/\n/g, '\r\n');
    expect(splitMeetingRecord(crlf).employeeFacing).toContain('\r');
    expect(splitMeetingRecord(null)).toEqual({ employeeFacing: '', internal: '' });
    expect(splitMeetingRecord(undefined).employeeFacing).toBe('');
    expect(employeeFacingRecord(MIXED)).toBe(FACING);
    expect(internalAnalysis(MIXED)).toBe(INTERNAL);
  });

  it('ONE matcher: stripAdvisorNotes now delegates, and is byte-identical when there is nothing to strip', () => {
    expect(stripAdvisorNotes(MIXED)).toBe(FACING);
    expect(stripAdvisorNotes(FACING)).toBe(FACING);     // untouched, byte for byte
    expect(readFileSync('src/lib/caseContext.js', 'utf8')).toContain("from './meetingRecordSections.js'");
    // and the duplicate matcher is gone
    expect(readFileSync('src/lib/caseContext.js', 'utf8')).not.toContain('const advisorHeadingLevel');
  });
});

describe('the boundary holds at every payload surface', () => {
  it('GENERATION splits once, the moment the stream completes', () => {
    const i = appCode.indexOf('if(!fullRecord.trim()) throw new Error');
    const region = appCode.slice(i, i + 700);
    expect(region).toContain('const split = splitMeetingRecord(fullRecord);');
    expect(region).toContain('setReviewOutput(split.employeeFacing);');
    expect(region).toContain('setReviewOutputOriginal(split.employeeFacing);');
    expect(region).toContain('setAdvisorNotes(split.internal);');
  });

  it('DRAFT PERSISTENCE carries the internal half as its own field', () => {
    const draft = buildReviewDraft({
      record: FACING, recordOriginal: FACING, summary: 's', risk: null,
      advisorNotes: INTERNAL, transcript: [], now: '2026-09-25T12:00:00.000Z',
    });
    expect(draft.record).toBe(FACING);
    expect(draft.record).not.toContain('HR Advisor');
    expect(draft.advisorNotes).toBe(INTERNAL);
    expect(appCode).toContain('summary: meetingSummary, risk: riskScore, advisorNotes, transcript,');
  });

  it('EDIT RECORD edits the employee-facing half only', () => {
    // reviewOutput has held only that half since generation split it, and the
    // textarea binds to reviewOutput through the edit handler.
    expect(reviewCode).toContain('onChange={e=>(onEditReviewRecord||setReviewOutput)(e.target.value)}');
    expect(reviewCode).toContain('value={reviewOutput}');
    // the internal block is rendered separately and is NOT an input
    const i = reviewCode.indexOf('Internal Compass analysis');
    expect(i).toBeGreaterThan(-1);
    const block = reviewCode.slice(i - 400, i + 600);
    expect(block).toContain('advisorNotes');
    expect(block).not.toContain('<textarea');
    expect(block).not.toContain('onEditReviewRecord');
  });

  it('SAVE TO CASE persists the two payloads separately', () => {
    expect(appCode).toContain('record: splitMeetingRecord(reviewOutput).employeeFacing,');
    expect(appCode).toContain('advisorNotes: advisorNotes || splitMeetingRecord(reviewOutput).internal,');
    // the old mixed write is gone
    expect(appCode).not.toContain('      record: reviewOutput,\n      summary: meetingSummary,');
  });

  it('SIGNATURE PAYLOAD is employee-facing only, with the legacy cut as backup', () => {
    const i = appCode.indexOf('const sendForSignature = async (employeeEmail)');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('const full = splitMeetingRecord(signMeeting.record).employeeFacing;');
    expect(body).not.toContain('const full = signMeeting.record;');
    // the stored signDocument too
    expect(appCode).toContain('const full = splitMeetingRecord(reviewOutput).employeeFacing;');
  });

  it('a LEGACY mixed record cannot leak through the signature path', () => {
    // The 884 legacy meetings still carry both halves inline. Splitting at the
    // point of use — rather than trusting the stored shape — is what protects them.
    const legacySaved = { record: MIXED };
    expect(splitMeetingRecord(legacySaved.record).employeeFacing).toBe(FACING);
    expect(splitMeetingRecord(legacySaved.record).employeeFacing).not.toContain('Tribunal exposure');
  });

  it('a legacy mixed DRAFT is split on restore, not shown in the editor', () => {
    const i = appCode.indexOf('const existingDraft = restorableDraft(meeting);');
    const region = appCode.slice(i, i + 800);
    expect(region).toContain('const restored = splitMeetingRecord(existingDraft.record);');
    expect(region).toContain('setReviewOutput(restored.employeeFacing);');
    expect(region).toContain('setAdvisorNotes(existingDraft.advisorNotes || restored.internal);');
  });

  it('the provenance stub still carries no text of either kind', () => {
    const stub = supersedeReviewDraft(buildReviewDraft({
      record: FACING, recordOriginal: FACING, summary: 's', risk: null,
      advisorNotes: INTERNAL, transcript: [] }));
    expect(stub.record).toBeUndefined();
    expect(stub.advisorNotes).toBeUndefined();
    expect(stub.editedByUser).toBe(false);
  });
});

describe('the End-meeting quality check no longer blocks', () => {
  it('End goes straight to Review', () => {
    const i = appCode.indexOf('const attemptEndMeeting = () => {');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('setReviewGaps(computeMeetingQualityGaps());');
    expect(body).toContain('handleReview();');
    expect(body).not.toContain('setShowQualityCheck');
  });

  it('the blocking modal and its second confirmation are gone', () => {
    for (const gone of ['showQualityCheck', 'qualityCheckGaps', 'proceedPastQualityCheck',
                        'createQualityCheckFollowUp', 'MeetingQualityCheckModal']) {
      expect(appCode, gone).not.toContain(gone);
      expect(recordCode, gone).not.toContain(gone);
    }
    // and with them, two employee-name lookups that only existed to serve them
    expect(appCode).not.toContain('Ended meeting despite quality check gaps');
  });

  it('the detection itself is KEPT and surfaced in Review, non-blocking', () => {
    expect(appCode).toContain('const computeMeetingQualityGaps = () => {');
    expect(appCode).toContain('reviewGaps={reviewGaps}');
    expect(reviewCode).toContain('Worth checking before an outcome is decided');
  });

  it('End still persists the transcript and endedAt, and still transitions', () => {
    expect(appCode).toContain('patch: { endedAt: meetingEndTimeVal, transcript: allNotes }');
    expect(appCode).toContain('toStatus: MEETING_STATUS.REVIEW_DRAFT');
    expect(appCode).toContain('audit("Meeting ended"');
  });
});

describe('duplicate proposed updates', () => {
  const EV = 'Evidence previously submitted by the employee (nature/format unspecified)';

  it('THE BUG: the same item twice in ONE batch now yields one entry', () => {
    // The old guard seeded its seen-set from `existing` and never updated it, so
    // both copies passed. This is the exact string Walter saw twice.
    const out = mergeSuggestions([], [{ description: EV }, { description: EV }],
      m => ({ id: 'x', description: m.description, status: 'pending' }));
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe(EV);
  });

  it('presentation-only differences are treated as the same item', () => {
    expect(isSameSuggestion(EV, `Evidence: ${EV}`)).toBe(true);
    expect(isSameSuggestion(EV, `  ${EV.replace(/ /g, '  ')}  `)).toBe(true);
    expect(isSameSuggestion(EV, `${EV}.`)).toBe(true);
    expect(isSameSuggestion(EV, EV.toUpperCase())).toBe(true);
    expect(isSameSuggestion('Witness: Jo Smith', 'jo smith')).toBe(true);
  });

  it('genuinely distinct items are NOT collapsed', () => {
    expect(isSameSuggestion("the employee's payslip", 'a payslip')).toBe(false);
    expect(isSameSuggestion('CCTV from 3 March', 'CCTV from 4 March')).toBe(false);
    expect(isSameSuggestion('Jo Smith', 'Jo Smyth')).toBe(false);
    const out = mergeSuggestions([], [{ description: 'CCTV from 3 March' }, { description: 'CCTV from 4 March' }],
      m => ({ description: m.description }));
    expect(out).toHaveLength(2);
  });

  it('existing items always win, so a prior decision is not re-surfaced', () => {
    const existing = [{ id: 'e1', description: EV, status: 'dismissed' }];
    const out = mergeSuggestions(existing, [{ description: `Evidence: ${EV}` }], m => ({ description: m.description }));
    expect(out).toBe(existing);                 // same reference — no churn
    expect(out[0].status).toBe('dismissed');
  });

  it('empty and malformed input is safe', () => {
    expect(mergeSuggestions([], [], () => ({}))).toEqual([]);
    expect(mergeSuggestions(null, null, () => ({}))).toEqual([]);
    expect(mergeSuggestions([], [{ description: '' }, { }, null], () => ({ x: 1 }))).toEqual([]);
    expect(suggestionKey(null)).toBe('');
  });

  it('both merge sites use the shared primitive', () => {
    expect((appCode.match(/mergeSuggestions\(existing,/g) || []).length).toBe(2);
    expect(appCode).not.toContain('const known = new Set(existing.map(s=>s.description.trim().toLowerCase()));');
  });

  it('the Review gap list is deduped on the same key', () => {
    const i = appCode.indexOf('const computeMeetingQualityGaps = () => {');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toContain('suggestionKey(g)');
  });
});

// ── rendered Review ──
const noop = () => {};
const renderReview = (over = {}) => render(<ReviewScreen
  caseInfo={{ employee: 'Sam Patel', manager: 'Jane Smith', caseId: 'c1', meetingId: 'm1', date: '2026-10-04' }}
  meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} isHR
  cases={[{ id: 'c1', employeeName: 'Sam Patel', meetings: [{ id: 'm1', caseId: 'c1', type: 'Disciplinary', status: MEETING_STATUS.REVIEW_DRAFT }] }]}
  requestHrReview={noop} reviewOutput={FACING} reviewOutputOriginal={FACING} meetingSummary=""
  confirmDialog={noop} setShowShareModal={noop} saveMeetingToCase={noop} setScreen={noop}
  showToast={noop} askCompassInput="" setAskCompassInput={noop} askCompassHistory={[]}
  setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
  askCompassProcessing={false} editProcessing={false} editRecord={noop} editingRecord={false}
  setEditingRecord={noop} aiProcessing={false} aiError="" setReviewOutput={noop}
  setShowSignModal={noop} onSaveAndSendForSignature={noop} riskScore={null}
  reviewGenerationFailed={false} onRetryGeneration={noop} {...over} />);

describe('rendered Review keeps the two clearly apart', () => {
  it('internal analysis is labelled and shown outside the record', () => {
    renderReview({ advisorNotes: INTERNAL });
    expect(screen.getByText(/Internal Compass analysis · not part of the employee record/)).toBeInTheDocument();
    expect(screen.getByText(/Tribunal exposure is material/)).toBeInTheDocument();
  });

  it('nothing internal is rendered when there is none', () => {
    renderReview({ advisorNotes: '' });
    expect(screen.queryByText(/Internal Compass analysis/)).toBeNull();
  });

  it('the non-blocking gap list renders when there are gaps', () => {
    renderReview({ reviewGaps: ['Evidence mentioned but not yet actioned: a payslip'] });
    expect(screen.getByText('Worth checking before an outcome is decided')).toBeInTheDocument();
    expect(screen.getByText(/a payslip/)).toBeInTheDocument();
  });

  it('no gap list when there are none', () => {
    renderReview({ reviewGaps: [] });
    expect(screen.queryByText('Worth checking before an outcome is decided')).toBeNull();
  });

  it('the editable record shows only the employee-facing text', () => {
    renderReview({ advisorNotes: INTERNAL, editingRecord: true });
    const ta = screen.getByLabelText('Meeting record');
    expect(ta.value).toBe(FACING);
    expect(ta.value).not.toContain('HR Advisor');
    expect(ta.value).not.toContain('Tribunal exposure');
  });
});
