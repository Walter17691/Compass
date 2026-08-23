import { describe, it, expect } from 'vitest';
import { resolveSignalRef } from '../lib/resolveSignalRef.js';

describe('resolveSignalRef', () => {
  it('resolves a meeting ref by id', () => {
    const meetings = [{ id: 'm1', type: 'Investigation', date: '01/08/2026' }];
    expect(resolveSignalRef({ kind: 'meeting', id: 'm1' }, { meetings })).toEqual({ label: 'Investigation', detail: null, date: '01/08/2026' });
  });

  it('resolves an allegation ref by id', () => {
    const allegations = [{ id: 'a1', title: 'Gross misconduct', createdAt: '2026-08-01' }];
    expect(resolveSignalRef({ kind: 'allegation', id: 'a1' }, { allegations })).toEqual({ label: 'Gross misconduct', detail: null, date: '2026-08-01' });
  });

  // Phase 6.5 hardening (P1, reliability review) — regression test for a
  // real, live bug: this used to resolve evidence refs by array index
  // ((cs.evidence||[])[ref.id]), which was already broken for
  // App.jsx's acceptDocumentFinding — the one caller that has stored a
  // real evidence UUID (not an index) as this ref's id since
  // evidenceUpload.js's ensureEvidenceIds (Cluster 8). Every "Ask why" on
  // an AI-detected inconsistency finding silently resolved to nothing.
  it('resolves an evidence ref by its real id, not by array position', () => {
    const evidence = [
      { id: 'ev-a', name: 'Witness statement', type: 'Document', date: '01/08/2026' },
      { id: 'ev-b', name: 'CCTV clip', type: 'Video', date: '05/08/2026' },
    ];
    expect(resolveSignalRef({ kind: 'evidence', id: 'ev-b' }, { evidence })).toEqual({ label: 'CCTV clip', detail: 'Video', date: '05/08/2026' });
  });

  it('still resolves correctly after the item at index 0 is removed (proves this is id-based, not index-based)', () => {
    // If this were still index-based, looking up id 'ev-b' after 'ev-a'
    // is removed would land on whatever now sits at index 0 — silently
    // resolving to the wrong evidence item.
    const evidence = [{ id: 'ev-b', name: 'CCTV clip', type: 'Video', date: '05/08/2026' }];
    expect(resolveSignalRef({ kind: 'evidence', id: 'ev-b' }, { evidence })?.label).toBe('CCTV clip');
  });

  it('returns null for a ref pointing at nothing', () => {
    expect(resolveSignalRef({ kind: 'meeting', id: 'missing' }, { meetings: [] })).toBeNull();
    expect(resolveSignalRef({ kind: 'allegation', id: 'missing' }, { allegations: [] })).toBeNull();
    expect(resolveSignalRef({ kind: 'evidence', id: 'missing' }, { evidence: [] })).toBeNull();
  });

  it('passes through a self-contained ref (own detail/date, no id lookup)', () => {
    const ref = { kind: 'context', label: 'Anonymised comparable cases', detail: '3 closed misconduct cases' };
    expect(resolveSignalRef(ref, {})).toBe(ref);
  });

  it('returns null for an unrecognised, non-self-contained ref', () => {
    expect(resolveSignalRef({ kind: 'unknown' }, {})).toBeNull();
  });
});
