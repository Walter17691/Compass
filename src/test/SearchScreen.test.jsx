import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchScreen } from '../screens/SearchScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the search field relied on
// placeholder text alone, with no other accessible name. Had no test
// coverage at all before this.
const noop = () => {};

describe('SearchScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the search field', () => {
    render(<SearchScreen searchQuery="" setSearchQuery={noop} runSearch={noop} searchResults={[]} setScreen={noop} setExpandedCases={noop} cases={[]} setViewMeeting={noop} setViewCaseId={noop} dueSoon={[]} setActivePerson={noop} />);
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});
