import { describe, it, expect } from 'vitest';
import { deriveDocumentsForCase } from '../lib/caseDocuments';

describe('deriveDocumentsForCase', () => {
  it('includes a letter for each meeting that has one, skipping meetings without', () => {
    const cs = {
      meetings: [
        { id: 'm1', type: 'Investigation', date: '2026-08-01', letterOutput: 'Dear...' },
        { id: 'm2', type: 'Disciplinary', date: '2026-08-02' },
      ],
      evidence: [],
    };
    const result = deriveDocumentsForCase(cs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'letter', label: 'Investigation letter', meetingId: 'm1' });
  });

  it('includes the investigation report when present', () => {
    const cs = { meetings: [], evidence: [], investigationReport: 'Findings...', investigationReportDate: '2026-08-03' };
    const result = deriveDocumentsForCase(cs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'report', label: 'Investigation report' });
  });

  it('includes evidence documents but excludes witness statements', () => {
    const cs = {
      meetings: [], evidence: [
        { name: 'CCTV log', type: 'video/mp4', date: '2026-08-01' },
        { name: 'Witness: Robin Hood (05/08/2026)', type: 'Witness statement', date: '2026-08-05' },
      ],
    };
    const result = deriveDocumentsForCase(cs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'evidence', label: 'CCTV log' });
  });

  it('sorts newest first across all three sources', () => {
    const cs = {
      meetings: [{ id: 'm1', type: 'Investigation', date: '2026-08-01', letterOutput: 'x' }],
      evidence: [{ name: 'doc', type: 'application/pdf', date: '2026-08-10' }],
      investigationReport: 'r', investigationReportDate: '2026-08-05',
    };
    const result = deriveDocumentsForCase(cs);
    expect(result.map(d => d.kind)).toEqual(['evidence', 'report', 'letter']);
  });
});
