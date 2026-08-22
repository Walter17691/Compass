import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeScreen } from '../screens/HomeScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the dashboard case-search field
// relied on placeholder text alone, with no other accessible name. Had
// no test coverage at all before this.
const noop = () => {};

describe('HomeScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the dashboard case-search field', () => {
    render(<HomeScreen cases={[]} getCaseStage={() => 'open'} currentUser={{ name: 'Alex' }} getNextStep={() => null} setMeetingSetup={noop} setScreen={noop} setShowCasePrompt={noop} dueSoon={[]} dashSearch="" setDashSearch={noop} dashFilter="all" setDashFilter={noop} setActiveCaseId={noop} setActiveCaseStage={noop} fmtDate={d => d} showToast={noop} calendarConnected={false} connectGoogleCalendar={noop} disconnectGoogleCalendar={noop} setSettingsSection={noop} isHR={true} />);
    expect(screen.getByLabelText('Search cases')).toBeInTheDocument();
  });
});
