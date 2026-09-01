import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { PromptModal } from '../components/PromptModal.jsx';
import { WhySourcesModal } from '../components/WhySourcesModal.jsx';
import { SignedRecordModal } from '../components/SignedRecordModal.jsx';
import { CasesScreen } from '../screens/CasesScreen.jsx';
import { CalendarScreen } from '../screens/CalendarScreen.jsx';

// Phase 6.5 hardening (accessibility pass) — automated coverage
// complementing the manual keyboard-testing checklist
// (docs/ACCESSIBILITY_KEYBOARD_CHECKLIST.md): axe-core catches the
// mechanically-detectable subset of WCAG issues (missing accessible
// names, invalid ARIA, colour-contrast, duplicate ids, etc.) on every
// run, on the same components this whole review's manual audit focused
// on — modals (focus management) and the case list (case navigation).
// This is deliberately a small, representative set, not exhaustive
// coverage of every screen — see the review's own final report for what
// remains manual-only (real focus-order/visibility, screen-reader
// announcement wording, and anything timing- or animation-dependent that
// axe's static DOM snapshot can't evaluate).
const noop = () => {};

describe('axe accessibility smoke tests', () => {
  it('ConfirmModal has no detectable violations', async () => {
    const { container } = render(
      <ConfirmModal title="Delete this case?" message="This cannot be undone." onConfirm={noop} onCancel={noop} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PromptModal has no detectable violations', async () => {
    const { container } = render(
      <PromptModal
        title="Rename theme"
        message="Choose a new name."
        fields={[{ key: 'name', label: 'Name', required: true }]}
        onConfirm={noop}
        onCancel={noop}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('WhySourcesModal has no detectable violations', async () => {
    const { container } = render(
      <WhySourcesModal
        title="Why Compass flagged this"
        reasoning="Two prior meetings referenced the same allegation."
        sourceRefs={[{ kind: 'meeting', id: 'm1', label: 'Investigation meeting' }]}
        resolveRef={ref => ref}
        onClose={noop}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  // Human UAT remediation, Batch 2, Part 9/16 — the durable, in-Compass
  // signed-record viewer this batch added.
  it('SignedRecordModal has no detectable violations, signed and acknowledged alike', async () => {
    const meeting = { type: 'Disciplinary', date: '31/08/2026', signStatus: 'signed', signerName: 'Sam Employee', signedAt: '31/08/2026', record: 'Meeting Details\n\nType: Disciplinary', signature: 'data:image/png;base64,AAAA' };
    const { container, rerender } = render(<SignedRecordModal meeting={meeting} fmtDate={d => d} onClose={noop} />);
    expect(await axe(container)).toHaveNoViolations();

    rerender(<SignedRecordModal meeting={{ ...meeting, signStatus: 'acknowledged', signature: null }} fmtDate={d => d} onClose={noop} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CasesScreen (case navigation) has no detectable violations, including the loading and empty states', async () => {
    const cases = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open', ownerId: 'u1' }];
    const baseProps = {
      locations: [{ id: 'l1', name: 'Manchester' }], orgMembers: [{ user_id: 'u1', name: 'Alex' }],
      setIntake: noop, setScreen: noop, getCaseStage: () => 'open', setActiveCaseId: noop, setActiveCaseStage: noop,
      getNextStep: () => null, getProceedingTitle: cs => cs.employeeName, getCaseStatus: () => ({ label: 'Open', color: '#000', bg: '#fff' }),
      saveCases: noop, confirmDialog: noop, showToast: noop,
    };
    const { container, rerender } = render(<CasesScreen {...baseProps} cases={cases} casesLoading={false} />);
    expect(await axe(container)).toHaveNoViolations();

    rerender(<CasesScreen {...baseProps} cases={[]} casesLoading={true} />);
    expect(await axe(container)).toHaveNoViolations();

    rerender(<CasesScreen {...baseProps} cases={[]} casesLoading={false} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CalendarScreen has no detectable violations, including the schedule-meeting modal', async () => {
    const cases = [{ id: 'c1', employeeName: 'Sarah Jones', caseType: 'misconduct' }];
    const { container } = render(
      <CalendarScreen cases={cases} setScreen={noop} screens={{}} setActiveCaseId={noop} setActiveCaseStage={noop} onScheduleMeeting={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
