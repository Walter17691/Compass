import { describe, it, expect } from 'vitest';
import {
  addAllegation, updateAllegation, setAllegationStatus, removeAllegation,
  allegationsForCase, linkEvidenceToAllegation, unlinkEvidenceFromAllegation,
  evidenceForAllegation, allegationStatusMeta, isFindingStatus,
  setAppealOutcome, appealOutcomeMeta,
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

  it('defaults the investigator-finding and outstanding-uncertainty fields to empty (P10)', () => {
    const result = addAllegation([], 'case1', { title: 'Late to shift repeatedly' });
    expect(result[0]).toMatchObject({ investigatorFinding: '', outstandingUncertainty: '' });
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

describe('setAppealOutcome (Phase 19)', () => {
  const base = [{ id: 'a1', caseId: 'case1', status: 'substantiated', decidedAt: '2026-08-01T00:00:00.000Z' }];

  it('stamps the appeal outcome/reasoning/decidedAt without touching the original finding', () => {
    const result = setAppealOutcome(base, 'a1', 'upheld', 'New CCTV footage contradicts the original account.', 'user-1');
    expect(result[0]).toMatchObject({
      status: 'substantiated', decidedAt: '2026-08-01T00:00:00.000Z',
      appealOutcome: 'upheld', appealReasoning: 'New CCTV footage contradicts the original account.', appealDecidedBy: 'user-1',
    });
    expect(result[0].appealDecidedAt).toBeTruthy();
  });

  it('ignores an unrecognised appeal outcome', () => {
    const result = setAppealOutcome(base, 'a1', 'bogus', 'x');
    expect(result[0].appealOutcome).toBeUndefined();
  });

  it('defaults reasoning to an empty string and decidedBy to null when omitted', () => {
    const result = setAppealOutcome(base, 'a1', 'not_upheld');
    expect(result[0].appealReasoning).toBe('');
    expect(result[0].appealDecidedBy).toBeNull();
  });
});

describe('appealOutcomeMeta', () => {
  it('returns metadata for a known outcome', () => {
    expect(appealOutcomeMeta('partially_upheld').label).toBe('Partially upheld');
  });

  it('returns null for an unknown or unset outcome', () => {
    expect(appealOutcomeMeta('bogus')).toBeNull();
    expect(appealOutcomeMeta(undefined)).toBeNull();
  });
});

// Phase 6.5 hardening (P0, Cluster 8) — matched by the evidence item's own
// stable id, not array position, so a delete elsewhere on the case's
// evidence can never silently reassign a link to the wrong item.
describe('evidence linking', () => {
  const evidence = [
    { id: 'ev1', name: 'photo.jpg', type: 'image/jpeg' },
    { id: 'ev2', name: 'statement.txt', type: 'text/plain' },
  ];

  it('links an evidence item by id with a stance', () => {
    const result = linkEvidenceToAllegation(evidence, 'ev2', 'alg_1', 'supports');
    expect(result[1]).toMatchObject({ allegationId: 'alg_1', stance: 'supports' });
    expect(result[0]).toEqual(evidence[0]);
  });

  it('defaults stance to neutral when omitted', () => {
    const result = linkEvidenceToAllegation(evidence, 'ev1', 'alg_1');
    expect(result[0].stance).toBe('neutral');
  });

  it('does not touch an item whose id does not match — deleting/reordering unrelated items can never repoint a link', () => {
    const result = linkEvidenceToAllegation(evidence, 'ev2', 'alg_1', 'supports');
    expect(result[0]).toEqual(evidence[0]); // ev1 untouched even though it's still at index 0
    const reordered = [evidence[1], evidence[0]]; // ev2 now at index 0
    const resultAfterReorder = linkEvidenceToAllegation(reordered, 'ev2', 'alg_1', 'supports');
    expect(resultAfterReorder.find(e => e.id === 'ev2').allegationId).toBe('alg_1');
    expect(resultAfterReorder.find(e => e.id === 'ev1').allegationId).toBeUndefined();
  });

  it('unlinks by removing allegationId/stance, not the evidence item', () => {
    const linked = linkEvidenceToAllegation(evidence, 'ev1', 'alg_1', 'contradicts');
    const result = unlinkEvidenceFromAllegation(linked, 'ev1');
    expect(result).toHaveLength(2);
    expect(result[0].allegationId).toBeUndefined();
    expect(result[0].stance).toBeUndefined();
    expect(result[0].name).toBe('photo.jpg');
  });

  it('evidenceForAllegation returns only linked items, each still carrying its own real id', () => {
    const linked = linkEvidenceToAllegation(evidence, 'ev2', 'alg_1', 'supports');
    const result = evidenceForAllegation(linked, 'alg_1');
    expect(result).toEqual([{ id: 'ev2', name: 'statement.txt', type: 'text/plain', allegationId: 'alg_1', stance: 'supports' }]);
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
