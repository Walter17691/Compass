import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Phase 7.5B (P0 polish, item 8) — `groups` is strictly additive/opt-in.
// InsightsScreen's own call site never passes it, so its rendering must
// stay byte-for-byte the flat list it always was; SettingsScreen's call
// site opts in and must show category headers without dropping,
// renaming, or rerouting any section.
describe('SettingsNav — optional grouping (Phase 7.5B, item 8)', () => {
  it('renders the flat list unchanged when groups is omitted (existing InsightsScreen behaviour)', () => {
    render(<SettingsNav sections={sections} active="org" onChange={() => {}} />);
    expect(screen.queryByText('Organisation')).toBeInTheDocument(); // the section button itself
    // No category-header wrapper divs beyond the plain nav — every
    // section is a direct button, same as before this change.
    expect(screen.getByRole('button', { name: 'Organisation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Team & Access' })).toBeInTheDocument();
  });

  it('groups sections under category headers when groups is provided, without losing or renaming any section', () => {
    const groups = [{ label: 'Org basics', sectionIds: ['org'] }];
    render(<SettingsNav sections={sections} active="org" onChange={() => {}} groups={groups} />);
    expect(screen.getByText('Org basics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organisation' })).toBeInTheDocument();
    // 'team' isn't listed in any group's sectionIds — must still render,
    // ungrouped, not silently disappear.
    expect(screen.getByRole('button', { name: 'Team & Access' })).toBeInTheDocument();
  });

  it('clicking a grouped section button still calls onChange with the right id', () => {
    const onChange = vi.fn();
    const groups = [{ label: 'Org basics', sectionIds: ['org'] }];
    render(<SettingsNav sections={sections} active="team" onChange={onChange} groups={groups} />);
    fireEvent.click(screen.getByRole('button', { name: 'Organisation' }));
    expect(onChange).toHaveBeenCalledWith('org');
  });

  it('omits a group header entirely if none of its sectionIds match any current section (e.g. every item in it is role-gated away)', () => {
    const groups = [{ label: 'Org basics', sectionIds: ['org'] }, { label: 'Nothing here', sectionIds: ['does-not-exist'] }];
    render(<SettingsNav sections={sections} active="org" onChange={() => {}} groups={groups} />);
    expect(screen.queryByText('Nothing here')).not.toBeInTheDocument();
  });
});
