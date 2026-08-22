import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeopleScreen } from '../screens/PeopleScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the search field relied on
// placeholder text alone, with no other accessible name. Had no test
// coverage at all before this.
const noop = () => {};

describe('PeopleScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the search field', () => {
    render(<PeopleScreen cases={[]} setActivePerson={noop} setScreen={noop} setCaseInfo={noop} setMeetingSetup={noop} />);
    expect(screen.getByLabelText('Search people')).toBeInTheDocument();
  });
});
