import { describe, it, expect, vi } from 'vitest';
import { ensureEvidenceIds, fmtBytes, readEvidenceFiles, MAX_EVIDENCE_SIZE } from '../lib/evidenceUpload.js';

// Phase 6.5 hardening (Batch 8) — fmtBytes/readEvidenceFiles had no
// coverage at all before this; only ensureEvidenceIds (added for the P0
// evidence-by-stable-id fix) was tested.
describe('fmtBytes', () => {
  it('formats sub-megabyte sizes in KB, rounded', () => {
    expect(fmtBytes(2048)).toBe('2KB');
    expect(fmtBytes(1500)).toBe('1KB');
  });

  it('formats megabyte-and-above sizes in MB to one decimal place', () => {
    expect(fmtBytes(1024 * 1024)).toBe('1.0MB');
    expect(fmtBytes(2.5 * 1024 * 1024)).toBe('2.5MB');
  });
});

describe('readEvidenceFiles', () => {
  const makeFile = (name, type, sizeOverride) => {
    const file = new File(['x'.repeat(10)], name, { type });
    if (sizeOverride != null) Object.defineProperty(file, 'size', { value: sizeOverride });
    return file;
  };

  it('reads a valid file into an evidence object with a stable id and dataUrl', async () => {
    const [result] = await readEvidenceFiles([makeFile('note.txt', 'text/plain')], { addedBy: 'Jo Smith' });
    expect(result.id).toBeTruthy();
    expect(result.name).toBe('note.txt');
    expect(result.type).toBe('text/plain');
    expect(result.addedBy).toBe('Jo Smith');
    expect(result.dataUrl).toMatch(/^data:/);
  });

  it('rejects a file over the size limit via onReject, without including it in the results', async () => {
    const onReject = vi.fn();
    const results = await readEvidenceFiles([makeFile('huge.pdf', 'application/pdf', MAX_EVIDENCE_SIZE + 1)], { onReject });
    expect(results).toHaveLength(0);
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('huge.pdf'));
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('too large'));
  });

  it('rejects an unsupported file type via onReject, without including it in the results', async () => {
    const onReject = vi.fn();
    const results = await readEvidenceFiles([makeFile('script.exe', 'application/x-msdownload')], { onReject });
    expect(results).toHaveLength(0);
    expect(onReject).toHaveBeenCalledWith(expect.stringContaining('not supported'));
  });

  it('processes the rest of a multi-file batch even when one file is rejected', async () => {
    const onReject = vi.fn();
    const results = await readEvidenceFiles([
      makeFile('good.txt', 'text/plain'),
      makeFile('bad.exe', 'application/x-msdownload'),
      makeFile('also-good.csv', 'text/csv'),
    ], { onReject });
    expect(results.map(r => r.name)).toEqual(['good.txt', 'also-good.csv']);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('defaults addedBy to "HR Manager" when not given', async () => {
    const [result] = await readEvidenceFiles([makeFile('note.txt', 'text/plain')]);
    expect(result.addedBy).toBe('HR Manager');
  });

  it('assigns distinct ids across files in the same batch', async () => {
    const results = await readEvidenceFiles([makeFile('a.txt', 'text/plain'), makeFile('b.txt', 'text/plain')]);
    expect(results[0].id).not.toBe(results[1].id);
  });
});

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
