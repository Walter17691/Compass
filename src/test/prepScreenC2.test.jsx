import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrepScreen } from '../screens/PrepScreen.jsx';
import { MEETING_TYPES } from '../constants.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE C2 — preparation, rendered.
//
// The screen opened "Tell Compass about this meeting" with "Generate prep pack"
// as the filled primary, while the actual lifecycle action was a small
// underlined "Skip prep and start meeting now" — framing preparation as
// compulsory and starting as an escape hatch. Preparation is metadata.
//
// These render and interact. Source-string assertions appear only where the
// claim IS about source (that the module performs no transition), and then with
// comments stripped, because the screen's own documentation names the things it
// deliberately does not do.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};
const INVESTIGATION = MEETING_TYPES.find(t => /investigation/i.test(t.label)) || MEETING_TYPES[0];
const DISCIPLINARY = MEETING_TYPES.find(t => /disciplinary/i.test(t.label) && t.group === 'formal') || MEETING_TYPES[1];
const APPEAL = MEETING_TYPES.find(t => t.group === 'appeal') || MEETING_TYPES[2];

const props = (over = {}) => ({
  beginMeeting: vi.fn().mockResolvedValue({ ok: true }),
  meetingType: INVESTIGATION,
  setMeetingType: noop,
  caseInfo: { employee: 'Sam Employee', employeeId: 'u-sam', manager: 'Alex Manager', date: '2026-10-09', context: '' },
  setCaseInfo: noop,
  employeeRecords: [],
  handlePrepare: vi.fn(),
  aiProcessing: false,
  aiError: '',
  setScreen: noop,
  bgDoc: null,
  setBgDoc: noop,
  prepNotes: '',
  prepQuestions: [],
  linkedCaseAllegations: [],
  linkedCaseEvidence: [],
  onAddPrepQuestion: noop,
  onUpdatePrepQuestionText: noop,
  onRemovePrepQuestion: noop,
  onMovePrepQuestion: noop,
  onTogglePrepQuestionEssential: noop,
  onLinkPrepQuestionToAllegation: noop,
  onLinkPrepQuestionToEvidence: noop,
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C2 — one primary action, and it is the lifecycle one', () => {
  it('Start meeting is the primary, and exists without any prep pack', () => {
    render(<PrepScreen {...props({ prepNotes: '' })} />);
    expect(screen.getByRole('button', { name: 'Start meeting' })).toBeEnabled();
  });

  it('the old "skip prep" framing is gone', () => {
    // Preparation is optional metadata, so "skip" was the wrong word for it.
    render(<PrepScreen {...props()} />);
    expect(screen.queryByText(/Skip prep/i)).not.toBeInTheDocument();
  });

  it('the AI action no longer outranks it', () => {
    render(<PrepScreen {...props()} />);
    // Generating suggestions sits inside the support disclosure, not on the surface.
    expect(screen.queryByRole('button', { name: /Suggest questions/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start meeting' })).toBeInTheDocument();
  });

  it('there is exactly ONE primary-weight action, whatever it is labelled', () => {
    // Counting "Start meeting" buttons was not enough: a DIFFERENT filled action
    // (a second Generate prep pack, say) would compete with it and go unnoticed.
    // So count the primary TREATMENT — the filled brand fill — not the label.
    const { container } = render(<PrepScreen {...props({ prepNotes: '# Pack' })} />);
    const filled = [...container.querySelectorAll('button')].filter(b => {
      const s = getComputedStyle(b);
      return /gradient/.test(s.backgroundImage || '') || s.backgroundColor === 'rgb(122, 47, 216)';
    });
    expect(filled).toHaveLength(1);
    expect(filled[0]).toHaveTextContent(/Start meeting/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C2 — lifecycle and stable identity are untouched', () => {
  it('Start passes the EXISTING meeting id, so no second meeting is created', async () => {
    const beginMeeting = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PrepScreen {...props({ beginMeeting, caseInfo: { ...props().caseInfo, meetingId: 'mtg-123' } })} />);
    await user.click(screen.getByRole('button', { name: 'Start meeting' }));
    expect(beginMeeting).toHaveBeenCalledTimes(1);
    expect(beginMeeting).toHaveBeenCalledWith({ meetingId: 'mtg-123' });
  });

  it('a cold prep still starts explicitly with null, never undefined', async () => {
    const beginMeeting = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<PrepScreen {...props({ beginMeeting })} />);
    await user.click(screen.getByRole('button', { name: 'Start meeting' }));
    expect(beginMeeting).toHaveBeenCalledWith({ meetingId: null });
  });

  it('preparation itself transitions nothing', () => {
    const code = readFileSync('src/screens/PrepScreen.jsx', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    // No status writes, no direct persistence — Start is the only transition and
    // it delegates to beginMeeting.
    ['review_draft', 'in_progress', 'supabase', 'setStatus'].forEach(bad =>
      expect(code, bad).not.toContain(bad));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C2 — Compass suggestions stay advisory and never gate anything', () => {
  it('nothing describes a question as required', () => {
    render(<PrepScreen {...props({ prepQuestions: [
      { id: 'q1', text: 'What happened on the 4th?', category: 'agenda', essential: true, reasoning: 'Grounded in the record.' },
    ] })} />);
    expect(screen.getByText(/Nothing here is required/)).toBeInTheDocument();
    expect(screen.queryByText(/must ask|mandatory|required questions/i)).not.toBeInTheDocument();
  });

  it('an unanswered suggestion does not disable Start', () => {
    render(<PrepScreen {...props({ prepQuestions: [
      { id: 'q1', text: 'Ask about the rota', category: 'unanswered', essential: true },
    ] })} />);
    expect(screen.getByRole('button', { name: 'Start meeting' })).toBeEnabled();
  });

  it('no readiness score, percentage or RAG rating was introduced', () => {
    render(<PrepScreen {...props({ prepQuestions: [
      { id: 'q1', text: 'a', category: 'agenda', essential: true },
      { id: 'q2', text: 'b', category: 'agenda', essential: false },
    ] })} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ready|readiness/i)).not.toBeInTheDocument();
    // A plain count of what the manager themselves marked is not a score.
    expect(screen.getByText('1 marked essential')).toBeInTheDocument();
  });

  it('every question capability survives the restyle', async () => {
    const onToggleEssential = vi.fn();
    const user = userEvent.setup();
    render(<PrepScreen {...props({
      prepQuestions: [{ id: 'q1', text: 'What happened?', category: 'agenda', essential: false, reasoning: 'Because X.' }],
      linkedCaseAllegations: [{ id: 'a1', title: 'Allegation one' }],
      linkedCaseEvidence: [{ id: 'e1', name: 'Rota.pdf' }],
      onTogglePrepQuestionEssential: onToggleEssential,
    })} />);
    expect(screen.getByLabelText('Question 1 text')).toHaveValue('What happened?');
    expect(screen.getByLabelText('Link question 1 to allegation')).toBeInTheDocument();
    expect(screen.getByLabelText('Link question 1 to evidence')).toBeInTheDocument();
    expect(screen.getByLabelText('Move up')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove question')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Why ask this?' }));
    expect(screen.getByText('Because X.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Mark as essential'));
    expect(onToggleEssential).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C2 — support is available, not displayed at you', () => {
  it('Compass support is collapsed by default', () => {
    render(<PrepScreen {...props()} />);
    expect(screen.getByRole('button', { name: /Compass preparation support/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening it reveals generation and the supporting document, unchanged', async () => {
    const user = userEvent.setup();
    render(<PrepScreen {...props()} />);
    await user.click(screen.getByRole('button', { name: /Compass preparation support/ }));
    expect(screen.getByRole('button', { name: /Suggest questions/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Upload a supporting document')).toBeInTheDocument();
  });

  it('a generated pack opens it, because there is then something to see', () => {
    render(<PrepScreen {...props({ prepNotes: '# Prep pack\n\nSome notes.' })} />);
    expect(screen.getByRole('button', { name: /Compass preparation support/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a generation FAILURE is visible without opening anything', () => {
    // Caught by the existing suite when this first lived inside the disclosure.
    render(<PrepScreen {...props({ aiError: 'Compass AI is temporarily unavailable.' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C2 — meeting types, and the appeal locks that must not move', () => {
  it.each([
    ['investigation', INVESTIGATION],
    ['disciplinary', DISCIPLINARY],
    ['appeal', APPEAL],
  ])('%s preparation renders with one primary action', (_name, type) => {
    render(<PrepScreen {...props({ meetingType: type })} />);
    expect(screen.getByRole('button', { name: 'Start meeting' })).toBeInTheDocument();
  });

  it('a structured appeal keeps its chair and type READ-ONLY', () => {
    render(<PrepScreen {...props({
      meetingType: APPEAL,
      caseInfo: { employee: 'Sam', employeeId: 'u-sam', manager: 'A. Officer', date: '2026-10-09',
                  context: '', preparedCaseId: 'c1', appealChairLocked: true, time: '14:00', locationOrMethod: 'Teams' },
    })} />);
    // Not editable inputs — the appointed officer and the kind of hearing are
    // already authoritative and must not be silently retyped.
    expect(screen.queryByRole('combobox', { name: /Meeting type/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Appeal officer/ })).not.toBeInTheDocument();
    expect(screen.getByText('A. Officer')).toBeInTheDocument();
    expect(screen.getByText(/Teams/)).toBeInTheDocument();
  });

  it('a known employee is shown, not asked for again', () => {
    render(<PrepScreen {...props()} />);
    expect(screen.getByText('Sam Employee')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Who is this meeting with/)).not.toBeInTheDocument();
  });

  it('an unknown employee is asked for canonically, never as free text', () => {
    render(<PrepScreen {...props({ caseInfo: { employee: '', manager: '', date: '', context: '' } })} />);
    expect(screen.getByLabelText(/Who is this meeting with/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C2 — accessibility and the frozen Wave B palette', () => {
  const WARM = ['rgb(253, 250, 245)', 'rgb(232, 224, 208)', 'rgb(237, 229, 216)', 'rgb(245, 241, 234)'];
  const PROPS = ['backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];

  it('no warm legacy palette survives, by COMPUTED style across every element', () => {
    const { container } = render(<PrepScreen {...props({
      prepNotes: '# Pack', prepQuestions: [{ id: 'q1', text: 'a', category: 'agenda', essential: true, reasoning: 'why' }],
      linkedCaseAllegations: [{ id: 'a1', title: 'A' }], linkedCaseEvidence: [{ id: 'e1', name: 'E' }],
    })} />);
    const hits = [];
    container.querySelectorAll('*').forEach(el => {
      const s = getComputedStyle(el);
      PROPS.forEach(p => { if (WARM.includes(s[p])) hits.push(`${el.tagName}.${p}=${s[p]}`); });
    });
    expect(hits).toEqual([]);
  });

  it('Archivo only — no legacy font families', () => {
    const src = readFileSync('src/screens/PrepScreen.jsx', 'utf8');
    expect(src).not.toMatch(/DM Sans|DM Serif|Georgia/);
  });

  it('the disclosure reports its state to assistive technology', async () => {
    const user = userEvent.setup();
    render(<PrepScreen {...props()} />);
    const t = screen.getByRole('button', { name: /Compass preparation support/ });
    expect(t).toHaveAttribute('aria-expanded', 'false');
    await user.click(t);
    expect(screen.getByRole('button', { name: /Compass preparation support/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('the whole screen is reachable by keyboard', () => {
    render(<PrepScreen {...props()} />);
    const start = screen.getByRole('button', { name: 'Start meeting' });
    start.focus();
    expect(start).toHaveFocus();
    // The visually-hidden file input must stay focusable, not display:none.
    fireEvent.click(screen.getByRole('button', { name: /Compass preparation support/ }));
    const upload = screen.getByLabelText('Upload a supporting document');
    expect(getComputedStyle(upload).display).not.toBe('none');
  });
});
