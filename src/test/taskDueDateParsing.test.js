import { describe, it, expect } from 'vitest';
import { parseCommitmentDueDate, suggestTaskOwner } from '../lib/taskDueDateParsing.js';

const FROM = new Date('2026-01-01T00:00:00.000Z');

describe('parseCommitmentDueDate (Phase 5, IP24)', () => {
  it('parses digit-number commitments across day/week/fortnight/month units', () => {
    expect(parseCommitmentDueDate('follow up in 10 days', FROM)).toBe('2026-01-11');
    expect(parseCommitmentDueDate('review in 2 weeks', FROM)).toBe('2026-01-15');
    expect(parseCommitmentDueDate('check in after 1 fortnight', FROM)).toBe('2026-01-15');
    expect(parseCommitmentDueDate('review in 3 months', FROM)).toBe('2026-03-31');
  });

  it('parses word-number commitments, including "a"/"an"', () => {
    expect(parseCommitmentDueDate('review after six weeks', FROM)).toBe('2026-02-12');
    expect(parseCommitmentDueDate('follow up in a month', FROM)).toBe('2026-01-31');
    expect(parseCommitmentDueDate('check back in an hour or two', FROM)).toBeNull();
  });

  it('is case-insensitive and works mid-sentence', () => {
    expect(parseCommitmentDueDate('HR should review progress again in TWO WEEKS and confirm.', FROM)).toBe('2026-01-15');
  });

  it('returns null when no commitment phrase is present', () => {
    expect(parseCommitmentDueDate('Chase the outstanding witness statement.', FROM)).toBeNull();
    expect(parseCommitmentDueDate('', FROM)).toBeNull();
    expect(parseCommitmentDueDate(null, FROM)).toBeNull();
    expect(parseCommitmentDueDate(undefined, FROM)).toBeNull();
  });

  it('defaults fromDate to now when not given', () => {
    const result = parseCommitmentDueDate('review in 1 week');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('suggestTaskOwner (Phase 5, IP24)', () => {
  const orgMembers = [{ id: 'm1', name: 'Jo Smith' }, { id: 'm2', name: 'Sam Lee' }];

  it('resolves the case owner\'s real name from orgMembers when ownerId matches', () => {
    expect(suggestTaskOwner({ ownerId: 'm1' }, orgMembers)).toBe('Jo Smith');
  });

  it('falls back to manager, then investigatingManager, when ownerId has no match', () => {
    expect(suggestTaskOwner({ ownerId: 'nope', manager: 'Alex Manager' }, orgMembers)).toBe('Alex Manager');
    expect(suggestTaskOwner({ investigatingManager: 'Pat Investigator' }, orgMembers)).toBe('Pat Investigator');
  });

  it('returns "" rather than inventing a name when nothing is known', () => {
    expect(suggestTaskOwner({}, orgMembers)).toBe('');
    expect(suggestTaskOwner(null, orgMembers)).toBe('');
  });
});
