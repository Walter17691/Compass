import { describe, it, expect } from 'vitest';
import { collectInterventionSignals, formatSignalsForPrompt, sanitizeManagerCapabilityInsight } from '../lib/managerLearningLoop.js';

describe('collectInterventionSignals', () => {
  it('collects HR intervention notes from tagged case_tasks', () => {
    const caseTasks = [
      { id: 't1', source: 'hr_guidance', name: 'Guidance from HR: Check the CCTV angle again.', createdAt: '2026-08-01T00:00:00Z' },
      { id: 't2', source: 'hr_question', name: 'HR question: Did they check the swipe logs?', createdAt: '2026-08-02T00:00:00Z' },
      { id: 't3', source: null, name: 'Ordinary task' },
    ];
    const signals = collectInterventionSignals(caseTasks, [], []);
    expect(signals).toHaveLength(2);
    expect(signals.every(s => s.type === 'hr_intervention')).toBe(true);
  });

  it('collects returned-for-rework reasons, only when a comment was actually given', () => {
    const hrReviewRequests = [
      { step: 'inv_report', status: 'returned', comments: 'Allegation 2 was never explored.', reviewed_at: '2026-08-03T00:00:00Z' },
      { step: 'inv_report', status: 'returned', comments: '' },
      { step: 'inv_report', status: 'approved', comments: 'Fine' },
      { step: 'escalation', status: 'returned', comments: 'Not this one' },
    ];
    const signals = collectInterventionSignals([], hrReviewRequests, []);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ type: 'returned_for_rework', text: 'Allegation 2 was never explored.' });
  });

  it('collects meeting-quality-gap and policy-deviation audit entries, only when a detail was recorded', () => {
    const auditLog = [
      { action: 'Ended meeting despite quality check gaps', detail: 'Essential question not yet asked — reason given', ts: '2026-08-04T00:00:00Z' },
      { action: 'Ended meeting despite quality check gaps', detail: '' },
      { action: 'Policy deviation recorded', detail: 'Policy expectation: ... — Actual: ...', ts: '2026-08-05T00:00:00Z' },
      { action: 'Task added', detail: 'Something unrelated' },
    ];
    const signals = collectInterventionSignals([], [], auditLog);
    expect(signals).toHaveLength(2);
    expect(signals.map(s => s.type).sort()).toEqual(['meeting_quality_gap', 'policy_deviation']);
  });

  it('sorts most-recent-first and caps at 60 signals', () => {
    const caseTasks = Array.from({ length: 70 }, (_, i) => ({
      id: 't' + i, source: 'hr_guidance', name: 'Note ' + i,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    }));
    const signals = collectInterventionSignals(caseTasks, [], []);
    expect(signals).toHaveLength(60);
    expect(signals[0].text).toBe('Note 69');
  });
});

describe('formatSignalsForPrompt', () => {
  it('formats each signal as a typed, dashed line', () => {
    const text = formatSignalsForPrompt([
      { type: 'hr_intervention', text: 'Check the CCTV angle again.' },
      { type: 'returned_for_rework', text: 'Allegation 2 was never explored.' },
    ]);
    expect(text).toBe('- [HR intervention] Check the CCTV angle again.\n- [Returned for rework] Allegation 2 was never explored.');
  });

  it('returns an empty string for no signals', () => {
    expect(formatSignalsForPrompt([])).toBe('');
  });
});

describe('sanitizeManagerCapabilityInsight', () => {
  it('shapes valid AI output', () => {
    const parsed = {
      categories: [
        { label: 'Insufficient follow-up questioning', description: 'Several investigations stopped after the first round of questions.', frequency: 'Seen in 4 of the recorded notes' },
      ],
      suggestedResponse: 'Consider a short refresher on probing-question technique for investigators.',
    };
    expect(sanitizeManagerCapabilityInsight(parsed)).toEqual({
      categories: [{ label: 'Insufficient follow-up questioning', description: 'Several investigations stopped after the first round of questions.', frequency: 'Seen in 4 of the recorded notes' }],
      suggestedResponse: 'Consider a short refresher on probing-question technique for investigators.',
    });
  });

  it('drops a category with no label and caps at 5 categories', () => {
    const parsed = { categories: [
      { label: '', description: 'no label' },
      ...Array.from({ length: 6 }, (_, i) => ({ label: 'Cat ' + i, description: '' })),
    ] };
    const result = sanitizeManagerCapabilityInsight(parsed);
    expect(result.categories).toHaveLength(5);
    expect(result.categories.every(c => c.label)).toBe(true);
  });

  it('never throws on malformed input', () => {
    expect(sanitizeManagerCapabilityInsight(null)).toEqual({ categories: [], suggestedResponse: '' });
    expect(sanitizeManagerCapabilityInsight({ categories: 'not an array', suggestedResponse: 42 })).toEqual({ categories: [], suggestedResponse: '' });
  });
});
