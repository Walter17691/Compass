import { describe, it, expect } from 'vitest';
import { buildSentLetterEvidenceItem, findTaskToCompleteForSentLetter } from '../lib/letterSend.js';

describe('buildSentLetterEvidenceItem (Phase 5, IP13)', () => {
  it('builds an analysable text/plain evidence item tagged as a sent letter', () => {
    const item = buildSentLetterEvidenceItem({ type: 'witness-invitation', recipient: 'sarah@company.com', body: 'Dear Sarah...', addedBy: 'Jo' });
    expect(item).toMatchObject({ name: 'Sent: Witness invitation', type: 'text/plain', addedBy: 'Jo', source: 'sent_letter' });
    expect(item.record).toContain('Sent to: sarah@company.com');
    expect(item.record).toContain('Dear Sarah...');
    expect(item.dataUrl).toMatch(/^data:text\/plain;base64,/);
    expect(item.size).toBe(new Blob([item.record]).size);
  });

  it('falls back to a generic label for an unknown type', () => {
    const item = buildSentLetterEvidenceItem({ type: 'outcome', recipient: 'x@y.com', body: 'text' });
    expect(item.name).toBe('Sent: Letter');
  });

  it('defaults addedBy to "HR Manager" when omitted', () => {
    const item = buildSentLetterEvidenceItem({ type: 'evidence-request', recipient: 'x@y.com', body: 'text' });
    expect(item.addedBy).toBe('HR Manager');
  });
});

describe('findTaskToCompleteForSentLetter (Phase 5, IP13)', () => {
  const caseTasks = [
    { id: 't1', caseId: 'c1', name: 'Evidence request', status: 'open' },
    { id: 't2', caseId: 'c1', name: 'evidence request', status: 'done' },
    { id: 't3', caseId: 'c2', name: 'Evidence request', status: 'open' },
    { id: 't4', caseId: 'c1', name: 'Chase something unrelated', status: 'open' },
  ];

  it('finds an open task matching the correspondence type label, case-insensitively', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c1', 'evidence-request')).toMatchObject({ id: 't1' });
  });

  it('ignores a matching task that is already done', () => {
    const tasks = caseTasks.filter(t => t.id !== 't1');
    expect(findTaskToCompleteForSentLetter(tasks, 'c1', 'evidence-request')).toBeNull();
  });

  it('ignores a matching task belonging to a different case', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c3', 'evidence-request')).toBeNull();
  });

  it('returns null when the letter type has no known label', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c1', 'outcome')).toBeNull();
  });

  it('returns null when nothing matches by name', () => {
    expect(findTaskToCompleteForSentLetter(caseTasks, 'c1', 'oh-consent-request')).toBeNull();
  });
});
