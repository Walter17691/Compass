import { describe, it, expect } from 'vitest';
import { ensureEvidenceIds } from '../lib/evidenceUpload.js';

// Phase 6.5 hardening (P0, Cluster 8) — every evidence item needs a
// stable id so documentFindings/allegation-linking/prep-question-linking
// can reference a specific item safely across a later delete elsewhere in
// the same case's evidence array (see allegations.js/App.jsx's own fix).
describe('ensureEvidenceIds', () => {
  it('backfills an id onto any evidence item that lacks one', () => {
    const cs = { id: 'c1', evidence: [{ name: 'legacy.txt' }] };
    const result = ensureEvidenceIds(cs);
    expect(result.evidence[0].id).toBeTruthy();
    expect(typeof result.evidence[0].id).toBe('string');
  });

  it('leaves an existing id untouched', () => {
    const cs = { id: 'c1', evidence: [{ id: 'ev1', name: 'note.txt' }] };
    const result = ensureEvidenceIds(cs);
    expect(result.evidence[0].id).toBe('ev1');
  });

  it('assigns distinct ids to multiple items missing one', () => {
    const cs = { id: 'c1', evidence: [{ name: 'a.txt' }, { name: 'b.txt' }] };
    const result = ensureEvidenceIds(cs);
    expect(result.evidence[0].id).toBeTruthy();
    expect(result.evidence[1].id).toBeTruthy();
    expect(result.evidence[0].id).not.toBe(result.evidence[1].id);
  });

  it('only backfills the items that actually need it, leaving others as-is', () => {
    const cs = { id: 'c1', evidence: [{ id: 'ev1', name: 'a.txt' }, { name: 'b.txt' }] };
    const result = ensureEvidenceIds(cs);
    expect(result.evidence[0].id).toBe('ev1');
    expect(result.evidence[1].id).toBeTruthy();
  });

  it('returns the exact same case reference when every item already has an id — saveCases relies on this to skip unchanged cases', () => {
    const cs = { id: 'c1', evidence: [{ id: 'ev1', name: 'a.txt' }] };
    expect(ensureEvidenceIds(cs)).toBe(cs);
  });

  it('returns the exact same case reference when there is no evidence at all', () => {
    const cs = { id: 'c1', evidence: [] };
    expect(ensureEvidenceIds(cs)).toBe(cs);
    const csNoField = { id: 'c1' };
    expect(ensureEvidenceIds(csNoField)).toBe(csNoField);
  });

  it('preserves every other field on both the case and the evidence item while backfilling', () => {
    const cs = { id: 'c1', employeeName: 'Sam', evidence: [{ name: 'a.txt', type: 'text/plain', dataUrl: 'data:...' }] };
    const result = ensureEvidenceIds(cs);
    expect(result.employeeName).toBe('Sam');
    expect(result.evidence[0]).toMatchObject({ name: 'a.txt', type: 'text/plain', dataUrl: 'data:...' });
  });
});
