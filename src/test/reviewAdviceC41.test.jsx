import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import { neutraliseSummaryHeadings, processConsiderations, adviceSections } from '../lib/reviewAdvice.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C4.1 — the advisory rail says what it actually knows.
//
// Production UAT: the rail reported "LOW tribunal risk" as a coloured verdict
// while the analysis beside it said the subject matter, the evidence and the
// employee's account were all unresolved. A three-state judgement about legal
// exposure is the single most conclusive thing that can appear on this screen,
// and incomplete information cannot support it.
//
// Presentation only. The rating is still generated, still shaped
// {rating, summary, historyContext}, still persisted, and every other consumer
// (Dashboard, ER report, meetings badge, caseStage, CSV/PDF export) is
// untouched — as is the generation prompt and its epistemic contract.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};

const base = {
  caseInfo: { employee: 'Sam Employee', manager: 'Alex Chair', date: '02/10/2026' },
  meetingType: { label: 'Investigation' },
  isHR: true,
  requestHrReview: noop,
  reviewOutput: '## Meeting Dialogue\nAC: Thank you for attending.',
  reviewOutputOriginal: '## Meeting Dialogue\nAC: Thank you for attending.',
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

const PROSE = 'The policy communication point is unresolved and the employee has not yet given an account.';
const openAdvice = async () => userEvent.click(screen.getByRole('tab', { name: 'Advice' }));

describe('C4.1 — no tribunal-risk verdict in the normal Review rail', () => {
  it.each(['LOW', 'MEDIUM', 'HIGH'])('does not render a %s verdict', async rating => {
    render(<ReviewScreen {...base} riskScore={{ rating, summary: PROSE }} />);
    await openAdvice();
    expect(screen.queryByText(rating)).not.toBeInTheDocument();
    expect(screen.queryByText(/tribunal risk/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(new RegExp(`${rating}\\s*tribunal`, 'i'));
  });

  it('keeps the useful underlying analysis', async () => {
    render(<ReviewScreen {...base} riskScore={{ rating: 'LOW', summary: PROSE }} />);
    await openAdvice();
    expect(screen.getByText(new RegExp(PROSE.slice(0, 40)))).toBeInTheDocument();
    expect(screen.getByText('Process considerations')).toBeInTheDocument();
  });

  it('applies no traffic-light colour to the advisory content', async () => {
    render(<ReviewScreen {...base} riskScore={{ rating: 'HIGH', summary: PROSE }} />);
    await openAdvice();
    const aside = document.querySelector('aside[aria-label="Compass support"]');
    const verdictColoured = [...aside.querySelectorAll('*')].filter(el => {
      const c = getComputedStyle(el).color;
      // the red / amber / green semantic tokens, used as a rating colour
      return /rgb\(194,\s*38,\s*27\)|rgb\(138,\s*90,\s*0\)|rgb\(11,\s*107,\s*74\)/.test(c);
    });
    expect(verdictColoured).toEqual([]);
  });

  it('says plainly when an incomplete record makes the assessment provisional', async () => {
    render(<ReviewScreen {...base} riskScore={{ rating: 'LOW', summary: PROSE }}
      reviewGaps={['The employee account has not been obtained.']} />);
    await openAdvice();
    expect(screen.getByText(/still incomplete, so anything below is provisional/i)).toBeInTheDocument();
    // and the deterministic gap list is still the gap list
    expect(screen.getByText('Worth checking before an outcome is decided')).toBeInTheDocument();
  });

  it('reports a failed assessment instead of showing a rating word', async () => {
    render(<ReviewScreen {...base} riskScore={{ rating: 'UNKNOWN', summary: 'Could not assess.' }} />);
    await openAdvice();
    expect(screen.getByText(/Compass could not assess this record/i)).toBeInTheDocument();
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument();
  });

  it('does not title the explainer with a verdict either', async () => {
    render(<ReviewScreen {...base} riskScore={{ rating: 'HIGH', summary: PROSE }} />);
    await openAdvice();
    await userEvent.click(screen.getByRole('button', { name: 'Ask why' }));
    expect(screen.queryByText(/Risk assessment: HIGH/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Process considerations/).length).toBeGreaterThan(0);
  });

  it('keeps the organisation-history context available', async () => {
    render(<ReviewScreen {...base} riskScore={{ rating: 'LOW', summary: PROSE, historyContext: 'Two similar cases closed informally.' }} />);
    await openAdvice();
    expect(screen.getByText(/Two similar cases closed informally/)).toBeInTheDocument();
  });
});

describe('C4.1 — processConsiderations keeps compatibility while refusing a verdict', () => {
  it('returns the rating for other consumers but never authorises showing it', () => {
    const c = processConsiderations({ riskScore: { rating: 'HIGH', summary: 'x' } });
    expect(c.rating).toBe('HIGH');
    expect(c.showVerdict).toBe(false);
  });

  it('marks an incomplete record provisional', () => {
    const c = processConsiderations({ riskScore: { rating: 'LOW', summary: 'x' }, reviewGaps: ['missing'] });
    expect(c.unassessable).toMatch(/provisional/);
  });

  it('treats UNKNOWN as a failure, not as an assessment', () => {
    const c = processConsiderations({ riskScore: { rating: 'UNKNOWN', summary: 'Could not assess.' } });
    expect(c.prose).toBe('');
    expect(c.unassessable).toMatch(/could not assess/i);
  });

  it('has nothing to show when there is nothing', () => {
    expect(processConsiderations({}).hasContent).toBe(false);
  });
});

describe('C4.1 — tab labels are labels, not version numbers', () => {
  it('renders Summary / Advice / Ask with no counts appended', () => {
    render(<ReviewScreen {...base} meetingSummary="a triage read" advisorNotes="some advice."
      reviewGaps={['a', 'b']} askCompassHistory={[{ role: 'user', content: 'q' }]} />);
    const labels = screen.getAllByRole('tab').map(t => t.textContent.trim());
    expect(labels).toEqual(['Summary', 'Advice', 'Ask']);
    labels.forEach(l => expect(l).not.toMatch(/\d/));
  });
});

describe('C4.1 — advisory content must not masquerade as mandatory', () => {
  it('renames the generated "Actions Required" heading in the summary', () => {
    const md = '## Key Facts Established\nSomething.\n\n## Actions Required\nConfirm the policy.';
    render(<ReviewScreen {...base} meetingSummary={md} />);
    expect(screen.getByText('Things to check')).toBeInTheDocument();
    expect(screen.queryByText('Actions Required')).not.toBeInTheDocument();
  });

  it('renames tolerantly, at any heading level and either phrasing', () => {
    expect(neutraliseSummaryHeadings('### ACTIONS REQUIRED')).toBe('### Things to check');
    expect(neutraliseSummaryHeadings('## Required Actions')).toBe('## Things to check');
    expect(neutraliseSummaryHeadings('# Action Required')).toBe('# Things to check');
  });

  it('leaves every other heading exactly alone', () => {
    const md = '## Key Facts Established\n## Outstanding Questions\n## Disputed Points';
    expect(neutraliseSummaryHeadings(md)).toBe(md);
  });

  it('does not touch body text that merely mentions the words', () => {
    const md = 'The actions required by the policy were explained.';
    expect(neutraliseSummaryHeadings(md)).toBe(md);
  });
});

describe('C4.1 — the advisory narrative is scannable without a second surface', () => {
  it('separates check-verb sentences from the narrative', () => {
    const notes = 'The policy point is unresolved. Confirm whether the policy was communicated. Check the induction records.';
    const parts = adviceSections(notes);
    expect(parts).toHaveLength(2);
    expect(parts[0].prose).toBe('The policy point is unresolved.');
    expect(parts[1].title).toBe('Before you continue');
    expect(parts[1].items).toEqual([
      'Confirm whether the policy was communicated.',
      'Check the induction records.',
    ]);
  });

  it('does NOT force headings onto prose that does not support them', () => {
    const notes = 'This was a straightforward meeting and nothing further arises from it.';
    const parts = adviceSections(notes);
    expect(parts).toHaveLength(1);
    expect(parts[0].title).toBeNull();
    expect(parts[0].prose).toBe(notes);
  });

  // The actual scannability win. HR Advisor Notes is generated as one flowing
  // paragraph and, measured on a real production record, contains no check-verb
  // sentence at all — so grouping is inert on this field and segmentation is
  // what does the work. MDRenderer gives each line its own paragraph.
  it('segments a wall of prose into one paragraph per sentence', () => {
    const wall = 'The record confirms the opening information was given. '
      + 'The transcript does not capture the substantive questions. '
      + 'No assessment of outcome can appropriately be made at this point.';
    const [part] = adviceSections(wall);
    expect(part.prose.split('\n')).toEqual([
      'The record confirms the opening information was given.',
      'The transcript does not capture the substantive questions.',
      'No assessment of outcome can appropriately be made at this point.',
    ]);
  });

  it('segments without altering a single word', () => {
    const wall = 'One sentence here. Another sentence there.';
    const [part] = adviceSections(wall);
    expect(part.prose.replace(/\n/g, ' ')).toBe(wall);
  });

  it('leaves already-structured advice exactly as the model wrote it', () => {
    const notes = '## Procedural points\nConfirm the policy.';
    const parts = adviceSections(notes);
    expect(parts).toHaveLength(1);
    expect(parts[0].prose).toBe(notes);
    // and no heading of ours bolted on top of the model's own structure —
    // without this the forced-title mutation survives
    expect(parts[0].title).toBeNull();
    expect(parts[0].items).toEqual([]);
  });

  it('returns nothing for nothing', () => {
    expect(adviceSections('')).toEqual([]);
    expect(adviceSections(null)).toEqual([]);
  });

  // ── THE SHAPE THIS FUNCTION IS ACTUALLY GIVEN ──
  //
  // splitMeetingRecord hands back the advisory half INCLUDING its own heading
  // line, so every real value starts with "## HR Advisor Notes". Opening a real
  // production record showed the split never ran, because that heading was
  // being read as "the model structured this". The fixtures below are the
  // production shape, not bare prose.
  it('splits the REAL advisory payload, which always leads with its own heading', () => {
    const real = '## HR Advisor Notes\n\nThe transcript is limited to the opening formalities. '
      + 'Confirm the substantive questions were put to the employee. Check the evidence gathered.';
    const parts = adviceSections(real);
    expect(parts).toHaveLength(2);
    expect(parts[0].prose).toBe('The transcript is limited to the opening formalities.');
    expect(parts[1].title).toBe('Before you continue');
    expect(parts[1].items).toEqual([
      'Confirm the substantive questions were put to the employee.',
      'Check the evidence gathered.',
    ]);
  });

  it('does not repeat the section heading inside a block the rail already labels', () => {
    const real = '## HR Advisor Notes\n\nNothing further arises.';
    const parts = adviceSections(real);
    expect(parts).toHaveLength(1);
    expect(parts[0].prose).toBe('Nothing further arises.');
    expect(parts[0].prose).not.toMatch(/HR Advisor/);
  });

  it('accepts the British spelling and any heading level', () => {
    expect(adviceSections('### HR Adviser Notes\nNothing further arises.')[0].prose)
      .toBe('Nothing further arises.');
  });

  it('still leaves genuine sub-structure beneath that heading alone', () => {
    const real = '## HR Advisor Notes\n\n### Procedural\nConfirm the policy.';
    const parts = adviceSections(real);
    expect(parts).toHaveLength(1);
    expect(parts[0].title).toBeNull();
    expect(parts[0].prose).toBe('### Procedural\nConfirm the policy.');
  });

  it('renders the split for a real payload on the screen', async () => {
    const real = '## HR Advisor Notes\n\nThe transcript is limited. Confirm the substantive questions were put.';
    render(<ReviewScreen {...base} advisorNotes={real} />);
    await openAdvice();
    expect(screen.getByText('Before you continue')).toBeInTheDocument();
    expect(screen.getByText('Confirm the substantive questions were put.')).toBeInTheDocument();
    expect(screen.queryByText('HR Advisor Notes')).not.toBeInTheDocument();
  });

  it('renders inside the one support rail, adding no competing surface', async () => {
    render(<ReviewScreen {...base}
      advisorNotes="The policy point is unresolved. Confirm whether the policy was communicated."
      riskScore={{ rating: 'LOW', summary: PROSE }} />);
    await openAdvice();
    expect(document.querySelectorAll('aside[aria-label="Compass support"]')).toHaveLength(1);
    const aside = document.querySelector('aside[aria-label="Compass support"]');
    expect(aside.contains(screen.getByText('Before you continue'))).toBe(true);
    expect(aside.contains(screen.getByText('Process considerations'))).toBe(true);
    // one card inside the rail, not several
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
  });
});

describe('C4.1 — the C4 hierarchy and boundaries are unchanged', () => {
  it('keeps the record dominant: the record precedes the Ask input', () => {
    render(<ReviewScreen {...base} />);
    const record = screen.getByText(/Thank you for attending/);
    const ask = screen.getByLabelText('Ask Compass or edit the record');
    expect(record.compareDocumentPosition(ask) & 4).toBeTruthy();
  });

  it('gives the record the flexible column and the rail a fixed, narrower one', () => {
    const { container } = render(<ReviewScreen {...base} riskScore={{ rating: 'LOW', summary: PROSE }} />);
    const grid = [...container.querySelectorAll('div')]
      .find(el => (el.style.gridTemplateColumns || '').includes('fr'));
    expect(grid).toBeTruthy();
    const [first, second] = grid.style.gridTemplateColumns.split(/\s+/);
    expect(first).toBe('1fr');          // the record
    expect(second).toMatch(/^\d+px$/);  // the rail, fixed and subordinate
  });

  it('keeps the rail hideable, leaving the record usable', async () => {
    render(<ReviewScreen {...base} riskScore={{ rating: 'LOW', summary: PROSE }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide Compass support' }));
    expect(document.querySelector('aside[aria-label="Compass support"]')).toBeNull();
    expect(screen.getByText(/Thank you for attending/)).toBeInTheDocument();
  });

  it('never lets process analysis into the editable employee record', () => {
    render(<ReviewScreen {...base} editingRecord={true}
      advisorNotes="Confirm the policy." riskScore={{ rating: 'HIGH', summary: PROSE }} />);
    const value = screen.getByLabelText('Meeting record').value;
    expect(value).not.toContain('Confirm the policy');
    expect(value).not.toContain(PROSE);
    expect(value).not.toMatch(/HIGH/);
  });

  it('hides the advisory rail content while the record is being edited', async () => {
    render(<ReviewScreen {...base} editingRecord={true} riskScore={{ rating: 'LOW', summary: PROSE }} />);
    expect(screen.queryByText(new RegExp(PROSE.slice(0, 30)))).not.toBeInTheDocument();
  });

  it('leaves signature gating untouched', () => {
    const { unmount } = render(<ReviewScreen {...base} signatureEligible={false} onSaveAndSendForSignature={noop} />);
    expect(screen.getByRole('button', { name: /Save & send for signature/ })).toBeInTheDocument();
    unmount();
    render(<ReviewScreen {...base} signatureEligible={true} />);
    expect(screen.getByRole('button', { name: /Send for signature/ })).toBeInTheDocument();
  });

  it('leaves draft persistence indicators untouched and outside the rail', () => {
    render(<ReviewScreen {...base} draftStatus="saved" riskScore={{ rating: 'LOW', summary: PROSE }} />);
    const aside = document.querySelector('aside[aria-label="Compass support"]');
    expect(aside.contains(screen.getByText('Draft saved'))).toBe(false);
  });
});
