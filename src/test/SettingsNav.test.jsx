import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsNav } from '../screens/settings/SettingsNav.jsx';

// Phase 6.5 hardening (Batch 13) — the mobile collapsed-nav select had
// no accessible name at all. Had no test coverage at all before this.
const sections = [{ id: 'org', label: 'Organisation' }, { id: 'team', label: 'Team & Access' }];

describe('SettingsNav — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the mobile section select', () => {
    render(<SettingsNav sections={sections} active="org" onChange={() => {}} isMobile />);
    expect(screen.getByLabelText('Settings section')).toBeInTheDocument();
  });
});
