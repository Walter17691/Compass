import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentsTab } from '../components/caseTabs/DocumentsTab.jsx';

const cs = { id: 'c1', employeeName: 'Sarah Jones', meetings: [], evidence: [] };

describe('DocumentsTab — Generate Hearing Pack (Phase 5, IP8)', () => {
  it('renders the Generate Hearing Pack button and calls onGenerateHearingPack with the case', async () => {
    const user = userEvent.setup();
    const onGenerateHearingPack = vi.fn();
    render(<DocumentsTab cs={cs} fmtDate={d=>d} onGenerateHearingPack={onGenerateHearingPack} hearingPackGenerating={false} />);
    await user.click(screen.getByRole('button', { name: 'Generate Hearing Pack' }));
    expect(onGenerateHearingPack).toHaveBeenCalledWith(cs);
  });

  it('disables the button and shows a generating state while in progress', () => {
    render(<DocumentsTab cs={cs} fmtDate={d=>d} onGenerateHearingPack={()=>{}} hearingPackGenerating={true} />);
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  });

  it('omits the button entirely when no handler is given', () => {
    render(<DocumentsTab cs={cs} fmtDate={d=>d} />);
    expect(screen.queryByRole('button', { name: /Generate Hearing Pack/ })).not.toBeInTheDocument();
  });
});

describe('DocumentsTab — Draft correspondence (Phase 5, IP12)', () => {
  it('renders a button per correspondence type and calls onDraftCorrespondence with the case and type', async () => {
    const user = userEvent.setup();
    const onDraftCorrespondence = vi.fn();
    render(<DocumentsTab cs={cs} fmtDate={d=>d} onDraftCorrespondence={onDraftCorrespondence} />);
    await user.click(screen.getByRole('button', { name: 'Witness invitation' }));
    expect(onDraftCorrespondence).toHaveBeenCalledWith(cs, 'witness-invitation');
    await user.click(screen.getByRole('button', { name: 'Evidence request' }));
    expect(onDraftCorrespondence).toHaveBeenCalledWith(cs, 'evidence-request');
    await user.click(screen.getByRole('button', { name: 'OH consent request' }));
    expect(onDraftCorrespondence).toHaveBeenCalledWith(cs, 'oh-consent-request');
  });

  it('omits the draft row entirely when no handler is given', () => {
    render(<DocumentsTab cs={cs} fmtDate={d=>d} />);
    expect(screen.queryByRole('button', { name: 'Witness invitation' })).not.toBeInTheDocument();
  });
});
