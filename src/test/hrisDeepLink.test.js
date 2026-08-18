import { describe, it, expect } from 'vitest';
import { parseEmployeeDeepLink, findCasesForEmployee } from '../lib/hrisDeepLink.js';

describe('parseEmployeeDeepLink (Phase 5, IP21)', () => {
  it('extracts and trims the employee name from an ?employee= param', () => {
    expect(parseEmployeeDeepLink('?employee=Sarah%20Jones')).toBe('Sarah Jones');
    expect(parseEmployeeDeepLink('?employee=  James Smith  ')).toBe('James Smith');
  });

  it('returns null when there is no employee param', () => {
    expect(parseEmployeeDeepLink('?screen=cases')).toBeNull();
    expect(parseEmployeeDeepLink('')).toBeNull();
    expect(parseEmployeeDeepLink(undefined)).toBeNull();
  });

  it('returns null for a present but empty/whitespace-only param', () => {
    expect(parseEmployeeDeepLink('?employee=')).toBeNull();
    expect(parseEmployeeDeepLink('?employee=%20%20')).toBeNull();
  });
});

describe('findCasesForEmployee (Phase 5, IP21)', () => {
  const cases = [
    { id: '1', employeeName: 'Sarah Jones' },
    { id: '2', employeeName: 'sarah jones' },
    { id: '3', employeeName: 'James Smith' },
  ];

  it('matches case-insensitively and trims whitespace', () => {
    expect(findCasesForEmployee(cases, 'Sarah Jones').map(c=>c.id)).toEqual(['1','2']);
    expect(findCasesForEmployee(cases, '  SARAH JONES  ').map(c=>c.id)).toEqual(['1','2']);
  });

  it('returns an empty array when no case matches', () => {
    expect(findCasesForEmployee(cases, 'Nobody Here')).toEqual([]);
  });

  it('handles empty/missing input gracefully', () => {
    expect(findCasesForEmployee(cases, '')).toEqual([]);
    expect(findCasesForEmployee(cases, null)).toEqual([]);
    expect(findCasesForEmployee(undefined, 'Sarah Jones')).toEqual([]);
  });
});
