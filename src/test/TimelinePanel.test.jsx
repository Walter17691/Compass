import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelinePanel } from '../components/TimelinePanel.jsx';

// Phase 6.5 hardening (Batch 13) — the person/allegation filter selects
// had no accessible name at all; the inline description edit field had
// none either. Had no test coverage at all before this.
const noop = () => {};
const cs = {
  id: 'c1', dateReceived: '2026-01-01',
  meetings: [
    { id: 'm1', date: '2026-01-05', type: 'Investigation meeting', manager: 'Alex Manager', record: true },
    { id: 'm2', date: '2026-01-10', type: 'Disciplinary hearing', manager: 'Jo Chair', record: true },
  ],
};
const allegations = [{ id: 'a1', caseId: 'c1', title: 'Unauthorised absence', createdAt: '2026-01-02' }];

describe('TimelinePanel — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the person and allegation filter selects', () => {
    render(<TimelinePanel cs={cs} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    expect(screen.getByLabelText('Filter by person')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by allegation')).toBeInTheDocument();
  });

  it('gives the inline description edit field an accessible name', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel cs={cs} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    const meetingRow = screen.getByText('Investigation meeting held').closest('div').parentElement;
    await user.click(within(meetingRow).getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Edit description for Meeting entry')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes Prompt 11 audit finding 4.8, MEDIUM)
describe('TimelinePanel — incomplete-audit-history caveat (Prompt 11 audit, 4.8)', () => {
  it('shows a caveat for a case opened before audit_log reliably carried case_id', () => {
    render(<TimelinePanel cs={cs} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    expect(screen.getByText(/some historic entries from that period may not appear/)).toBeInTheDocument();
  });

  it('does not show the caveat for a case opened after the cutoff', () => {
    const recentCase = { ...cs, dateReceived: '2026-08-22' };
    render(<TimelinePanel cs={recentCase} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    expect(screen.queryByText(/some historic entries from that period may not appear/)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.4A — the stage row for a process Compass owns no sequence for.
//
// Before this, a capability case rendered the heading "Capability process" above
// a chip row containing nothing at all: not an error message, just an empty
// band. Verified by rendering, because no logic assertion can see it — the same
// blind spot that let an invisible 1px border ship in an earlier phase.
const STAGE_COPY = 'No stage sequence is available for this process type.';
const withType = (caseType, stage = 'investigation') => ({
  id: 'c1', caseType, stage, dateReceived: '2026-01-01',
  meetings: [{ id: 'm1', date: '2026-01-05', type: 'Investigation meeting', manager: 'Alex Manager', record: true }],
});
const renderPanel = cs =>
  render(<TimelinePanel cs={cs} allegations={[]} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);

describe('TimelinePanel — no stage sequence (E1.4A)', () => {
  it('says so for capability, and draws no stage chips', () => {
    renderPanel(withType('capability'));
    expect(screen.getByText(STAGE_COPY)).toBeInTheDocument();
    // The disciplinary sequence must be nowhere on the screen.
    ['Concern raised', 'Investigation review', 'Disciplinary hearing'].forEach(label => {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });

  it('still names the process, because that much is true', () => {
    renderPanel(withType('capability'));
    expect(screen.getByText(/Capability process/)).toBeInTheDocument();
  });

  it('says so for absence, informal and an untyped case', () => {
    ['absence', 'informal', undefined].forEach(t => {
      const { unmount } = renderPanel(withType(t));
      expect(screen.getByText(STAGE_COPY), String(t)).toBeInTheDocument();
      unmount();
    });
  });

  it('a misconduct case still draws its full validated sequence', () => {
    renderPanel(withType('misconduct'));
    expect(screen.queryByText(STAGE_COPY)).not.toBeInTheDocument();
    expect(screen.getByText(/Misconduct process/)).toBeInTheDocument();
    expect(screen.getByText('✓ Concern raised')).toBeInTheDocument();
    expect(screen.getByText('Investigation')).toBeInTheDocument();
    expect(screen.getByText('Disciplinary hearing')).toBeInTheDocument();
    expect(screen.getByText('Appeal')).toBeInTheDocument();
  });

  it('a grievance case still draws its own sequence, not the disciplinary one', () => {
    renderPanel(withType('grievance', 'hearing'));
    expect(screen.queryByText(STAGE_COPY)).not.toBeInTheDocument();
    expect(screen.getByText('Grievance meeting')).toBeInTheDocument();
    expect(screen.queryByText('Disciplinary hearing')).not.toBeInTheDocument();
  });

  it('is not alarming and uses no technical language', () => {
    renderPanel(withType('capability'));
    const body = document.body.textContent.toLowerCase();
    ['unsupported', 'no stage model', 'configuration', 'invalid', 'not configured', 'undefined', 'null']
      .forEach(w => expect(body, w).not.toContain(w));
  });
});
