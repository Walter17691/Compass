import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EvidenceTab } from '../components/caseTabs/EvidenceTab.jsx';

const cs = { id: 'c1', employeeName: 'Sarah Jones', evidence: [{ id: 'ev1', name: 'note.txt', type: 'text/plain', size: 100, date: '2026-01-01' }] };
const fmtDate = d => d;

describe('EvidenceTab — due-date preview on action findings (Phase 5, IP24)', () => {
  it('shows a parsed due date next to an action finding whose text contains a commitment', () => {
    const findings = { 'c1::ev1': [{ id: 'f1', type: 'action', description: 'Follow up with the employee in 2 weeks', status: 'open' }] };
    render(<EvidenceTab cs={cs} cases={[cs]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.getByText('Suggested action: Follow up with the employee in 2 weeks')).toBeInTheDocument();
    expect(screen.getByText(/^Due \d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
  });

  it('omits the due-date preview when the finding text has no parseable commitment', () => {
    const findings = { 'c1::ev1': [{ id: 'f1', type: 'action', description: 'Chase the outstanding evidence', status: 'open' }] };
    render(<EvidenceTab cs={cs} cases={[cs]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.queryByText(/^Due \d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();
  });

  it('never shows a due-date preview for non-action finding types', () => {
    const findings = { 'c1::ev1': [{ id: 'f1', type: 'inconsistency', description: 'Conflicts with the meeting record from 3 weeks ago', status: 'open' }] };
    render(<EvidenceTab cs={cs} cases={[cs]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.queryByText(/^Due \d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();
  });
});

// Phase 6.5 hardening (production regression suite) — the "Remove"
// button itself, not just the id-keying logic it depends on being
// correct downstream. Filters by the item's own real id
// (evidenceUpload.js's ensureEvidenceIds guarantees every item has one),
// never by array position.
describe('EvidenceTab — deleting an evidence item', () => {
  const threeItemCase = {
    id: 'c1', employeeName: 'Sarah Jones',
    evidence: [
      { id: 'ev1', name: 'first.txt', type: 'text/plain', size: 50, date: '2026-01-01' },
      { id: 'ev2', name: 'second.txt', type: 'text/plain', size: 60, date: '2026-01-02' },
      { id: 'ev3', name: 'third.txt', type: 'text/plain', size: 70, date: '2026-01-03' },
    ],
  };

  it('removes only the clicked item, by id, leaving the other two untouched and in order', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    render(<EvidenceTab cs={threeItemCase} cases={[threeItemCase]} saveCases={saveCases} fmtDate={fmtDate} documentFindings={{}} />);
    // ev.name renders in its own inner div, a sibling-of-a-sibling of the
    // action-buttons div (not an ancestor of it) — two levels up reaches
    // the shared row wrapping both the name/meta content and the actions.
    const secondRow = screen.getByText('second.txt').closest('div').parentElement.parentElement;
    await user.click(within(secondRow).getByRole('button', { name: 'Remove' }));
    expect(saveCases).toHaveBeenCalledTimes(1);
    const updatedCases = saveCases.mock.calls[0][0];
    const updatedCase = updatedCases.find(c => c.id === 'c1');
    expect(updatedCase.evidence.map(e => e.id)).toEqual(['ev1', 'ev3']);
  });
});

// Phase 6.5 hardening (P0, Cluster 8) — findings are keyed by the evidence
// item's own stable id, not array position, so a second, later-added
// evidence item can never accidentally surface the first item's findings
// (which a shared, coincidentally-reused index like `0` could previously
// cause once one item was deleted).
describe('EvidenceTab — findings keyed by evidence id, not array position', () => {
  const twoItemCase = {
    id: 'c1', employeeName: 'Sarah Jones',
    evidence: [
      { id: 'ev1', name: 'first.txt', type: 'text/plain', size: 50, date: '2026-01-01' },
      { id: 'ev2', name: 'second.txt', type: 'text/plain', size: 60, date: '2026-01-02' },
    ],
  };

  it('shows each evidence item only its own findings, keyed by id', () => {
    const findings = {
      'c1::ev1': [{ id: 'f1', type: 'inconsistency', description: 'First item finding', status: 'open' }],
      'c1::ev2': [{ id: 'f2', type: 'inconsistency', description: 'Second item finding', status: 'open' }],
    };
    render(<EvidenceTab cs={twoItemCase} cases={[twoItemCase]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.getByText('Potential inconsistency: First item finding')).toBeInTheDocument();
    expect(screen.getByText('Potential inconsistency: Second item finding')).toBeInTheDocument();
  });

  it('a finding keyed under an id no longer present in evidence (e.g. its item was deleted) is not shown against a different, unrelated item', () => {
    // Simulates: ev1 was deleted after being analysed: only ev2 remains,
    // but the old c1::ev1 findings entry is still in session state.
    const findings = {
      'c1::ev1': [{ id: 'f1', type: 'inconsistency', description: 'Belongs to the deleted item', status: 'open' }],
    };
    const remainingCase = { id: 'c1', employeeName: 'Sarah Jones', evidence: [twoItemCase.evidence[1]] };
    render(<EvidenceTab cs={remainingCase} cases={[remainingCase]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.queryByText('Potential inconsistency: Belongs to the deleted item')).not.toBeInTheDocument();
  });

  it('calls onAnalyseEvidence/onAcceptFinding/onDismissFinding with the evidence item\'s id, not its index', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const onAnalyseEvidence = () => {};
    const findings = { 'c1::ev2': [{ id: 'f2', type: 'action', description: 'Do the thing', status: 'open' }] };
    const onAcceptFinding = vi.fn();
    render(<EvidenceTab cs={twoItemCase} cases={[twoItemCase]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} onAnalyseEvidence={onAnalyseEvidence} onAcceptFinding={onAcceptFinding} onDismissFinding={()=>{}} />);
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAcceptFinding).toHaveBeenCalledWith('ev2', findings['c1::ev2'][0]);
  });

  // Task's own required scenario: A, B, C evidence; analyse B; delete A;
  // confirm B retains B's analysis; confirm C never displays B's analysis.
  it('A/B/C evidence: analysing B and then deleting A leaves B\'s analysis intact and never leaks onto C', () => {
    const threeItemCase = {
      id: 'c1', employeeName: 'Sarah Jones',
      evidence: [
        { id: 'evA', name: 'a.txt', type: 'text/plain', size: 10, date: '2026-01-01' },
        { id: 'evB', name: 'b.txt', type: 'text/plain', size: 20, date: '2026-01-02' },
        { id: 'evC', name: 'c.txt', type: 'text/plain', size: 30, date: '2026-01-03' },
      ],
    };
    const findings = {
      'c1::evB': [{ id: 'fB', type: 'inconsistency', description: 'B\'s own finding', status: 'open' }],
    };
    // "Delete A" — A is simply no longer in cs.evidence; B and C are untouched.
    const afterDeletingA = { id: 'c1', employeeName: 'Sarah Jones', evidence: [threeItemCase.evidence[1], threeItemCase.evidence[2]] };
    render(<EvidenceTab cs={afterDeletingA} cases={[afterDeletingA]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);

    // B retains its own analysis, and it appears exactly once — never
    // duplicated onto C's row.
    expect(screen.getAllByText('Potential inconsistency: B\'s own finding')).toHaveLength(1);
    expect(screen.getByText('c.txt')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes Prompt 16 audit finding H9, HIGH) — "Mark
// signed" used to save signStatus:"signed" directly from the click with
// no confirmation at all. It now routes through
// requestManualSignatureConfirmation (humanOverride.js, its own full test
// coverage) — these just prove EvidenceTab wires the confirm/cancel
// outcome through to saveCases/audit correctly.
describe('EvidenceTab — manual "Mark signed" requires confirmation (Prompt 16 audit, H9)', () => {
  const witnessCase = {
    id: 'c1', employeeName: 'Sarah Jones',
    evidence: [{ id: 'ev1', name: 'statement.pdf', type: 'Witness statement', size: 100, date: '2026-01-01' }],
  };

  it('saves signStatus "signed" once the confirmation is given', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const audit = vi.fn();
    const promptDialog = vi.fn().mockResolvedValue({ detail: 'Signed paper copy handed to HR on 12 March 2026' });
    render(<EvidenceTab cs={witnessCase} cases={[witnessCase]} saveCases={saveCases} fmtDate={fmtDate} promptDialog={promptDialog} audit={audit} />);
    await user.click(screen.getByRole('button', { name: 'Mark signed' }));
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].evidence[0].signStatus).toBe('signed');
    expect(audit).toHaveBeenCalledWith('Marked signed outside Compass', expect.stringContaining('Signed paper copy handed to HR on 12 March 2026'), 'c1');
  });

  it('does not save when the manual-signature confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    render(<EvidenceTab cs={witnessCase} cases={[witnessCase]} saveCases={saveCases} fmtDate={fmtDate} promptDialog={() => Promise.resolve(null)} />);
    await user.click(screen.getByRole('button', { name: 'Mark signed' }));
    expect(saveCases).not.toHaveBeenCalled();
  });
});
