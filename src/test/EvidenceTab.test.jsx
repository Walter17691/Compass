import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvidenceTab } from '../components/caseTabs/EvidenceTab.jsx';

const cs = { id: 'c1', employeeName: 'Sarah Jones', evidence: [{ name: 'note.txt', type: 'text/plain', size: 100, date: '2026-01-01' }] };
const fmtDate = d => d;

describe('EvidenceTab — due-date preview on action findings (Phase 5, IP24)', () => {
  it('shows a parsed due date next to an action finding whose text contains a commitment', () => {
    const findings = { 'c1::0': [{ id: 'f1', type: 'action', description: 'Follow up with the employee in 2 weeks', status: 'open' }] };
    render(<EvidenceTab cs={cs} cases={[cs]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.getByText('Suggested action: Follow up with the employee in 2 weeks')).toBeInTheDocument();
    expect(screen.getByText(/^Due \d{4}-\d{2}-\d{2}$/)).toBeInTheDocument();
  });

  it('omits the due-date preview when the finding text has no parseable commitment', () => {
    const findings = { 'c1::0': [{ id: 'f1', type: 'action', description: 'Chase the outstanding evidence', status: 'open' }] };
    render(<EvidenceTab cs={cs} cases={[cs]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.queryByText(/^Due \d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();
  });

  it('never shows a due-date preview for non-action finding types', () => {
    const findings = { 'c1::0': [{ id: 'f1', type: 'inconsistency', description: 'Conflicts with the meeting record from 3 weeks ago', status: 'open' }] };
    render(<EvidenceTab cs={cs} cases={[cs]} saveCases={()=>{}} fmtDate={fmtDate} documentFindings={findings} />);
    expect(screen.queryByText(/^Due \d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();
  });
});
