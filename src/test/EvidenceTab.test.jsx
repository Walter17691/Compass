import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
