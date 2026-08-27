import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Phase 6.5 hardening (closes Prompt 11 audit finding 10.3, MEDIUM) —
// runSearch used to fire directly from the input's own onChange, re-running
// its full in-memory scan on every keystroke.
describe('SearchScreen — search is debounced, not run on every keystroke (Prompt 11 audit, 10.3)', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('updates searchQuery immediately for a responsive input, but delays runSearch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let query = '';
    const setSearchQuery = vi.fn(v => { query = v; });
    const runSearch = vi.fn();
    const { rerender } = render(<SearchScreen searchQuery={query} setSearchQuery={setSearchQuery} runSearch={runSearch} searchResults={[]} setScreen={noop} setExpandedCases={noop} cases={[]} setViewMeeting={noop} setViewCaseId={noop} dueSoon={[]} setActivePerson={noop} />);
    runSearch.mockClear(); // ignore the initial-mount call with the empty query

    await user.type(screen.getByLabelText('Search'), 'sam');
    expect(setSearchQuery).toHaveBeenCalledTimes(3); // one call per keystroke — the input itself stays responsive
    expect(runSearch).not.toHaveBeenCalled(); // but the expensive scan hasn't fired yet

    rerender(<SearchScreen searchQuery="sam" setSearchQuery={setSearchQuery} runSearch={runSearch} searchResults={[]} setScreen={noop} setExpandedCases={noop} cases={[]} setViewMeeting={noop} setViewCaseId={noop} dueSoon={[]} setActivePerson={noop} />);
    act(() => { vi.advanceTimersByTime(250); });
    expect(runSearch).toHaveBeenCalledTimes(1);
    expect(runSearch).toHaveBeenCalledWith('sam');
  });
});
