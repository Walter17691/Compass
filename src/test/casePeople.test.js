import { describe, it, expect } from 'vitest';
import { derivePeopleForCase } from '../lib/casePeople';

describe('derivePeopleForCase', () => {
  it('includes the employee', () => {
    const result = derivePeopleForCase({ employeeName: 'Ada Lovelace', meetings: [], evidence: [] });
    expect(result).toEqual([{ name: 'Ada Lovelace', roles: ['Employee'] }]);
  });

  it('includes each meeting chair and participant, deduped across meetings', () => {
    const cs = {
      employeeName: 'Ada Lovelace',
      meetings: [
        { manager: 'Jo Chair', participants: [{ name: 'Sam Witness', role: 'Witness' }] },
        { manager: 'Jo Chair', participants: [{ name: 'Sam Witness', role: 'Witness' }, { name: 'Pat Rep', role: 'Representative' }] },
      ],
      evidence: [],
    };
    const result = derivePeopleForCase(cs);
    expect(result.map(p => p.name)).toEqual(['Ada Lovelace', 'Jo Chair', 'Pat Rep', 'Sam Witness']);
    expect(result.find(p => p.name === 'Sam Witness').roles).toEqual(['Witness']);
  });

  it('merges roles for the same person appearing in different capacities', () => {
    const cs = {
      employeeName: 'Ada Lovelace',
      meetings: [{ manager: 'Ada Lovelace', participants: [] }], // same person chairs a later meeting
      evidence: [],
    };
    const result = derivePeopleForCase(cs);
    expect(result.find(p => p.name === 'Ada Lovelace').roles).toEqual(['Employee', 'Chair']);
  });

  it('extracts witness names from witness-statement evidence entries', () => {
    const cs = {
      employeeName: 'Ada Lovelace',
      meetings: [],
      evidence: [{ type: 'Witness statement', name: 'Witness: Robin Hood (05/08/2026)' }, { type: 'Document', name: 'CCTV log' }],
    };
    const result = derivePeopleForCase(cs);
    expect(result.map(p => p.name)).toContain('Robin Hood');
    expect(result.map(p => p.name)).not.toContain('CCTV log');
  });

  it('ignores blank names and sorts alphabetically', () => {
    const cs = { employeeName: '  ', meetings: [{ manager: '', participants: [{ name: 'Zed', role: 'x' }, { name: 'Amy', role: 'x' }] }], evidence: [] };
    const result = derivePeopleForCase(cs);
    expect(result.map(p => p.name)).toEqual(['Amy', 'Zed']);
  });
});
