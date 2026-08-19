import { describe, it, expect } from 'vitest';
import { buildCommunicationsView } from '../lib/communications.js';

describe('buildCommunicationsView (Phase 5, IP31)', () => {
  it('includes email, letter, and meeting entries', () => {
    const cs = {
      id: 'c1',
      meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-01', record: 'notes' }],
      evidence: [
        { source: 'email', name: 'note.txt', date: '2026-08-02', addedBy: 'Jo' },
        { source: 'sent_letter', name: 'Sent: Outcome Letter', date: '2026-08-03', addedBy: 'Jo' },
      ],
    };
    const result = buildCommunicationsView(cs, [], []);
    expect(result.map(r => r.type).sort()).toEqual(['email', 'letter', 'meeting']);
  });

  it('excludes non-communication entry types (case opened, allegations, outcome, audit)', () => {
    const cs = { id: 'c1', dateReceived: '2026-08-01', outcome: 'Final written warning', outcomeDate: '2026-08-10', meetings: [], evidence: [] };
    const allegations = [{ id: 'a1', caseId: 'c1', title: 'Late arrivals', createdAt: '2026-08-02' }];
    const auditLog = [{ caseId: 'c1', ts: '2026-08-03T00:00:00Z', action: 'Case reassigned', user: 'Jo' }];
    const result = buildCommunicationsView(cs, allegations, auditLog);
    expect(result).toEqual([]);
  });

  it('leaves signatureStatus null for a meeting never sent for signature', () => {
    const cs = { id: 'c1', meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-01', record: 'notes' }], evidence: [] };
    const result = buildCommunicationsView(cs, [], []);
    expect(result[0].signatureStatus).toBeNull();
    expect(result[0].signatureStatusLabel).toBeNull();
  });

  it('resolves signature status for a meeting with a signId', () => {
    const cs = { id: 'c1', meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-01', record: 'notes', signId: 'sign-1', signStatus: 'signed' }], evidence: [] };
    const result = buildCommunicationsView(cs, [], []);
    expect(result[0].signatureStatus).toBe('signed');
    expect(result[0].signatureStatusLabel).toBe('Signed');
  });

  it('resolves acknowledgement status for a sent-letter evidence item with a signId', () => {
    const cs = { id: 'c1', meetings: [], evidence: [{ source: 'sent_letter', name: 'Sent: Outcome Letter', date: '2026-08-03', addedBy: 'Jo', signId: 'sign-2', signStatus: 'acknowledged' }] };
    const result = buildCommunicationsView(cs, [], []);
    expect(result[0].signatureStatus).toBe('acknowledged');
    expect(result[0].signatureStatusLabel).toBe('Acknowledged');
  });

  it('leaves signatureStatus null for a sent letter with no signId (plain email send)', () => {
    const cs = { id: 'c1', meetings: [], evidence: [{ source: 'sent_letter', name: 'Sent: Witness invitation', date: '2026-08-03', addedBy: 'Jo' }] };
    const result = buildCommunicationsView(cs, [], []);
    expect(result[0].signatureStatus).toBeNull();
  });

  it('returns entries in chronological order, same as the underlying timeline', () => {
    const cs = {
      id: 'c1',
      meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-05', record: 'notes' }],
      evidence: [{ source: 'email', name: 'early.txt', date: '2026-08-01', addedBy: 'Jo' }],
    };
    const result = buildCommunicationsView(cs, [], []);
    expect(result.map(r => r.type)).toEqual(['email', 'meeting']);
  });
});
