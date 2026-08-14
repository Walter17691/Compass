import { describe, it, expect } from 'vitest';
import { sanitizeTriageSummary } from '../lib/concernTriage.js';

describe('sanitizeTriageSummary', () => {
  it('passes through a well-formed AI response', () => {
    const result = sanitizeTriageSummary({
      category: 'Conduct',
      summary: 'Manager reports the employee left their work area without authorisation.',
      witnessesCount: 2,
      evidenceMentioned: ['CCTV', 'WhatsApp conversation'],
      immediateActionTaken: 'Employee sent home',
      considerations: 'Unclear whether this was treated as suspension.',
      urgency: 'MEDIUM',
    });
    expect(result).toEqual({
      aiCategory: 'Conduct',
      aiSummary: 'Manager reports the employee left their work area without authorisation.',
      aiWitnessesCount: 2,
      aiEvidenceMentioned: ['CCTV', 'WhatsApp conversation'],
      aiImmediateAction: 'Employee sent home',
      aiConsiderations: 'Unclear whether this was treated as suspension.',
      aiUrgency: 'MEDIUM',
    });
  });

  it('defaults every field safely for a null or empty response', () => {
    expect(sanitizeTriageSummary(null)).toEqual({
      aiCategory: '', aiSummary: '', aiWitnessesCount: null, aiEvidenceMentioned: [],
      aiImmediateAction: '', aiConsiderations: '', aiUrgency: null,
    });
    expect(sanitizeTriageSummary({})).toEqual({
      aiCategory: '', aiSummary: '', aiWitnessesCount: null, aiEvidenceMentioned: [],
      aiImmediateAction: '', aiConsiderations: '', aiUrgency: null,
    });
  });

  it('rejects an invalid urgency value rather than passing it through', () => {
    expect(sanitizeTriageSummary({ urgency: 'CRITICAL' }).aiUrgency).toBeNull();
    expect(sanitizeTriageSummary({ urgency: 'low' }).aiUrgency).toBeNull(); // case-sensitive, matches the exact enum the prompt asks for
  });

  it('filters out non-string and blank entries from evidenceMentioned rather than crashing', () => {
    expect(sanitizeTriageSummary({ evidenceMentioned: ['CCTV', 42, null, '  ', 'WhatsApp'] }).aiEvidenceMentioned).toEqual(['CCTV', 'WhatsApp']);
  });

  it('treats a non-array evidenceMentioned as empty rather than throwing', () => {
    expect(sanitizeTriageSummary({ evidenceMentioned: 'CCTV' }).aiEvidenceMentioned).toEqual([]);
  });

  it('treats a non-finite witnessesCount as null', () => {
    expect(sanitizeTriageSummary({ witnessesCount: 'two' }).aiWitnessesCount).toBeNull();
    expect(sanitizeTriageSummary({ witnessesCount: NaN }).aiWitnessesCount).toBeNull();
  });

  it('trims whitespace on string fields', () => {
    expect(sanitizeTriageSummary({ category: '  Conduct  ' }).aiCategory).toBe('Conduct');
  });
});
