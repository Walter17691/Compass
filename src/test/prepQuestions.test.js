import { describe, it, expect } from 'vitest';
import {
  addPrepQuestion, updatePrepQuestionText, removePrepQuestion, movePrepQuestion,
  togglePrepQuestionEssential, linkPrepQuestionToAllegation, linkPrepQuestionToEvidence,
  setPrepQuestionStatus, questionStatusMeta, QUESTION_STATUSES,
} from '../lib/prepQuestions';

describe('addPrepQuestion', () => {
  it('appends a new blank, non-essential, user-sourced question', () => {
    const result = addPrepQuestion([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ text: '', category: 'general', essential: false, source: 'user' });
    expect(result[0].id).toBeTruthy();
  });

  it('defaults status to not_asked, statusSource to ai', () => {
    const result = addPrepQuestion([]);
    expect(result[0]).toMatchObject({ status: 'not_asked', statusSource: 'ai' });
  });

  it('gives each added question a unique id', () => {
    const result = addPrepQuestion(addPrepQuestion([]));
    expect(result[0].id).not.toBe(result[1].id);
  });
});

describe('updatePrepQuestionText', () => {
  it('updates only the matching question', () => {
    const qs = [{ id: 'a', text: 'old' }, { id: 'b', text: 'unchanged' }];
    const result = updatePrepQuestionText(qs, 'a', 'new text');
    expect(result.find(q => q.id === 'a').text).toBe('new text');
    expect(result.find(q => q.id === 'b').text).toBe('unchanged');
  });
});

describe('removePrepQuestion', () => {
  it('removes the matching question and leaves others intact', () => {
    const qs = [{ id: 'a' }, { id: 'b' }];
    expect(removePrepQuestion(qs, 'a')).toEqual([{ id: 'b' }]);
  });
});

describe('movePrepQuestion', () => {
  const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('moves a question up', () => {
    const result = movePrepQuestion(qs, 'b', -1);
    expect(result.map(q => q.id)).toEqual(['b', 'a', 'c']);
  });

  it('moves a question down', () => {
    const result = movePrepQuestion(qs, 'b', 1);
    expect(result.map(q => q.id)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op moving the first question up', () => {
    expect(movePrepQuestion(qs, 'a', -1)).toBe(qs);
  });

  it('is a no-op moving the last question down', () => {
    expect(movePrepQuestion(qs, 'c', 1)).toBe(qs);
  });
});

describe('togglePrepQuestionEssential', () => {
  it('flips essential on and back off', () => {
    const qs = [{ id: 'a', essential: false }];
    const toggled = togglePrepQuestionEssential(qs, 'a');
    expect(toggled[0].essential).toBe(true);
    expect(togglePrepQuestionEssential(toggled, 'a')[0].essential).toBe(false);
  });
});

describe('linkPrepQuestionToAllegation', () => {
  it('sets the linked allegation id', () => {
    const qs = [{ id: 'a', linkedAllegationId: null }];
    expect(linkPrepQuestionToAllegation(qs, 'a', 'alleg_1')[0].linkedAllegationId).toBe('alleg_1');
  });

  it('clears the link when given an empty value', () => {
    const qs = [{ id: 'a', linkedAllegationId: 'alleg_1' }];
    expect(linkPrepQuestionToAllegation(qs, 'a', '')[0].linkedAllegationId).toBeNull();
  });
});

// Phase 6.5 hardening (P0, Cluster 8) — linked by the evidence item's own
// stable id, not array position (was linkedEvidenceIndex) — a delete
// elsewhere on the case's evidence could otherwise silently repoint an
// already-linked prep question at a different item.
describe('linkPrepQuestionToEvidence', () => {
  it('sets the linked evidence id', () => {
    const qs = [{ id: 'a', linkedEvidenceId: null }];
    expect(linkPrepQuestionToEvidence(qs, 'a', 'ev2')[0].linkedEvidenceId).toBe('ev2');
  });

  it('treats an empty string as clearing the link', () => {
    const qs = [{ id: 'a', linkedEvidenceId: 'ev2' }];
    expect(linkPrepQuestionToEvidence(qs, 'a', '')[0].linkedEvidenceId).toBeNull();
  });

  it('treats null/undefined as clearing the link too', () => {
    const qs = [{ id: 'a', linkedEvidenceId: 'ev2' }];
    expect(linkPrepQuestionToEvidence(qs, 'a', null)[0].linkedEvidenceId).toBeNull();
    expect(linkPrepQuestionToEvidence(qs, 'a', undefined)[0].linkedEvidenceId).toBeNull();
  });
});

describe('setPrepQuestionStatus', () => {
  it('sets status and statusSource together', () => {
    const qs = [{ id: 'a', status: 'not_asked', statusSource: 'ai' }];
    const result = setPrepQuestionStatus(qs, 'a', 'answered', 'user');
    expect(result[0]).toMatchObject({ status: 'answered', statusSource: 'user' });
  });

  it('rejects an unknown status, leaving the list unchanged', () => {
    const qs = [{ id: 'a', status: 'not_asked', statusSource: 'ai' }];
    expect(setPrepQuestionStatus(qs, 'a', 'bogus', 'user')).toBe(qs);
  });

  it('only updates the matching question', () => {
    const qs = [{ id: 'a', status: 'not_asked' }, { id: 'b', status: 'not_asked' }];
    const result = setPrepQuestionStatus(qs, 'a', 'asked', 'ai');
    expect(result.find(q => q.id === 'a').status).toBe('asked');
    expect(result.find(q => q.id === 'b').status).toBe('not_asked');
  });
});

describe('questionStatusMeta', () => {
  it('returns the matching status entry', () => {
    expect(questionStatusMeta('answered')).toMatchObject({ id: 'answered', label: 'Answered' });
  });

  it('falls back to the first status (not_asked) for an unknown value', () => {
    expect(questionStatusMeta('bogus')).toBe(QUESTION_STATUSES[0]);
  });

  it('falls back to the first status for undefined', () => {
    expect(questionStatusMeta(undefined)).toBe(QUESTION_STATUSES[0]);
  });
});
