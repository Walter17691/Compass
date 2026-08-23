import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseCommitmentDueDate, suggestTaskOwner } from '../lib/taskDueDateParsing.js';

const FROM = new Date('2026-01-01T00:00:00.000Z');

let originalTZ;
beforeAll(() => { originalTZ = process.env.TZ; process.env.TZ = 'Europe/London'; });
afterAll(() => { process.env.TZ = originalTZ; });

describe('parseCommitmentDueDate (Phase 5, IP24)', () => {
  it('parses digit-number commitments across day/week/fortnight/month units', () => {
    expect(parseCommitmentDueDate('follow up in 10 days', FROM)).toBe('2026-01-11');
    expect(parseCommitmentDueDate('review in 2 weeks', FROM)).toBe('2026-01-15');
    expect(parseCommitmentDueDate('check in after 1 fortnight', FROM)).toBe('2026-01-15');
    // Phase 6.5 hardening (P1, reliability review) — was asserted as
    // '2026-03-31' before this review's UTC-conversion fix (see this
    // file's new BST regression test below): 90 days from 1 Jan 2026 is
    // genuinely 1 April 2026 by calendar-day count (30 remaining Jan days
    // + 28 Feb + 31 Mar + 1 = 90); the old expectation only "passed"
    // because the previous due.toISOString() implementation rolled the
    // true local date back by one once the window crossed into BST.
    expect(parseCommitmentDueDate('review in 3 months', FROM)).toBe('2026-04-01');
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

  // Phase 6.5 hardening (P1, reliability review) — regression test for a
  // real bug: this function used to format with due.toISOString(), which
  // converts to UTC first. During BST (UTC+1), any fromDate whose local
  // time-of-day is between midnight and 1am converts to the PREVIOUS UTC
  // day, silently backdating the parsed due date by one — the exact bug
  // class dates.js's own toISODateLocal exists to avoid (see its header
  // comment). 00:30 BST on 10 June 2026 is 23:30 UTC on 9 June.
  it('does not roll the due date back a day for an early-morning BST time (UTC conversion bug)', () => {
    const midnightBST = new Date(2026, 5, 10, 0, 30, 0); // 10 Jun 2026, 00:30 local (BST)
    const result = parseCommitmentDueDate('follow up in 10 days', midnightBST);
    expect(result).toBe('2026-06-20');
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
