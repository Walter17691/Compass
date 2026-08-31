import { describe, it, expect } from 'vitest';
import {
  SIGNAL_TYPES, SIGNAL_STATUSES, signalTypeMeta, signalsForCase, openSignalsForCase,
  createSignal, updateSignal, setSignalStatus, supersedeOpenSignalsOfType, topOpenSignalsOrgWide,
  findMatchingSignalByText, findMatchingSignalBySubject, findMatchingQuestionSignal,
} from '../lib/caseSignals';

// Human UAT remediation, Batch 1, Issue 6 — a human's Resolved/Not
// relevant decision on an "unanswered question" signal used to have no
// stable way to be recognised against a freshly AI-regenerated question,
// since a fresh pass only ever checked currently-OPEN signals. This is
// the identity findMatchingSignalByText gives generateUnansweredQuestions
// (App.jsx) to respect that decision instead.
describe('findMatchingSignalByText', () => {
  const signals = [
    { id: 's1', caseId: 'case1', type: 'unanswered_question', title: 'Was Sarah Jones interviewed?', status: 'not_relevant', resolvedBy: 'u1' },
    { id: 's2', caseId: 'case1', type: 'unanswered_question', title: 'What time did the incident occur?', status: 'open' },
    { id: 's3', caseId: 'case2', type: 'unanswered_question', title: 'Was Sarah Jones interviewed?', status: 'open' },
  ];

  it('matches on normalised text — case, punctuation, and whitespace differences do not defeat it', () => {
    const match = findMatchingSignalByText(signals, 'case1', 'unanswered_question', '  was sarah jones interviewed  ');
    expect(match?.id).toBe('s1');
  });

  it('does not match across a different case', () => {
    const match = findMatchingSignalByText(signals.filter(s=>s.id!=='s1'), 'case1', 'unanswered_question', 'Was Sarah Jones interviewed?');
    expect(match).toBeNull();
  });

  it('does not match a genuinely different question', () => {
    const match = findMatchingSignalByText(signals, 'case1', 'unanswered_question', 'Was a companion offered at the hearing?');
    expect(match).toBeNull();
  });

  it('returns null for empty/missing text', () => {
    expect(findMatchingSignalByText(signals, 'case1', 'unanswered_question', '')).toBeNull();
    expect(findMatchingSignalByText(signals, 'case1', 'unanswered_question', undefined)).toBeNull();
  });
});

// Human UAT remediation, Batch 1, Issue 6 (hardening round 2) — the
// scenario normalised-text matching alone cannot catch: two genuinely
// different sentences asking the same underlying thing. `subject` is the
// AI's own stable, factual identity for what a question concerns (e.g.
// "John — not yet interviewed"), stored as a source_ref, checked BEFORE
// falling back to text.
describe('findMatchingSignalBySubject / findMatchingQuestionSignal', () => {
  const signals = [
    {
      id: 's1', caseId: 'case1', type: 'unanswered_question',
      title: 'Have you interviewed John about the incident?', status: 'not_relevant', resolvedBy: 'u1',
      sourceRefs: [{ kind: 'subject', id: 'John — not yet interviewed', label: 'John — not yet interviewed' }],
    },
    {
      id: 's2', caseId: 'case1', type: 'unanswered_question',
      title: 'Was a companion offered at the hearing?', status: 'open', sourceRefs: [],
    },
    // Pre-hardening signal — no subject ref at all, same as everything
    // created before this identity existed.
    {
      id: 's3', caseId: 'case1', type: 'unanswered_question',
      title: 'What time did the incident occur?', status: 'resolved', resolvedBy: 'u1',
    },
  ];

  it('matches a differently-worded regeneration of the same question via subject, where text matching alone would miss it', () => {
    const byText = findMatchingSignalByText(signals, 'case1', 'unanswered_question', 'Has John been spoken to as part of the investigation?');
    expect(byText).toBeNull(); // proves text alone genuinely cannot catch this case

    const bySubject = findMatchingSignalBySubject(signals, 'case1', 'unanswered_question', 'John — not yet interviewed');
    expect(bySubject?.id).toBe('s1');

    const combined = findMatchingQuestionSignal(signals, 'case1', 'unanswered_question', {
      subject: 'John — not yet interviewed',
      questionText: 'Has John been spoken to as part of the investigation?',
    });
    expect(combined?.id).toBe('s1');
  });

  it('subject matching is not defeated by case/whitespace differences', () => {
    const match = findMatchingSignalBySubject(signals, 'case1', 'unanswered_question', '  JOHN — Not Yet Interviewed  ');
    expect(match?.id).toBe('s1');
  });

  it('falls back to text matching for a signal that predates the subject identity (no subject ref on file)', () => {
    const match = findMatchingQuestionSignal(signals, 'case1', 'unanswered_question', {
      subject: undefined,
      questionText: 'What time did the incident occur?',
    });
    expect(match?.id).toBe('s3');
  });

  it('does not match a genuinely different subject about the same case — a new issue must still be able to appear', () => {
    const match = findMatchingQuestionSignal(signals, 'case1', 'unanswered_question', {
      subject: 'Payroll record — discrepancy unexplained',
      questionText: 'Why does the payroll record not match the timesheet?',
    });
    expect(match).toBeNull();
  });

  it('never matches across a different case even with the identical subject', () => {
    const match = findMatchingSignalBySubject(signals, 'case2', 'unanswered_question', 'John — not yet interviewed');
    expect(match).toBeNull();
  });
});

describe('signalTypeMeta', () => {
  it('returns the matching type meta', () => {
    expect(signalTypeMeta('process_risk').label).toBe('Procedural guardrail');
  });
  it('falls back to the first type for an unknown id', () => {
    expect(signalTypeMeta('nonsense')).toBe(SIGNAL_TYPES[0]);
  });
});

describe('signalsForCase / openSignalsForCase', () => {
  const signals = [
    { id: 's1', caseId: 'case1', type: 'next_action', status: 'open' },
    { id: 's2', caseId: 'case1', type: 'inconsistency', status: 'dismissed' },
    { id: 's3', caseId: 'case2', type: 'next_action', status: 'open' },
  ];

  it('filters to one case', () => {
    expect(signalsForCase(signals, 'case1')).toHaveLength(2);
  });

  it('filters to open signals for a case', () => {
    expect(openSignalsForCase(signals, 'case1')).toEqual([signals[0]]);
  });

  it('further filters open signals by type', () => {
    expect(openSignalsForCase(signals, 'case1', 'inconsistency')).toEqual([]);
    expect(openSignalsForCase(signals, 'case1', 'next_action')).toEqual([signals[0]]);
  });
});

describe('createSignal', () => {
  it('creates a signal with defaults', () => {
    const result = createSignal([], 'case1', { type: 'next_action', title: 'Interview Sarah Jones', reasoning: 'Ryan named her as a witness.' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      caseId: 'case1', type: 'next_action', title: 'Interview Sarah Jones',
      reasoning: 'Ryan named her as a witness.', status: 'open', sourceRefs: [], source: 'ai',
    });
    expect(result[0].id).toMatch(/^sig_/);
  });

  it('is a no-op with a blank title', () => {
    const signals = [];
    expect(createSignal(signals, 'case1', { type: 'next_action', title: '  ' })).toBe(signals);
  });

  it('is a no-op with no type', () => {
    const signals = [];
    expect(createSignal(signals, 'case1', { title: 'Missing type' })).toBe(signals);
  });

  it('preserves sourceRefs and a user source', () => {
    const refs = [{ kind: 'meeting', id: 'm1', label: 'Investigation meeting' }];
    const result = createSignal([], 'case1', { type: 'inconsistency', title: 'Conflicting times', sourceRefs: refs, source: 'user', createdBy: 'user_1' });
    expect(result[0].sourceRefs).toEqual(refs);
    expect(result[0].source).toBe('user');
    expect(result[0].createdBy).toBe('user_1');
  });

  // Phase 6.5 hardening (Prompt 14, guardrail lifecycle redesign) —
  // ruleId is the real identity for a guardrail-generated signal
  // (case_signals_open_rule_unique enforces it at the DB), distinct from
  // title's presentation text.
  it('stores ruleId when provided, and defaults it to null otherwise', () => {
    const withRule = createSignal([], 'case1', { type: 'process_risk', title: 'A finding was recorded with little or no reasoning', ruleId: 'decision_reasoning_missing' });
    expect(withRule[0].ruleId).toBe('decision_reasoning_missing');
    const withoutRule = createSignal([], 'case1', { type: 'next_action', title: 'Interview Sarah Jones' });
    expect(withoutRule[0].ruleId).toBeNull();
  });
});

describe('updateSignal', () => {
  it('merges fields into the matching signal only', () => {
    const signals = [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }];
    const result = updateSignal(signals, 's1', { title: 'A updated' });
    expect(result[0].title).toBe('A updated');
    expect(result[1].title).toBe('B');
  });
});

describe('setSignalStatus', () => {
  const base = [{ id: 's1', caseId: 'case1', type: 'next_action', status: 'open' }];

  it('transitions to a resolved-family status and stamps resolvedBy/resolvedAt', () => {
    const result = setSignalStatus(base, 's1', 'dismissed', 'user_1', 'Not relevant to this case');
    expect(result[0]).toMatchObject({ status: 'dismissed', resolvedBy: 'user_1', resolvedReason: 'Not relevant to this case' });
    expect(result[0].resolvedAt).toBeTruthy();
  });

  it('clears resolvedBy/resolvedAt when transitioning back to open', () => {
    const dismissed = setSignalStatus(base, 's1', 'dismissed', 'user_1');
    const reopened = setSignalStatus(dismissed, 's1', 'open');
    expect(reopened[0].resolvedBy).toBeNull();
    expect(reopened[0].resolvedAt).toBeNull();
  });

  it('ignores an invalid status', () => {
    expect(setSignalStatus(base, 's1', 'not-a-real-status')).toBe(base);
  });
});

describe('supersedeOpenSignalsOfType', () => {
  it('resolves open signals of the given type and case, leaving others untouched', () => {
    const signals = [
      { id: 's1', caseId: 'case1', type: 'next_action', status: 'open' },
      { id: 's2', caseId: 'case1', type: 'next_action', status: 'dismissed' },
      { id: 's3', caseId: 'case1', type: 'inconsistency', status: 'open' },
      { id: 's4', caseId: 'case2', type: 'next_action', status: 'open' },
    ];
    const result = supersedeOpenSignalsOfType(signals, 'case1', 'next_action');
    expect(result.find(s => s.id === 's1').status).toBe('resolved');
    expect(result.find(s => s.id === 's2').status).toBe('dismissed'); // already resolved-family, untouched
    expect(result.find(s => s.id === 's3').status).toBe('open'); // different type
    expect(result.find(s => s.id === 's4').status).toBe('open'); // different case
  });
});

describe('SIGNAL_STATUSES', () => {
  it('includes every status referenced by setSignalStatus', () => {
    const ids = SIGNAL_STATUSES.map(s => s.id);
    expect(ids).toEqual(['open', 'accepted', 'dismissed', 'not_relevant', 'resolved', 'explained']);
  });
});

describe('topOpenSignalsOrgWide (Phase 20)', () => {
  const signals = [
    { id: 's1', caseId: 'case1', type: 'next_action', status: 'open', createdAt: '2026-08-01T00:00:00Z' },
    { id: 's2', caseId: 'case2', type: 'process_risk', status: 'open', createdAt: '2026-07-01T00:00:00Z' },
    { id: 's3', caseId: 'case2', type: 'unanswered_question', status: 'open', createdAt: '2026-08-10T00:00:00Z' },
    { id: 's4', caseId: 'case3', type: 'next_action', status: 'dismissed', createdAt: '2026-08-11T00:00:00Z' },
    { id: 's5', caseId: 'case3', type: 'process_risk', status: 'open', createdAt: '2026-08-05T00:00:00Z' },
  ];

  it('only includes open signals of the requested types', () => {
    const result = topOpenSignalsOrgWide(signals, ['next_action', 'process_risk']);
    expect(result.map(s => s.id)).toEqual(['s5', 's2', 's1']);
  });

  it('ranks process_risk above next_action regardless of recency, then by newest first within a type', () => {
    const result = topOpenSignalsOrgWide(signals, ['next_action', 'process_risk']);
    expect(result[0].id).toBe('s5'); // newer process_risk
    expect(result[1].id).toBe('s2'); // older process_risk, still ahead of any next_action
    expect(result[2].id).toBe('s1'); // only open next_action
  });

  it('caps the result to the given limit', () => {
    expect(topOpenSignalsOrgWide(signals, ['next_action', 'process_risk'], 2)).toHaveLength(2);
  });

  it('defaults to all open signals when no types filter is given', () => {
    const result = topOpenSignalsOrgWide(signals);
    expect(result.map(s => s.id)).toContain('s3');
  });
});
