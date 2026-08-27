import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTemplateForType, resolveDefaultTaskDueDate } from '../lib/processTemplates.js';

describe('getTemplateForType', () => {
  it('returns the template matching the given process type id', () => {
    const templates = [
      { process_type: 'misconduct', default_tasks: [] },
      { process_type: 'grievance', default_tasks: [] },
    ];
    expect(getTemplateForType(templates, 'grievance').process_type).toBe('grievance');
  });

  it('returns null when no template exists for that process type', () => {
    expect(getTemplateForType([{ process_type: 'misconduct' }], 'grievance')).toBeNull();
  });

  it('returns null for an empty or missing template list', () => {
    expect(getTemplateForType([], 'misconduct')).toBeNull();
    expect(getTemplateForType(null, 'misconduct')).toBeNull();
  });
});

describe('resolveDefaultTaskDueDate', () => {
  it('adds the day offset to the given from-date', () => {
    expect(resolveDefaultTaskDueDate(5, '2026-08-01')).toBe('2026-08-06');
  });

  it('supports a negative day offset (before the from-date)', () => {
    expect(resolveDefaultTaskDueDate(-2, '2026-08-01')).toBe('2026-07-30');
  });

  it('returns an empty string when dayOffset is null, undefined or blank', () => {
    expect(resolveDefaultTaskDueDate(null, '2026-08-01')).toBe('');
    expect(resolveDefaultTaskDueDate(undefined, '2026-08-01')).toBe('');
    expect(resolveDefaultTaskDueDate('', '2026-08-01')).toBe('');
  });

  it('treats a dayOffset of 0 as "due on the from-date", not blank', () => {
    expect(resolveDefaultTaskDueDate(0, '2026-08-01')).toBe('2026-08-01');
  });

  it('falls back to today when no from-date is given', () => {
    const result = resolveDefaultTaskDueDate(0, null);
    expect(result).toBe(new Date().toISOString().split('T')[0]);
  });

  it('returns an empty string for an unparseable from-date', () => {
    expect(resolveDefaultTaskDueDate(3, 'not-a-date')).toBe('');
  });

  // Phase 6.5 hardening (closes Prompt 11 audit finding 3.9, MEDIUM) —
  // reproduced live: mixing a UTC-parsed from-date with local setDate()
  // arithmetic, then reading back via toISOString() (UTC), could land the
  // result one UTC calendar day early whenever the added range crossed
  // the UK's spring-forward DST transition (clocks skip 1am-2am on the
  // last Sunday of March).
  describe('correct across the UK spring-forward DST transition (Prompt 11 audit, 3.9)', () => {
    let originalTZ;
    beforeAll(() => { originalTZ = process.env.TZ; process.env.TZ = 'Europe/London'; });
    afterAll(() => { process.env.TZ = originalTZ; });

    it('adds 5 days across 2026-03-25 -> 2026-03-30, spanning the 29 March clock change', () => {
      expect(resolveDefaultTaskDueDate(5, '2026-03-25')).toBe('2026-03-30');
    });

    it('adds 1 day onto the DST transition day itself', () => {
      expect(resolveDefaultTaskDueDate(1, '2026-03-28')).toBe('2026-03-29');
    });

    it('is also correct crossing the autumn clock-back transition (25 October 2026)', () => {
      expect(resolveDefaultTaskDueDate(3, '2026-10-23')).toBe('2026-10-26');
    });
  });
});
