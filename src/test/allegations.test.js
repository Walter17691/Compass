import { describe, it, expect } from 'vitest';
import {
  addAllegation, updateAllegation, setAllegationStatus, removeAllegation,
  allegationsForCase, linkEvidenceToAllegation, unlinkEvidenceFromAllegation,
  evidenceForAllegation, allegationStatusMeta, isFindingStatus,
} from '../lib/allegations';

describe('addAllegation', () => {
  it('adds an allegation scoped to the given case', () => {
    const result = addAllegation([], 'case1', { title: 'Late to shift repeatedly' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ caseId: 'case1', title: 'Late to shift repeatedly', status: 'unreviewed' });
    expect(result[0].id).toBeTruthy();
  });

  it('ignores an allegation with a blank title', () => {
    expect(addAllegation([], 'case1', { title: '   ' })).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const original = [];
    addAllegation(original, 'case1', { title: 'x' });
    expect(original).toEqual([]);
  });
});

describe('allegationsForCase', () => {
  it('filters to only the given case', () => {
    const all = [{ id: 'a1', caseId: 'case1' }, { id: 'a2', caseId: 'case2' }];
    expect(allegationsForCase(all, 'case1')).toEqual([{ id: 'a1', caseId: 'case1' }]);
  });
});

describe('updateAllegation / setAllegationStatus', () => {
  const base = [{ id: 'a1', caseId: 'case1', status: 'unreviewed', employeeResponse: '' }];

  it('merges fields onto the matching allegation only', () => {
    const result = updateAllegation(base, 'a1', { employeeResponse: 'Denies it' });
    expect(result[0].employeeResponse).toBe('Denies it');
  });

  it('sets status via the dedicated helper', () => {
    const result = setAllegationStatus(base, 'a1', 'substantiated');
    expect(result[0].status).toBe('substantiated');
  });

  it('leaves other allegations untouched', () => {
    const two = [...base, { id: 'a2', caseId: 'case1', status: 'unreviewed' }];
    const result = setAllegationStatus(two, 'a1', 'substantiated');
    expect(result[1].status).toBe('unreviewed');
  });
});

describe('isFindingStatus', () => {
  it('treats the four decision statuses as findings', () => {
    expect(isFindingStatus('substantiated')).toBe(true);
    expect(isFindingStatus('partially_substantiated')).toBe(true);
    expect(isFindingStatus('not_substantiated')).toBe(true);
    expect(isFindingStatus('unable_to_determine')).toBe(true);
  });

  it('does not treat the procedural statuses as findings', () => {
    expect(isFindingStatus('unreviewed')).toBe(false);
    expect(isFindingStatus('evidence_gathering')).toBe(false);
  });
});

describe('setAllegationStatus — decision stamping (Phase 16)', () => {
  const base = [{ id: 'a1', caseId: 'case1', status: 'unreviewed' }];

  it('stamps decidedBy/decidedAt when moving into a finding status', () => {
    const result = setAllegationStatus(base, 'a1', 'substantiated', 'user-123');
    expect(result[0].status).toBe('substantiated');
    expect(result[0].decidedBy).toBe('user-123');
    expect(result[0].decidedAt).toBeTruthy();
  });

  it('does not stamp decidedBy/decidedAt for a non-finding status', () => {
    const result = setAllegationStatus(base, 'a1', 'evidence_gathering', 'user-123');
    expect(result[0].decidedBy).toBeNull();
    expect(result[0].decidedAt).toBeNull();
  });

  it('clears decidedBy/decidedAt if a finding is moved back to a procedural status', () => {
    const decided = setAllegationStatus(base, 'a1', 'substantiated', 'user-123');
    const reopened = setAllegationStatus(decided, 'a1', 'evidence_gathering');
    expect(reopened[0].decidedBy).toBeNull();
    expect(reopened[0].decidedAt).toBeNull();
  });

  it('defaults decidedBy to null when not supplied', () => {
    const result = setAllegationStatus(base, 'a1', 'not_substantiated');
    expect(result[0].decidedBy).toBeNull();
    expect(result[0].decidedAt).toBeTruthy();
  });
});

describe('removeAllegation', () => {
  it('removes only the matching allegation', () => {
    const all = [{ id: 'a1' }, { id: 'a2' }];
    expect(removeAllegation(all, 'a1')).toEqual([{ id: 'a2' }]);
  });
});

describe('evidence linking', () => {
  const evidence = [
    { name: 'photo.jpg', type: 'image/jpeg' },
    { name: 'statement.txt', type: 'text/plain' },
  ];

  it('links an evidence item by index with a stance', () => {
    const result = linkEvidenceToAllegation(evidence, 1, 'alg_1', 'supports');
    expect(result[1]).toMatchObject({ allegationId: 'alg_1', stance: 'supports' });
    expect(result[0]).toEqual(evidence[0]);
  });

  it('defaults stance to neutral when omitted', () => {
    const result = linkEvidenceToAllegation(evidence, 0, 'alg_1');
    expect(result[0].stance).toBe('neutral');
  });

  it('unlinks by removing allegationId/stance, not the evidence item', () => {
    const linked = linkEvidenceToAllegation(evidence, 0, 'alg_1', 'contradicts');
    const result = unlinkEvidenceFromAllegation(linked, 0);
    expect(result).toHaveLength(2);
    expect(result[0].allegationId).toBeUndefined();
    expect(result[0].stance).toBeUndefined();
    expect(result[0].name).toBe('photo.jpg');
  });

  it('evidenceForAllegation returns only linked items, tagged with their original index', () => {
    const linked = linkEvidenceToAllegation(evidence, 1, 'alg_1', 'supports');
    const result = evidenceForAllegation(linked, 'alg_1');
    expect(result).toEqual([{ name: 'statement.txt', type: 'text/plain', allegationId: 'alg_1', stance: 'supports', index: 1 }]);
  });
});

describe('allegationStatusMeta', () => {
  it('returns metadata for a known status', () => {
    expect(allegationStatusMeta('substantiated').label).toBe('Substantiated');
  });

  it('falls back to the first status for an unknown value', () => {
    expect(allegationStatusMeta('bogus').id).toBe('unreviewed');
  });
});
