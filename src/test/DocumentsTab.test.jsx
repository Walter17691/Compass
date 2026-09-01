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

// Human UAT remediation, Batch 2, Part 2 — a generated hearing pack used
// to disappear once the browser's downloads panel was closed, with no
// way to find it again on the case. It's now saved as a real evidence
// item (App.jsx's handleGenerateHearingPack, buildHearingPackEvidenceItem
// in lib/hearingPack.js), which this tab's existing, generic "any
// evidence item with a dataUrl gets a Download entry" behaviour
// (lib/caseDocuments.js) already surfaces with no Documents-tab-specific
// code needed — this proves that surfacing actually happens end to end.
describe('DocumentsTab — a generated hearing pack remains retrievable (Batch 2, Part 2)', () => {
  it('lists a previously generated hearing pack with a working Download link', () => {
    const csWithPack = { ...cs, evidence: [
      { id: 'ev1', name: 'Hearing Pack', type: 'application/pdf', date: '31/08/2026', size: 20480, addedBy: 'Jo', source: 'hearing_pack', dataUrl: 'data:application/pdf;base64,AAAA' },
    ] };
    render(<DocumentsTab cs={csWithPack} fmtDate={d=>d} onGenerateHearingPack={()=>{}} hearingPackGenerating={false} />);
    expect(screen.getByText('Hearing Pack')).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: 'Download' });
    expect(downloadLink).toHaveAttribute('href', 'data:application/pdf;base64,AAAA');
    expect(downloadLink).toHaveAttribute('download', 'Hearing Pack');
  });
});

// Human UAT remediation, Batch 2 hardening — the original UAT complaint
// was that a generated pack "should pop up when generated rather than
// just appearing below which is not obvious". Persisting it to Documents
// (above) fixed later findability but not the immediate moment of
// completion — this is the completion banner that closes that gap.
describe('DocumentsTab — Building Pack immediate completion banner (Batch 2 hardening)', () => {
  it('shows no completion banner when nothing has just finished generating', () => {
    render(<DocumentsTab cs={cs} fmtDate={d=>d} hearingPackGenerating={false} hearingPackReady={null} />);
    expect(screen.queryByText('Hearing pack ready')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('shows an unmistakable "ready" banner with a Review action once generation finishes, and Review opens the generated pack', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    render(<DocumentsTab cs={cs} fmtDate={d=>d} hearingPackGenerating={false} hearingPackReady={{ dataUrl: 'data:application/pdf;base64,AAAA', fileName: 'Hearing Pack' }} />);
    expect(screen.getByText('Hearing pack ready')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(openSpy).toHaveBeenCalledWith('data:application/pdf;base64,AAAA', '_blank');
    openSpy.mockRestore();
  });

  it('dismisses the banner via its own close control, not by navigating the user away', async () => {
    const user = userEvent.setup();
    const onDismissHearingPackReady = vi.fn();
    render(<DocumentsTab cs={cs} fmtDate={d=>d} hearingPackGenerating={false} hearingPackReady={{ dataUrl: 'data:application/pdf;base64,AAAA' }} onDismissHearingPackReady={onDismissHearingPackReady} />);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissHearingPackReady).toHaveBeenCalled();
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
