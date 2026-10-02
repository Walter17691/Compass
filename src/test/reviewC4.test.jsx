import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import {
  REVIEW_SUPPORT, reviewSupportCounts, defaultReviewSupport, proposedUpdates,
} from '../lib/reviewSupport.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C4 — Review is the employee-facing record, not an AI console.
//
// Ten surfaces rendered at once and the AI prompt box sat ABOVE the record, so
// the first thing a reviewer met was an input. Four advisory generations each
// had a card, two of them rendering the same advisory text twice.
//
// And one real defect underneath the clutter: the record BODY was truncated at
// the first of eight hand-listed headings while the FULL text is what gets
// saved, confirmed and signed — so a reviewer could sign a record containing
// text this screen never showed them.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};

const base = {
  caseInfo: { employee: 'Sam Employee', manager: 'Alex Chair', date: '02/10/2026' },
  meetingType: { label: 'Investigation' },
  isHR: true,
  requestHrReview: noop,
  reviewOutput: '## Meeting Details\nHeld on 2 October.\n\n## Meeting Dialogue\nAC: Thank you for attending.',
  reviewOutputOriginal: '## Meeting Details\nHeld on 2 October.\n\n## Meeting Dialogue\nAC: Thank you for attending.',
  meetingSummary: '',
  confirmDialog: noop,
  setShowShareModal: noop,
  saveMeetingToCase: noop,
  setScreen: noop,
  showToast: noop,
  askCompassInput: '',
  setAskCompassInput: noop,
  askCompassHistory: [],
  setAskCompassHistory: noop,
  askCompass: noop,
  setAskCompassProcessing: noop,
  askCompassProcessing: false,
  editProcessing: false,
  editRecord: noop,
  editingRecord: false,
  setEditingRecord: noop,
  aiProcessing: false,
  aiError: '',
  setReviewOutput: noop,
  setShowSignModal: noop,
  riskScore: null,
  reviewGenerationFailed: false,
  onRetryGeneration: noop,
};

const INTERNAL = 'Confirm whether the vehicle policy was communicated before the incident.';

describe('reviewSupport — grouping the advisory surfaces', () => {
  it('counts each category from what the screen was already given', () => {
    const c = reviewSupportCounts({
      meetingSummary: 'short triage read',
      advisorNotes: INTERNAL,
      reviewGaps: ['no notetaker named', 'evidence not yet gathered'],
      riskScore: { rating: 'LOW' },
      askCompassHistory: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }],
    });
    expect(c[REVIEW_SUPPORT.SUMMARY]).toBe(1);
    expect(c[REVIEW_SUPPORT.ADVICE]).toBe(4);   // notes + 2 gaps + risk
    expect(c[REVIEW_SUPPORT.ASK]).toBe(1);      // user turns only
  });

  it('treats whitespace-only advisory text as nothing to show', () => {
    const c = reviewSupportCounts({ meetingSummary: '   ', advisorNotes: '\n' });
    expect(c[REVIEW_SUPPORT.SUMMARY]).toBe(0);
    expect(c[REVIEW_SUPPORT.ADVICE]).toBe(0);
  });

  it('opens on Summary, then Advice, then Ask — never to maximise content', () => {
    expect(defaultReviewSupport({ summary: 1, advice: 9, ask: 0 })).toBe(REVIEW_SUPPORT.SUMMARY);
    expect(defaultReviewSupport({ summary: 0, advice: 1, ask: 0 })).toBe(REVIEW_SUPPORT.ADVICE);
    expect(defaultReviewSupport({ summary: 0, advice: 0, ask: 0 })).toBe(REVIEW_SUPPORT.ASK);
  });

  it('never opens on a risk rating nobody asked for when a summary exists', () => {
    const c = reviewSupportCounts({ meetingSummary: 's', riskScore: { rating: 'HIGH' } });
    expect(defaultReviewSupport(c)).toBe(REVIEW_SUPPORT.SUMMARY);
  });
});

describe('proposedUpdates — a decision queue, not advice', () => {
  const ev = [
    { id: 'e1', status: 'pending', description: 'a payslip', kind: 'evidence' },
    { id: 'e2', status: 'accepted', applied: false, description: 'a rota', kind: 'evidence' },
    { id: 'e3', status: 'accepted', applied: true, description: 'already created', kind: 'evidence' },
  ];
  const ac = [{ id: 'a1', status: 'pending', description: 'check the rota' }];

  it('separates what the user still owes a decision on from what is informational', () => {
    const u = proposedUpdates({ evidenceSuggestions: ev, actionSuggestions: ac });
    expect(u.pendingEvidence.map(s => s.id)).toEqual(['e1']);
    expect(u.pendingActions.map(s => s.id)).toEqual(['a1']);
    expect(u.decided.map(s => s.id)).toEqual(['e2']);     // accepted but not yet applied
    expect(u.awaitingDecision).toBe(2);
    expect(u.total).toBe(3);
  });

  it('an already-applied item is neither pending nor shown again', () => {
    const u = proposedUpdates({ evidenceSuggestions: [ev[2]] });
    expect(u.total).toBe(0);
  });
});

describe('C4 — the record is the screen', () => {
  it('renders the employee-facing record', () => {
    render(<ReviewScreen {...base} />);
    expect(screen.getByText(/Thank you for attending/)).toBeInTheDocument();
  });

  it('puts the record BEFORE the Ask Compass input in the document', () => {
    render(<ReviewScreen {...base} />);
    const record = screen.getByText(/Thank you for attending/);
    const ask = screen.getByLabelText('Ask Compass or edit the record');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4: `ask` comes after `record`
    expect(record.compareDocumentPosition(ask) & 4).toBeTruthy();
  });

  // ── THE DEFECT ──
  it('does NOT truncate the record at a heading the old allow-list did not know', () => {
    const withNotes =
      '## Meeting Details\nHeld on 2 October.\n\n## Notes\nAgreed to review on Friday.';
    render(<ReviewScreen {...base} reviewOutput={withNotes} reviewOutputOriginal={withNotes} />);
    // previously everything from "## Notes" onwards vanished from the screen
    // while remaining in the record that gets confirmed and signed
    expect(screen.getByText(/Agreed to review on Friday/)).toBeInTheDocument();
  });

  it.each(['## Summary', '## Outcome', '## Next Steps', '## Actions', '## Key Points', '## Recommendations'])(
    'shows record content following %s',
    heading => {
      const text = `## Meeting Dialogue\nAC: Noted.\n\n${heading}\nThe agreed wording is final.`;
      render(<ReviewScreen {...base} reviewOutput={text} reviewOutputOriginal={text} />);
      expect(screen.getByText(/The agreed wording is final/)).toBeInTheDocument();
    }
  );

  it('shows the reviewer exactly the text the editable record holds', async () => {
    const text = '## Meeting Dialogue\nAC: Noted.\n\n## Notes\nCarried over.';
    const { unmount } = render(<ReviewScreen {...base} reviewOutput={text} reviewOutputOriginal={text} />);
    const displayed = screen.getByText(/Carried over/);
    expect(displayed).toBeInTheDocument();
    unmount();
    // the same string, in the editable surface, is the full record
    render(<ReviewScreen {...base} reviewOutput={text} reviewOutputOriginal={text} editingRecord={true} />);
    expect(screen.getByLabelText('Meeting record')).toHaveValue(text);
  });
});

describe('C4 — one secondary support surface', () => {
  it('renders exactly one Compass support region', () => {
    render(<ReviewScreen {...base} meetingSummary="triage read" />);
    expect(document.querySelectorAll('aside[aria-label="Compass support"]')).toHaveLength(1);
  });

  it('groups the advisory surfaces into Summary / Advice / Ask', () => {
    render(<ReviewScreen {...base} meetingSummary="triage read" />);
    const tabs = screen.getAllByRole('tab').map(t => t.textContent.replace(/\s*\d+$/, '').trim());
    expect(tabs).toEqual(['Summary', 'Advice', 'Ask']);
  });

  it('shows one category at a time — advice cannot co-render with the summary', async () => {
    render(
      <ReviewScreen {...base} meetingSummary="the triage read" advisorNotes={INTERNAL}
        reviewGaps={['no notetaker named']} riskScore={{ rating: 'HIGH', summary: 'material' }} />
    );
    // defaults to Summary
    expect(screen.getByText(/the triage read/)).toBeInTheDocument();
    expect(screen.queryByText(INTERNAL)).not.toBeInTheDocument();
    expect(screen.queryByText('HIGH')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Advice/ }));
    expect(screen.getByText(INTERNAL)).toBeInTheDocument();
    expect(screen.queryByText(/the triage read/)).not.toBeInTheDocument();
  });

  it('keeps the old three rail panels from ever being simultaneous again', async () => {
    render(
      <ReviewScreen {...base} meetingSummary="the triage read" advisorNotes={INTERNAL}
        askCompassHistory={[{ role: 'assistant', content: 'an answer from Compass' }]} />
    );
    const simultaneous = [/the triage read/, new RegExp(INTERNAL.slice(0, 20)), /an answer from Compass/]
      .filter(re => screen.queryByText(re));
    expect(simultaneous).toHaveLength(1);
  });

  it('can be hidden entirely, leaving the record', async () => {
    render(<ReviewScreen {...base} meetingSummary="triage read" />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide Compass support' }));
    expect(document.querySelector('aside[aria-label="Compass support"]')).toBeNull();
    expect(screen.getByText(/Thank you for attending/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show Compass support/ })).toBeInTheDocument();
  });

  it('the risk rating is not permanently on screen', () => {
    render(<ReviewScreen {...base} meetingSummary="triage read" riskScore={{ rating: 'HIGH', summary: 'material' }} />);
    expect(screen.queryByText('HIGH')).not.toBeInTheDocument();
  });

  it('renders the advisory text only once', async () => {
    render(<ReviewScreen {...base} advisorNotes={INTERNAL} />);
    expect(screen.getAllByText(new RegExp(INTERNAL.slice(0, 30)))).toHaveLength(1);
    expect(screen.getAllByText(/Internal Compass analysis/)).toHaveLength(1);
  });
});

describe('C4 — employee-facing vs internal', () => {
  it('labels the internal analysis as outside the employee record', async () => {
    render(<ReviewScreen {...base} advisorNotes={INTERNAL} />);
    expect(screen.getByText(/Internal Compass analysis · not part of the employee record/)).toBeInTheDocument();
  });

  it('never puts internal analysis inside the editable record', () => {
    render(<ReviewScreen {...base} advisorNotes={INTERNAL} editingRecord={true} />);
    expect(screen.getByLabelText('Meeting record').value).not.toContain('vehicle policy');
  });

  it('does not render internal analysis or gaps while the record is being edited', () => {
    render(<ReviewScreen {...base} advisorNotes={INTERNAL} reviewGaps={['no notetaker named']} editingRecord={true} />);
    expect(screen.queryByText(INTERNAL)).not.toBeInTheDocument();
    expect(screen.queryByText(/Worth checking before an outcome is decided/)).not.toBeInTheDocument();
  });
});

describe('C4 — proposed updates stay a visible decision', () => {
  const ev = [{ id: 'e1', status: 'pending', description: 'a payslip', kind: 'evidence' }];

  it('is not filed inside the support rail', () => {
    render(<ReviewScreen {...base} meetingSummary="triage read" meetingEvidenceSuggestions={ev}
      onAcceptMeetingEvidenceSuggestion={noop} onDismissMeetingEvidenceSuggestion={noop} />);
    const aside = document.querySelector('aside[aria-label="Compass support"]');
    expect(screen.getByText(/a payslip/)).toBeInTheDocument();
    expect(aside.contains(screen.getByText(/a payslip/))).toBe(false);
  });

  it('is absent entirely when there is nothing proposed', () => {
    render(<ReviewScreen {...base} />);
    expect(screen.queryByText(/Compass proposes these updates/)).not.toBeInTheDocument();
  });

  it('creates nothing on its own — approval is an explicit click', async () => {
    const accept = vi.fn();
    render(<ReviewScreen {...base} meetingEvidenceSuggestions={ev}
      onAcceptMeetingEvidenceSuggestion={accept} onDismissMeetingEvidenceSuggestion={noop} />);
    expect(accept).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(accept).toHaveBeenCalledTimes(1);
  });
});

describe('C4 — nothing lost from the lifecycle surface', () => {
  it('keeps draft status beside the record rather than in a tab', () => {
    render(<ReviewScreen {...base} draftStatus="saved" meetingSummary="triage read" />);
    const aside = document.querySelector('aside[aria-label="Compass support"]');
    const status = screen.getByText('Draft saved');
    expect(aside.contains(status)).toBe(false);
  });

  it('still gates signature on eligibility, not on generated text existing', () => {
    const { unmount } = render(<ReviewScreen {...base} signatureEligible={false} onSaveAndSendForSignature={noop} />);
    expect(screen.getByRole('button', { name: /Save & send for signature/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send for signature/ })).not.toBeInTheDocument();
    unmount();
    render(<ReviewScreen {...base} signatureEligible={true} />);
    expect(screen.getByRole('button', { name: /Send for signature/ })).toBeInTheDocument();
  });

  it('offers neither send path for a standalone record', () => {
    render(<ReviewScreen {...base} standalone={true} />);
    expect(screen.queryByRole('button', { name: /signature/i })).not.toBeInTheDocument();
    expect(screen.getByText(/can't be confirmed or sent for signature yet/)).toBeInTheDocument();
  });

  it('keeps Save disabled until there is a record to save', () => {
    render(<ReviewScreen {...base} reviewOutput="" reviewOutputOriginal="" />);
    expect(screen.getByRole('button', { name: 'Save to case' })).toBeDisabled();
  });

  it('keeps the generation failure path and the manual escape', () => {
    render(<ReviewScreen {...base} reviewOutput="" reviewGenerationFailed={true} />);
    expect(screen.getByText('Compass AI could not generate the meeting record')).toBeInTheDocument();
    expect(screen.getByText(/Your meeting notes have been kept/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write manually' })).toBeInTheDocument();
  });
});

// ── Carried forward from C3 human UAT, as a verification item ──
//
// "The refreshed meeting displayed 'Nothing captured yet'. Verify that persisted
// captured notes survive reload and are carried correctly into Review."
//
// They do, on both record routes, and the empty one was genuinely empty
// (transcript_len 0 in the database, against a sibling meeting with three notes
// that rendered correctly on production). App.jsx has no render harness, so the
// carry is pinned structurally here, in this repo's existing convention.
describe('C4 — captured notes survive reload and reach Review', () => {
  const app = readFileSync('src/App.jsx', 'utf8');

  it('the standalone record route restores the server transcript on reopen', () => {
    const i = app.indexOf('const applyStandaloneMeetingToLive');
    const body = app.slice(i, i + 1600);
    expect(body).toContain('const notes = Array.isArray(meeting.transcript) ? meeting.transcript : [];');
    expect(body).toContain('setTranscript(notes)');
  });

  it('the case-embedded record route restores the server transcript on resume', () => {
    const i = app.indexOf('const resumeMeeting');
    const body = app.slice(i, i + 1600);
    expect(body).toContain('setTranscript(Array.isArray(meeting.transcript) ? meeting.transcript : [])');
  });

  it('End carries the notes INCLUDING the uncommitted composer line', () => {
    expect(app).toContain('const allNotes = [...transcript, ...extra];');
    expect(app).toContain('patch: { endedAt: meetingEndTimeVal, transcript: allNotes }');
  });

  it('End persists the notes for a table-resident meeting too, not just an embedded one', () => {
    const i = app.indexOf('const ended = await endStandaloneMeeting(supabase, {');
    expect(i).toBeGreaterThan(-1);
    expect(app.slice(i, i + 220)).toContain('transcript: allNotes,');
  });

  it('reopening Review restores the persisted draft without regenerating over it', () => {
    expect(app).toContain('const existingDraft = restorableDraft(meeting);');
    expect(app).toContain('setReviewOutput(restored.employeeFacing)');
  });
});

describe('C4 — no new machinery, and the frozen palette', () => {
  it('introduces no score, percentage or readiness language', () => {
    const { container } = render(
      <ReviewScreen {...base} meetingSummary="triage read" advisorNotes={INTERNAL}
        reviewGaps={['no notetaker named']} riskScore={{ rating: 'LOW', summary: 'ok' }} />
    );
    expect(container.textContent).not.toMatch(/readiness|completion score|quality score|% complete|progress/i);
  });

  it('uses the cool token palette, never the retired cream or DM Sans', () => {
    const { container } = render(<ReviewScreen {...base} meetingSummary="triage read" draftStatus="saved" />);
    // MDRenderer subtrees are EXCLUDED, and deliberately so rather than
    // silently: that component is still on the pre-token palette (DM Sans,
    // #7C5CFC, #1A1535) and is shared by twelve non-test consumers including
    // the frozen C3 RecordScreen, C2 PrepScreen and Wave B CaseViewScreen.
    // Restyling it is a broad visual change across frozen surfaces and is
    // reported for a separate decision, not taken as a side effect of C4.
    // Identified by the exact inline fontFamily MDRenderer sets on its root.
    // jsdom normalises the inline value to `"DM Sans", system-ui, sans-serif`,
    // quotes included, so this matches rather than startsWith.
    const mdRoots = [...container.querySelectorAll('div')]
      .filter(el => /DM Sans/.test(el.style.fontFamily || ''));
    const insideMarkdown = el => mdRoots.some(root => root.contains(el));
    const warm = [...container.querySelectorAll('*')].filter(el => !insideMarkdown(el)).filter(el => {
      const cs = getComputedStyle(el);
      const colours = [cs.backgroundColor, cs.color, cs.borderTopColor, cs.borderBottomColor,
        cs.borderLeftColor, cs.borderRightColor].join(' ');
      return /253,\s*250,\s*245|255,\s*249,\s*240|232,\s*224,\s*208|237,\s*229,\s*216/.test(colours)
        || /DM Sans|DM Serif/i.test(cs.fontFamily);
    });
    expect(warm).toEqual([]);
  });

  it('keeps the record printable', () => {
    const { container } = render(<ReviewScreen {...base} />);
    expect(container.querySelector('.print-area')).toBeTruthy();
  });
});
