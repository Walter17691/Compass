import { describe, it, expect } from 'vitest';
import { resolveLetterGrounding, buildRecipientInstruction } from '../lib/letterGrounding.js';

const goldenPathEmployee = 'UAT - Test Employee (Golden Path)';

// Defect #20 remediation — the actual production bug: a caller does
// setCaseInfo(...) then calls handleLetter(...) synchronously in the same
// handler, but handleLetter reads caseInfo via closure, so it sees
// whatever caseInfo held from the LAST completed render, not the value
// the caller just requested. These tests reproduce that exact shape
// directly (old/empty caseInfo + a caller-supplied override), without
// needing to simulate React's render timing at all.
describe('resolveLetterGrounding — Defect #20 stale-state reproduction', () => {
  it('uses the caller-supplied override for employee/manager/date even when caseInfo still holds the old (empty) values', () => {
    const staleCaseInfo = { employee: '', manager: '', date: '' };
    const result = resolveLetterGrounding({
      caseInfo: staleCaseInfo,
      overrides: { employeeName: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' },
    });
    expect(result).toEqual({ employee: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' });
  });

  it('falls back to caseInfo when no override is supplied (existing "Regenerate" call sites, which never pass overrides)', () => {
    const settledCaseInfo = { employee: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' };
    const result = resolveLetterGrounding({ caseInfo: settledCaseInfo, overrides: {} });
    expect(result).toEqual({ employee: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' });
  });

  it('falls back to caseInfo when overrides is omitted entirely', () => {
    const settledCaseInfo = { employee: goldenPathEmployee, manager: '', date: '' };
    expect(resolveLetterGrounding({ caseInfo: settledCaseInfo })).toEqual({ employee: goldenPathEmployee, manager: '', date: '' });
  });

  it('a real (non-empty) override always wins over caseInfo, even if caseInfo also happens to be correct — the override is the authoritative, just-computed value', () => {
    const caseInfo = { employee: 'Some Other Name', manager: 'Some Other Manager', date: '2020-01-01' };
    const result = resolveLetterGrounding({ caseInfo, overrides: { employeeName: goldenPathEmployee, manager: 'Walter Carta', date: '2026-09-07' } });
    expect(result.employee).toBe(goldenPathEmployee);
    expect(result.manager).toBe('Walter Carta');
    expect(result.date).toBe('2026-09-07');
  });

  it('does not throw when caseInfo itself is missing', () => {
    expect(() => resolveLetterGrounding({ overrides: { employeeName: goldenPathEmployee } })).not.toThrow();
    expect(resolveLetterGrounding({ overrides: { employeeName: goldenPathEmployee } }).employee).toBe(goldenPathEmployee);
  });
});

// Defect #11/#19/#20 remediation — proves the AI context/instruction
// unambiguously identifies the correct employee as recipient, scoped only
// to employee-directed letter types, and never itself depends on or
// mentions any other narrative person (e.g. O'Brien-Test) — it simply
// doesn't reference them at all, which is the point: the model is told
// who to address, not told who NOT to address by name.
describe('buildRecipientInstruction — Golden Path generation context (Defect #11/#19/#20)', () => {
  it('names the known employee explicitly as the intended recipient for an outcome letter', () => {
    const instruction = buildRecipientInstruction(goldenPathEmployee, 'outcome');
    expect(instruction).toContain('INTENDED RECIPIENT: ' + goldenPathEmployee);
    expect(instruction).toContain(`Dear ${goldenPathEmployee},`);
  });

  it('never mentions any other narrative person (e.g. O\'Brien-Test) — it only ever names the known employee', () => {
    const instruction = buildRecipientInstruction(goldenPathEmployee, 'outcome');
    expect(instruction).not.toContain("O'Brien-Test");
  });

  it('instructs the model not to substitute another named person or leave a placeholder', () => {
    const instruction = buildRecipientInstruction(goldenPathEmployee, 'outcome');
    expect(instruction.toLowerCase()).toMatch(/do not address it to any other person/);
    expect(instruction.toLowerCase()).toMatch(/do not leave the recipient's name as a placeholder/);
  });

  it.each(['outcome', 'invite', 'appeal', 'suspension', 'no-case-answer', 'grievance'])(
    'is produced for the employee-directed letter type "%s" when the employee is known',
    (letterType) => {
      expect(buildRecipientInstruction(goldenPathEmployee, letterType)).not.toBe('');
    }
  );

  it('is not produced for a non-employee-directed letter type (witness invitation — legitimately addressed to someone else)', () => {
    expect(buildRecipientInstruction(goldenPathEmployee, 'witness-invitation')).toBe('');
  });

  it('is not produced for an internal, non-addressed document type (investigation report)', () => {
    expect(buildRecipientInstruction(goldenPathEmployee, 'investigation-report')).toBe('');
  });

  it('is not produced when the employee is not actually known', () => {
    expect(buildRecipientInstruction('', 'outcome')).toBe('');
    expect(buildRecipientInstruction(null, 'outcome')).toBe('');
    expect(buildRecipientInstruction(undefined, 'outcome')).toBe('');
  });
});
