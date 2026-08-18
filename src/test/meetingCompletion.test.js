import { describe, it, expect } from 'vitest';
import { snapshotUnresolvedSuggestions, taskFieldsForSuggestion } from '../lib/meetingCompletion.js';

describe('snapshotUnresolvedSuggestions (Phase 5, IP18)', () => {
  it('keeps only pending evidence/witness suggestions, dropping accepted/dismissed ones', () => {
    const meetingEvidenceSuggestions = [
      { kind: 'witness', description: 'Sarah Jones', status: 'pending' },
      { kind: 'evidence', description: 'CCTV footage', status: 'accepted' },
      { kind: 'evidence', description: 'WhatsApp message', status: 'dismissed' },
    ];
    const result = snapshotUnresolvedSuggestions(meetingEvidenceSuggestions, []);
    expect(result).toEqual([{ kind: 'witness', description: 'Sarah Jones' }]);
  });

  it('keeps only pending action suggestions, carrying owner/dueDate through', () => {
    const meetingActionSuggestions = [
      { description: 'Send the screenshots', status: 'pending', suggestedOwner: 'Jo', suggestedDueDate: '20/08/2026' },
      { description: 'Check the CCTV', status: 'accepted' },
    ];
    const result = snapshotUnresolvedSuggestions([], meetingActionSuggestions);
    expect(result).toEqual([{ kind: 'action', description: 'Send the screenshots', suggestedOwner: 'Jo', suggestedDueDate: '20/08/2026' }]);
  });

  it('defaults a pending action with no owner/due date to empty strings, not undefined', () => {
    const result = snapshotUnresolvedSuggestions([], [{ description: 'Follow up', status: 'pending' }]);
    expect(result[0]).toEqual({ kind: 'action', description: 'Follow up', suggestedOwner: '', suggestedDueDate: '' });
  });

  it('returns an empty array when nothing is pending or nothing was ever raised', () => {
    expect(snapshotUnresolvedSuggestions([], [])).toEqual([]);
    expect(snapshotUnresolvedSuggestions(undefined, undefined)).toEqual([]);
  });

  it('combines evidence/witness and action suggestions together', () => {
    const result = snapshotUnresolvedSuggestions(
      [{ kind: 'witness', description: 'James Smith', status: 'pending' }],
      [{ description: 'Chase the file', status: 'pending' }],
    );
    expect(result).toHaveLength(2);
    expect(result.map(s => s.kind)).toEqual(['witness', 'action']);
  });
});

describe('taskFieldsForSuggestion (Phase 5, IP18)', () => {
  it('builds an interview task for a witness suggestion', () => {
    expect(taskFieldsForSuggestion({ kind: 'witness', description: 'Sarah Jones' })).toEqual({ name: 'Interview Sarah Jones as a potential witness' });
  });

  it('builds a request task for an evidence suggestion', () => {
    expect(taskFieldsForSuggestion({ kind: 'evidence', description: 'CCTV footage' })).toEqual({ name: 'Request CCTV footage' });
  });

  it('builds a task carrying owner/dueDate for an action suggestion', () => {
    expect(taskFieldsForSuggestion({ kind: 'action', description: 'Send the screenshots', suggestedOwner: 'Jo', suggestedDueDate: '20/08/2026' }))
      .toEqual({ name: 'Send the screenshots', owner: 'Jo', dueDate: '20/08/2026' });
  });

  it('defaults owner/dueDate to empty strings for an action suggestion missing them', () => {
    expect(taskFieldsForSuggestion({ kind: 'action', description: 'Follow up' })).toEqual({ name: 'Follow up', owner: '', dueDate: '' });
  });
});
