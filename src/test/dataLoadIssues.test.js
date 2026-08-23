import { describe, it, expect } from 'vitest';
import { addLoadIssue, removeLoadIssue } from '../lib/dataLoadIssues';

// Phase 6.5 hardening (accessibility/UX reliability pass) — the known
// issue: every one of App.jsx's ~20 org-data loaders used to silently
// swallow a fetch failure, leaving each screen's own "No X yet" empty
// state indistinguishable from a genuine network/permission failure.
// These two pure functions manage the list of currently-failing entity
// labels behind the shared banner that now surfaces that distinction.
describe('addLoadIssue', () => {
  it('adds a new label to an empty list', () => {
    expect(addLoadIssue([], 'cases')).toEqual(['cases']);
  });

  it('appends a new label to an existing list', () => {
    expect(addLoadIssue(['cases'], 'allegations')).toEqual(['cases', 'allegations']);
  });

  it('does not duplicate a label already present', () => {
    expect(addLoadIssue(['cases'], 'cases')).toEqual(['cases']);
  });

  it('returns the exact same array reference when nothing changes (avoids an unnecessary re-render)', () => {
    const list = ['cases'];
    expect(addLoadIssue(list, 'cases')).toBe(list);
  });

  it('treats a missing list as empty', () => {
    expect(addLoadIssue(null, 'cases')).toEqual(['cases']);
    expect(addLoadIssue(undefined, 'cases')).toEqual(['cases']);
  });
});

describe('removeLoadIssue', () => {
  it('removes a present label', () => {
    expect(removeLoadIssue(['cases', 'allegations'], 'cases')).toEqual(['allegations']);
  });

  it('is a no-op for a label that was never present', () => {
    expect(removeLoadIssue(['cases'], 'allegations')).toEqual(['cases']);
  });

  it('returns the exact same array reference when nothing changes', () => {
    const list = ['cases'];
    expect(removeLoadIssue(list, 'allegations')).toBe(list);
  });

  it('treats a missing list as empty', () => {
    expect(removeLoadIssue(null, 'cases')).toEqual([]);
  });
});
