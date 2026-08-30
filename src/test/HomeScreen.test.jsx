import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeScreen } from '../screens/HomeScreen.jsx';

// Home Experience Redesign — Home's composition changed almost entirely
// (no more header creation buttons, no Needs Attention/Active Cases
// table, a real For You feed instead). This file replaces the previous
// HomeScreen test suite, which asserted on UI that no longer exists.
const noop = () => {};
const getCaseStage = cs => cs.stage || 'open';
const noNextStep = () => null;

const baseHomeProps = {
  cases: [], getCaseStage, currentUser: { name: 'Alex' }, getNextStep: noNextStep,
  setScreen: noop, setShowCasePrompt: noop, dueSoon: [], setActiveCaseId: noop,
  setActiveCaseStage: noop, fmtDate: d => d, isHR: true, onAskCompass: noop,
};

describe('HomeScreen — header (Home Experience Redesign, §2)', () => {
  it('shows the greeting and a real-data contextual sentence, with no creation buttons', () => {
    render(<HomeScreen {...baseHomeProps} cases={[{ id: 'c1', employeeName: 'Sam', stage: 'investigation' }]} />);
    expect(screen.getByText(/Good (morning|afternoon|evening), Alex/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start meeting' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ New case' })).not.toBeInTheDocument();
  });

  it('says "You\'re all caught up" when there is nothing in the feed', () => {
    render(<HomeScreen {...baseHomeProps} cases={[{ id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: new Date().toISOString() }]} />);
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it('states an urgent count distinctly from a normal count', () => {
    const overdueCase = { id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: new Date().toISOString() };
    const dueSoon = [{ key: 'od1', overdue: true, daysOverdue: 2, daysLeft: 0, label: 'Overdue thing', employeeName: 'Sam', caseId: 'c1', category: 'outcome' }];
    render(<HomeScreen {...baseHomeProps} cases={[overdueCase]} dueSoon={dueSoon} />);
    expect(screen.getByText('1 urgent item needs your attention today.')).toBeInTheDocument();
  });
});

describe('HomeScreen — Ask Compass (Home Experience Redesign, §3)', () => {
  it('renders a real, always-visible input with no "Open Ask Compass" click-through step first', () => {
    render(<HomeScreen {...baseHomeProps} />);
    expect(screen.getByLabelText('Ask Compass')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Ask Compass/ })).not.toBeInTheDocument();
  });

  it('submits directly on Enter', () => {
    const onAskCompass = vi.fn();
    render(<HomeScreen {...baseHomeProps} onAskCompass={onAskCompass} />);
    const input = screen.getByLabelText('Ask Compass');
    fireEvent.change(input, { target: { value: 'What needs attention?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAskCompass).toHaveBeenCalledWith('What needs attention?');
    expect(input.value).toBe('');
  });

  it('shows at most 3 static starter prompts that submit immediately on click', () => {
    const onAskCompass = vi.fn();
    render(<HomeScreen {...baseHomeProps} onAskCompass={onAskCompass} />);
    const starters = ['What needs my attention?', 'Summarise my open cases', "What's overdue?"];
    for (const label of starters) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: starters[0] }));
    expect(onAskCompass).toHaveBeenCalledWith(starters[0]);
  });

  it('does nothing on Enter when the field is blank', () => {
    const onAskCompass = vi.fn();
    render(<HomeScreen {...baseHomeProps} onAskCompass={onAskCompass} />);
    fireEvent.keyDown(screen.getByLabelText('Ask Compass'), { key: 'Enter' });
    expect(onAskCompass).not.toHaveBeenCalled();
  });
});

describe('HomeScreen — For You feed (Home Experience Redesign, §4/§6)', () => {
  it('renders an overdue item with urgent (red) treatment and a case-linked feed row for a next-step action with neutral treatment', () => {
    const cases = [
      { id: 'c1', employeeName: 'Overdue Person', stage: 'investigation', updatedAt: new Date().toISOString() },
      { id: 'c2', employeeName: 'Action Person', stage: 'inv_report', updatedAt: new Date().toISOString() },
    ];
    const dueSoon = [{ key: 'od1', overdue: true, daysOverdue: 3, daysLeft: 0, label: 'DSAR response due', employeeName: 'Overdue Person', caseId: 'c1', category: 'dsar' }];
    const getNextStep = cs => cs.id === 'c2' ? { action: 'inv_report', label: 'Submit investigation report' } : null;
    render(<HomeScreen {...baseHomeProps} cases={cases} dueSoon={dueSoon} getNextStep={getNextStep} />);
    const eyebrows = screen.getAllByText('Action needed');
    expect(eyebrows).toHaveLength(2);
    expect(eyebrows[0]).toHaveStyle({ color: '#C84B2F' });
    expect(eyebrows[1]).not.toHaveStyle({ color: '#C84B2F' });
    expect(screen.getByText('DSAR response overdue')).toBeInTheDocument();
    expect(screen.getByText('Submit investigation report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit investigation report →' })).toBeInTheDocument();
  });

  it('navigates to the case when a feed row action is clicked', () => {
    const setActiveCaseId = vi.fn();
    const setScreen = vi.fn();
    const cases = [{ id: 'c1', employeeName: 'Sam', stage: 'inv_report', updatedAt: new Date().toISOString() }];
    const getNextStep = () => ({ action: 'inv_report', label: 'Submit investigation report' });
    render(<HomeScreen {...baseHomeProps} cases={cases} getNextStep={getNextStep} setActiveCaseId={setActiveCaseId} setScreen={setScreen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Submit investigation report →' }));
    expect(setActiveCaseId).toHaveBeenCalledWith('c1');
    expect(setScreen).toHaveBeenCalledWith('case_view');
  });

  it('routes a non-case deadline (DSAR) to the DSAR screen, not a case', () => {
    const setScreen = vi.fn();
    const dueSoon = [{ key: 'dsar1', overdue: true, daysOverdue: 5, daysLeft: 0, label: 'DSAR response due', employeeName: 'Sarah', caseId: null, category: 'dsar' }];
    render(<HomeScreen {...baseHomeProps} cases={[{ id: 'x', employeeName: 'Someone', stage: 'investigation', updatedAt: new Date().toISOString() }]} dueSoon={dueSoon} setScreen={setScreen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open DSAR →' }));
    expect(setScreen).toHaveBeenCalledWith('dsar');
  });
});

describe('HomeScreen — For You feed cap (Home + Sidebar Product Experience pass, Part 5)', () => {
  it('caps the feed to 5 rows initially and reveals the rest via "View all", on a real-scale org', () => {
    const dueSoon = Array.from({ length: 9 }, (_, i) => ({
      // category "next_step" passes its label through unhumanised (a
      // user-written action already), keeping this test focused purely
      // on the cap/expand behaviour rather than the title humaniser.
      key: `od${i}`, overdue: true, daysOverdue: i + 1, daysLeft: 0,
      label: `Overdue item ${i}`, employeeName: `Case ${i}`, caseId: 'c' + i, category: 'next_step',
    }));
    const cases = Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, employeeName: 'Case ' + i, stage: 'investigation', updatedAt: new Date().toISOString() }));
    render(<HomeScreen {...baseHomeProps} cases={cases} dueSoon={dueSoon} />);
    expect(screen.getByText('Overdue item 0')).toBeInTheDocument();
    expect(screen.getByText('Overdue item 4')).toBeInTheDocument();
    expect(screen.queryByText('Overdue item 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View all (9) →' }));
    expect(screen.getByText('Overdue item 5')).toBeInTheDocument();
    expect(screen.getByText('Overdue item 8')).toBeInTheDocument();
  });

  it('shows no "View all" control when the feed is within the cap', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam', stage: 'inv_report', updatedAt: new Date().toISOString() }];
    const getNextStep = () => ({ action: 'inv_report', label: 'Submit investigation report' });
    render(<HomeScreen {...baseHomeProps} cases={cases} getNextStep={getNextStep} />);
    expect(screen.queryByRole('button', { name: /View all \(/ })).not.toBeInTheDocument();
  });
});

describe('HomeScreen — Recently active (Home Experience Redesign, §8)', () => {
  it('shows at most 4 cases, most recently updated first, with no search/filter controls', () => {
    const cases = Array.from({ length: 6 }, (_, i) => ({
      id: 'c' + i, employeeName: 'Case ' + i, stage: 'investigation',
      updatedAt: new Date(Date.now() - i * 86400000).toISOString(),
    }));
    render(<HomeScreen {...baseHomeProps} cases={cases} />);
    expect(screen.getByText('Case 0')).toBeInTheDocument();
    expect(screen.getByText('Case 3')).toBeInTheDocument();
    expect(screen.queryByText('Case 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Case 5')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Search cases')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Investigation' })).not.toBeInTheDocument();
  });

  it('excludes closed cases from Recently active', () => {
    const cases = [
      { id: 'c1', employeeName: 'Open Case', stage: 'investigation', updatedAt: new Date().toISOString() },
      { id: 'c2', employeeName: 'Closed Case', stage: 'closed', updatedAt: new Date().toISOString() },
    ];
    render(<HomeScreen {...baseHomeProps} cases={cases} />);
    expect(screen.getByText('Open Case')).toBeInTheDocument();
    expect(screen.queryByText('Closed Case')).not.toBeInTheDocument();
  });
});

describe('HomeScreen — Today rail (Home Experience Redesign, §9)', () => {
  it('is omitted entirely when there is nothing today, rather than showing an empty card', () => {
    render(<HomeScreen {...baseHomeProps} cases={[{ id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: new Date().toISOString() }]} />);
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it("shows today's meeting without duplicating it in the For You feed", () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const cases = [{ id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: today.toISOString(), meetings: [{ type: 'Investigation meeting', date: `${dd}/${mm}/${today.getFullYear()}` }] }];
    render(<HomeScreen {...baseHomeProps} cases={cases} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText(/Investigation meeting/)).toBeInTheDocument();
  });

  // Home UX Polish pass, §4 — Today redesigned as a compact agenda:
  // state badge (Meeting/Due) → event/deadline → person, no fabricated
  // times (meeting records only ever carry a date, never a time-of-day).
  it('labels a meeting row "Meeting" and a due-today deadline row "Due", each with the person shown', () => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dateStr = `${dd}/${mm}/${today.getFullYear()}`;
    const cases = [
      { id: 'c1', employeeName: 'Sarah Jones', stage: 'investigation', updatedAt: today.toISOString(), meetings: [{ type: 'Investigation meeting', date: dateStr }] },
      { id: 'c2', employeeName: 'James Carter', stage: 'outcome', updatedAt: today.toISOString() },
    ];
    const dueSoon = [{ key: 'k1', overdue: false, daysLeft: 0, label: 'Disciplinary outcome letter due (ACAS-recommended: 5 working days)', employeeName: 'James Carter', caseId: 'c2', category: 'outcome' }];
    render(<HomeScreen {...baseHomeProps} cases={cases} dueSoon={dueSoon} />);
    expect(screen.getByText('Meeting')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    // Both names also appear a second time in Recently active — these are
    // real, distinct cases, so that's expected, not a duplication bug.
    expect(screen.getAllByText('Sarah Jones').length).toBeGreaterThan(0);
    expect(screen.getAllByText('James Carter').length).toBeGreaterThan(0);
    // Same human wording the feed itself uses, not the raw ACAS-citation label.
    expect(screen.getByText('Disciplinary outcome letter due')).toBeInTheDocument();
    expect(screen.queryByText(/ACAS/)).not.toBeInTheDocument();
  });

  // Home UX Polish pass, §5 — one extremely compact line beneath Today,
  // not another dashboard component.
  it('shows a compact "This week" summary beneath Today when the week ahead has real deadlines/meetings', () => {
    const inFiveDays = new Date(); inFiveDays.setDate(inFiveDays.getDate() + 5);
    const dd = String(inFiveDays.getDate()).padStart(2, '0');
    const mm = String(inFiveDays.getMonth() + 1).padStart(2, '0');
    const cases = [{ id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: new Date().toISOString(), meetings: [{ type: 'Review meeting', date: `${dd}/${mm}/${inFiveDays.getFullYear()}` }] }];
    const dueSoon = [
      { key: 'k1', overdue: false, daysLeft: 3, label: 'Probation review due', employeeName: 'Sam', caseId: 'c1', category: 'probation' },
      { key: 'k2', overdue: false, daysLeft: 6, label: 'Grievance acknowledgement due (ACAS-recommended: 5 working days)', employeeName: 'Sam', caseId: 'c1', category: 'grievance' },
    ];
    render(<HomeScreen {...baseHomeProps} cases={cases} dueSoon={dueSoon} />);
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('2 deadlines · 1 meeting')).toBeInTheDocument();
  });

  it('does not show "This week" when the week ahead has nothing real to summarise', () => {
    render(<HomeScreen {...baseHomeProps} cases={[{ id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: new Date().toISOString() }]} />);
    expect(screen.queryByText('This week')).not.toBeInTheDocument();
  });
});

describe('HomeScreen — empty state (Home Experience Redesign, §15)', () => {
  it('shows a calm empty state with no For You / Recently active / Today sections, and one onboarding action', () => {
    const setShowCasePrompt = vi.fn();
    render(<HomeScreen {...baseHomeProps} cases={[]} setShowCasePrompt={setShowCasePrompt} />);
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.queryByText('For you')).not.toBeInTheDocument();
    expect(screen.queryByText('Recently active')).not.toBeInTheDocument();
    expect(screen.queryByText('Your work')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create your first case →' }));
    expect(setShowCasePrompt).toHaveBeenCalledWith(true);
  });

  it('still shows the greeting and Ask Compass in the empty state', () => {
    render(<HomeScreen {...baseHomeProps} cases={[]} />);
    expect(screen.getByText(/Good (morning|afternoon|evening), Alex/)).toBeInTheDocument();
    expect(screen.getByLabelText('Ask Compass')).toBeInTheDocument();
  });
});

describe('HomeScreen — Compass noticed (Home + Sidebar Product Experience pass, Part 8)', () => {
  it('shows the signal\'s own reasoning and a type-specific action, not just a title and employee name', () => {
    const cases = [{ id: 'c1', employeeName: 'Sarah Jones', stage: 'investigation', updatedAt: new Date().toISOString() }];
    const caseSignals = [{
      id: 'sig1', caseId: 'c1', type: 'process_risk', status: 'open',
      title: 'Possible evidence gap',
      reasoning: 'The evidence recorded in this appeal may not address the employee\'s explanation.',
      createdAt: new Date().toISOString(),
    }];
    render(<HomeScreen {...baseHomeProps} cases={cases} caseSignals={caseSignals} />);
    expect(screen.getByText('Possible evidence gap')).toBeInTheDocument();
    expect(screen.getByText('The evidence recorded in this appeal may not address the employee\'s explanation.')).toBeInTheDocument();
    expect(screen.getByText('Review guardrail →')).toBeInTheDocument();
  });

  it('labels a next_action signal "Review case →" rather than the guardrail wording', () => {
    const cases = [{ id: 'c1', employeeName: 'Sarah Jones', stage: 'investigation', updatedAt: new Date().toISOString() }];
    const caseSignals = [{
      id: 'sig1', caseId: 'c1', type: 'next_action', status: 'open',
      title: 'Next best action available', reasoning: 'A next step has been identified.',
      createdAt: new Date().toISOString(),
    }];
    render(<HomeScreen {...baseHomeProps} cases={cases} caseSignals={caseSignals} />);
    expect(screen.getByText('Review case →')).toBeInTheDocument();
  });

  it('is omitted entirely when there are no open signals or bottlenecks', () => {
    render(<HomeScreen {...baseHomeProps} cases={[{ id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: new Date().toISOString() }]} />);
    expect(screen.queryByText('Compass noticed')).not.toBeInTheDocument();
  });
});

describe('HomeScreen — Compass noticed reasoning progressive disclosure (Home Micro-Polish pass)', () => {
  const withOverflow = (fn) => {
    // jsdom never lays out real box heights, so scrollHeight/clientHeight
    // are always 0 — the component's own overflow check (scrollHeight >
    // clientHeight) can never fire without forcing real measurements
    // here. Stubbing both getters is the only way to exercise the "long
    // reasoning" branch in a unit test rather than only in a live browser.
    Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, value: 120 });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, value: 48 });
    try {
      fn();
    } finally {
      delete window.HTMLElement.prototype.scrollHeight;
      delete window.HTMLElement.prototype.clientHeight;
    }
  };

  const longReasoningProps = () => ({
    cases: [{ id: 'c1', employeeName: 'Sarah Jones', stage: 'investigation', updatedAt: new Date().toISOString() }],
    caseSignals: [{
      id: 'sig1', caseId: 'c1', type: 'process_risk', status: 'open',
      title: 'Possible evidence gap',
      reasoning: 'The evidence recorded in this appeal may not address the employee\'s explanation, and there is no indication the original finding considered it before a decision was reached.',
      createdAt: new Date().toISOString(),
    }],
  });

  it('shows a "More" toggle only when the reasoning actually overflows the clamped preview', () => {
    const cases = [{ id: 'c1', employeeName: 'Sarah Jones', stage: 'investigation', updatedAt: new Date().toISOString() }];
    const caseSignals = [{ id: 'sig1', caseId: 'c1', type: 'next_action', status: 'open', title: 'Short one', reasoning: 'Brief reason.', createdAt: new Date().toISOString() }];
    render(<HomeScreen {...baseHomeProps} {...{ cases, caseSignals }} />);
    // jsdom reports scrollHeight===clientHeight (both 0) by default, so
    // short, non-overflowing reasoning must not render a dead-end toggle.
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument();
  });

  it('renders the full reasoning text in the DOM even while visually clamped, with a "More" control when it overflows', () => {
    withOverflow(() => {
      const props = longReasoningProps();
      render(<HomeScreen {...baseHomeProps} {...props} />);
      expect(screen.getByText(props.caseSignals[0].reasoning)).toBeInTheDocument();
      const more = screen.getByRole('button', { name: /show more detail/i });
      expect(more).toHaveAttribute('aria-expanded', 'false');
      expect(more).toHaveAttribute('aria-controls');
      expect(more).toHaveTextContent('More');
    });
  });

  it('expands to "Less" on click/keyboard activation, without navigating or opening a modal', () => {
    withOverflow(() => {
      const setScreen = vi.fn();
      const props = longReasoningProps();
      render(<HomeScreen {...baseHomeProps} {...props} setScreen={setScreen} />);
      const more = screen.getByRole('button', { name: /show more detail/i });
      fireEvent.click(more);
      expect(screen.getByRole('button', { name: /show less detail/i })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('Less')).toBeInTheDocument();
      expect(setScreen).not.toHaveBeenCalled();
      // Same full text stays in the DOM before and after — nothing was
      // regenerated, summarised, or re-fetched by expanding it.
      expect(screen.getByText(props.caseSignals[0].reasoning)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /show less detail/i }));
      expect(screen.getByRole('button', { name: /show more detail/i })).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('keeps "Review guardrail →" as its own reachable control alongside More, not replaced by it', () => {
    withOverflow(() => {
      const props = longReasoningProps();
      render(<HomeScreen {...baseHomeProps} {...props} />);
      expect(screen.getByRole('button', { name: 'Review guardrail →' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /show more detail/i })).toBeInTheDocument();
    });
  });
});

describe('HomeScreen — Your work breakdown (Home + Sidebar Product Experience pass, Part 9)', () => {
  it('is omitted entirely when there is nothing overdue, awaiting approval, or due this week', () => {
    const cases = [
      { id: 'c1', employeeName: 'A', stage: 'investigation', updatedAt: new Date().toISOString() },
      { id: 'c2', employeeName: 'B', stage: 'investigation', updatedAt: new Date().toISOString() },
    ];
    render(<HomeScreen {...baseHomeProps} cases={cases} />);
    expect(screen.queryByText('Your work')).not.toBeInTheDocument();
  });

  it('shows a real overdue/awaiting-approval/due-this-week breakdown instead of a bare open-case count', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam', stage: 'investigation', updatedAt: new Date().toISOString() }];
    const dueSoon = [
      { key: 'od1', overdue: true, daysOverdue: 1, daysLeft: 0, label: 'Overdue thing', employeeName: 'Sam', caseId: 'c1', category: 'outcome' },
      { key: 'k2', overdue: false, daysLeft: 3, label: 'Probation review due', employeeName: 'Sam', caseId: 'c1', category: 'probation' },
    ];
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', status: 'pending', step: 'dismissal' }];
    render(<HomeScreen {...baseHomeProps} cases={cases} dueSoon={dueSoon} hrReviewRequests={hrReviewRequests} />);
    expect(screen.getByText('Your work')).toBeInTheDocument();
    expect(screen.getByText('1 overdue · 1 awaiting approval · 1 due this week')).toBeInTheDocument();
  });
});
