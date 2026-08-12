import { describe, it, expect } from 'vitest';
import { newEvidenceSinceFinding, appealMeetingsForCase } from '../lib/appealReview';

describe('newEvidenceSinceFinding', () => {
  const decidedAllegation = { id: 'a1', decidedAt: '2026-08-01T00:00:00.000Z' };

  it('returns evidence dated after the finding was decided', () => {
    const evidence = [
      { name: 'New witness statement', date: '05/08/2026' },
      { name: 'Old CCTV clip', date: '20/07/2026' },
    ];
    const result = newEvidenceSinceFinding(evidence, decidedAllegation);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New witness statement');
    expect(result[0].index).toBe(0);
  });

  it('returns an empty array when the allegation has no recorded finding yet', () => {
    const evidence = [{ name: 'x', date: '05/08/2026' }];
    expect(newEvidenceSinceFinding(evidence, { id: 'a1', decidedAt: null })).toEqual([]);
  });

  it('returns an empty array when nothing was added after the finding', () => {
    const evidence = [{ name: 'x', date: '20/07/2026' }];
    expect(newEvidenceSinceFinding(evidence, decidedAllegation)).toEqual([]);
  });

  it('handles ISO-formatted evidence dates as well as en-GB', () => {
    const evidence = [{ name: 'x', date: '2026-08-10' }];
    expect(newEvidenceSinceFinding(evidence, decidedAllegation)).toHaveLength(1);
  });
});

describe('appealMeetingsForCase', () => {
  it('finds a saved meeting whose type mentions appeal', () => {
    const cs = { meetings: [{ id: 'm1', type: 'Disciplinary Appeal', record: 'Full record text' }] };
    expect(appealMeetingsForCase(cs)).toHaveLength(1);
  });

  it('ignores an appeal meeting with no record yet', () => {
    const cs = { meetings: [{ id: 'm1', type: 'Disciplinary Appeal', record: '' }] };
    expect(appealMeetingsForCase(cs)).toHaveLength(0);
  });

  it('ignores non-appeal meetings', () => {
    const cs = { meetings: [{ id: 'm1', type: 'Disciplinary', record: 'x' }] };
    expect(appealMeetingsForCase(cs)).toHaveLength(0);
  });

  it('returns an empty array for a case with no meetings', () => {
    expect(appealMeetingsForCase({ meetings: [] })).toEqual([]);
    expect(appealMeetingsForCase({})).toEqual([]);
  });
});
