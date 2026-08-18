import { describe, it, expect } from 'vitest';
import { buildEmployeeSnapshot, mergeHrisEmployeesIntoRecords } from '../lib/employeeHistory.js';

describe('buildEmployeeSnapshot (Phase 5, IP20)', () => {
  it('captures the relevant fields plus a capturedAt timestamp', () => {
    const snapshot = buildEmployeeSnapshot({ jobTitle: 'Team Lead', location: 'Manchester', department: 'Ops', manager: 'Jo Smith', status: 'active', workingPattern: 'full_time' });
    expect(snapshot).toMatchObject({ jobTitle: 'Team Lead', site: 'Manchester', department: 'Ops', manager: 'Jo Smith', status: 'active', workingPattern: 'full_time' });
    expect(snapshot.capturedAt).toBeTruthy();
  });

  it('returns null for a missing employee record rather than a snapshot of nothing', () => {
    expect(buildEmployeeSnapshot(null)).toBeNull();
    expect(buildEmployeeSnapshot(undefined)).toBeNull();
  });

  it('defaults missing fields to null, not undefined', () => {
    const snapshot = buildEmployeeSnapshot({ jobTitle: 'Team Lead' });
    expect(snapshot.site).toBeNull();
    expect(snapshot.department).toBeNull();
    expect(snapshot.manager).toBeNull();
    expect(snapshot.status).toBeNull();
    expect(snapshot.workingPattern).toBeNull();
  });
});

describe('mergeHrisEmployeesIntoRecords (Phase 5, IP20)', () => {
  it('adds a new employee not already in the records', () => {
    const result = mergeHrisEmployeesIntoRecords([], [{ name: 'Sarah Jones', jobTitle: 'Team Lead', site: 'Manchester', manager: 'Jo Smith' }]);
    expect(result).toEqual([{ name: 'Sarah Jones', jobTitle: 'Team Lead', startDate: '', location: 'Manchester', employeeNumber: '', department: '', manager: 'Jo Smith', status: '', workingPattern: '', probationEndDate: '' }]);
  });

  it('updates an existing employee matched by name, without touching other unrelated records', () => {
    const existing = [{ name: 'Sarah Jones', jobTitle: 'Old Title', startDate: '01/01/2020', location: 'London' }, { name: 'James Smith', jobTitle: 'Analyst' }];
    const result = mergeHrisEmployeesIntoRecords(existing, [{ name: 'Sarah Jones', jobTitle: 'Team Lead', site: 'Manchester' }]);
    expect(result.find(r => r.name === 'Sarah Jones')).toMatchObject({ jobTitle: 'Team Lead', location: 'Manchester' });
    expect(result.find(r => r.name === 'James Smith')).toEqual({ name: 'James Smith', jobTitle: 'Analyst' });
  });

  it('skips an incoming record with no name', () => {
    const result = mergeHrisEmployeesIntoRecords([], [{ jobTitle: 'No name here' }]);
    expect(result).toEqual([]);
  });

  it('does not mutate the original records array', () => {
    const existing = [{ name: 'Sarah Jones', jobTitle: 'Old Title' }];
    mergeHrisEmployeesIntoRecords(existing, [{ name: 'Sarah Jones', jobTitle: 'Team Lead' }]);
    expect(existing[0].jobTitle).toBe('Old Title');
  });

  it('handles empty/missing input gracefully', () => {
    expect(mergeHrisEmployeesIntoRecords(undefined, undefined)).toEqual([]);
    expect(mergeHrisEmployeesIntoRecords([], [])).toEqual([]);
  });
});
