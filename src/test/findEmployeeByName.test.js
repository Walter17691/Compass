import { describe, it, expect } from 'vitest';
import { findEmployeeByName } from '../App.jsx';

describe('findEmployeeByName', () => {
  // Regression test for a real production bug: a stray employee_records
  // row with an empty name (job_title "Waiter") was silently matching
  // any blank employee-name field, auto-filling the wrong job title
  // into a brand new case or meeting for a completely different person.
  it('never matches a blank-name record when the query name is empty', () => {
    const records = [
      { name: '', jobTitle: 'Waiter' },
      { name: 'Francesco Totti', jobTitle: 'Assistant Manager' },
    ];
    expect(findEmployeeByName(records, '')).toBeNull();
  });

  it('never matches a blank-name record when the query name is missing entirely', () => {
    const records = [{ name: '', jobTitle: 'Waiter' }];
    expect(findEmployeeByName(records, undefined)).toBeNull();
    expect(findEmployeeByName(records, null)).toBeNull();
  });

  it('finds the record with an exact name match', () => {
    const records = [
      { name: 'Francesco Totti', jobTitle: 'Assistant Manager' },
      { name: 'Sergio Retu', jobTitle: 'Chef' },
    ];
    expect(findEmployeeByName(records, 'Sergio Retu')).toEqual({ name: 'Sergio Retu', jobTitle: 'Chef' });
  });

  it('returns null when there is no match', () => {
    const records = [{ name: 'Francesco Totti', jobTitle: 'Assistant Manager' }];
    expect(findEmployeeByName(records, 'Nobody Here')).toBeNull();
  });

  it('handles a missing or empty records array', () => {
    expect(findEmployeeByName(undefined, 'Anyone')).toBeNull();
    expect(findEmployeeByName([], 'Anyone')).toBeNull();
  });
});
