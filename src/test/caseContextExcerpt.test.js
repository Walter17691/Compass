import { describe, it, expect } from 'vitest';
import { buildCaseContext, meetingsNeedingSummary, stripAdvisorNotes } from '../lib/caseContext.js';

// NEW-33 — shortened case content must identify itself as shortened.
//
// buildCaseContext truncated meeting records at 500 characters with a silent
// slice(). On the NEW-29 UAT case the stored transcript read "Can you confirm
// you are ready to proceed?" and the model received "...ready to pro" — so it
// reported, accurately about its own input, that the dialogue was cut off
// mid-sentence. That became a persisted next-action signal and an "incomplete
// record" question on a case whose record was complete.
//
// No prompt rule could prevent it: the model was describing what it was given.
// These tests pin the builder's own honesty instead.
const MARKER = '[record excerpt — remainder omitted to fit the context budget]';
const NOTE_HEAD = 'NOTE ON EXCERPTS:';

const baseCase = { id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct' };
const ctxFor = (meetings, extra = {}) => buildCaseContext({ ...baseCase, meetings, ...extra }, [], []);

// A record whose 500-character boundary falls mid-word, reproducing the exact
// production failure.
const NEW29_RECORD = [
  '## Meeting Details',
  'Type: Investigation',
  'Date: 22 September 2026',
  'Chair: Not specified',
  '',
  '## Meeting Dialogue',
  'WC: This is a test investigation meeting for meeting timing verification. ' + 'Filler sentence to push the cut point along. '.repeat(8),
  'WC: Can you confirm you are ready to proceed?',
  'SE: Yes.',
].join('\n');

describe('A. record shorter than the limit', () => {
  it('is preserved complete, with no excerpt marker', () => {
    const short = '## Meeting Dialogue\nWC: Short and complete.\nSE: Understood.';
    const ctx = ctxFor([{ type: 'Investigation', date: '2026-09-01', record: short }]);
    expect(ctx).toContain('WC: Short and complete.');
    expect(ctx).toContain('SE: Understood.');
    expect(ctx).not.toContain(MARKER);
    expect(ctx).not.toContain(NOTE_HEAD);
  });

  it('short content is byte-for-byte identical to the stored record', () => {
    const short = 'Line one.\nLine two.\nLine three.';
    const ctx = ctxFor([{ type: 'Investigation', date: '2026-09-01', record: short }]);
    expect(ctx).toContain(short);
  });
});

describe('B. record exactly at the limit', () => {
  it('is preserved complete, with no false truncation marker', () => {
    const exact = 'y'.repeat(500); // MEETING_FULL_CHARS
    const ctx = ctxFor([{ type: 'Investigation', date: '2026-09-01', record: exact }]);
    expect(ctx).toContain(exact);
    expect(ctx).not.toContain(MARKER);
    expect(ctx).not.toContain(NOTE_HEAD);
  });

  it('one character over the limit does produce a marker', () => {
    const over = 'y'.repeat(501);
    const ctx = ctxFor([{ type: 'Investigation', date: '2026-09-01', record: over }]);
    expect(ctx).toContain(MARKER);
    expect(ctx).toContain(NOTE_HEAD);
  });
});

describe('C. record over the limit', () => {
  const ctx = ctxFor([{ type: 'Investigation', date: '2026-09-22', record: NEW29_RECORD }]);

  it('is shortened', () => {
    expect(ctx.length).toBeLessThan(NEW29_RECORD.length + 2000);
    expect(ctx).not.toContain('SE: Yes.'); // tail genuinely omitted
  });

  it('carries an explicit omission marker', () => {
    expect(ctx).toContain(MARKER);
  });

  it('does not end mid-word', () => {
    const body = ctx.slice(0, ctx.indexOf(MARKER)).trimEnd();
    const lastChar = body.slice(-1);
    // Ends on a sentence terminator or at least a complete word, never a
    // partial token.
    expect(/[.?!]/.test(lastChar) || /\S/.test(lastChar)).toBe(true);
    expect(body.endsWith('pro')).toBe(false);
  });

  it('adds the excerpt note exactly once, even with several shortened items', () => {
    const many = ctxFor([
      { type: 'Investigation', date: '2026-09-01', record: 'a'.repeat(900) },
      { type: 'Disciplinary', date: '2026-09-02', record: 'b'.repeat(900) },
    ]);
    expect((many.match(/NOTE ON EXCERPTS:/g) || []).length).toBe(1);
    expect((many.match(/record excerpt — remainder omitted/g) || []).length).toBeGreaterThan(1);
  });
});

describe('D. NEW-29 regression — the exact production failure', () => {
  const ctx = ctxFor([{ type: 'Investigation', date: '2026-09-22', record: NEW29_RECORD }]);

  it('the underlying record contains the complete question', () => {
    expect(NEW29_RECORD).toContain('Can you confirm you are ready to proceed?');
  });

  it('context never presents a silent fragment ending "ready to pro"', () => {
    const silentFragment = /ready to pro(?!ceed)/;
    if (silentFragment.test(ctx)) {
      // If the cut still lands there it must at least be declared, never silent.
      const idx = ctx.search(silentFragment);
      expect(ctx.slice(idx, idx + 200)).toContain(MARKER);
    }
    // Either way the context must not imply completeness while being cut.
    expect(ctx).toContain(MARKER);
    expect(ctx).toContain(NOTE_HEAD);
  });

  it('the note explicitly denies that an excerpt means an incomplete record', () => {
    expect(ctx).toContain('is NOT evidence that the stored record, transcript or letter is incomplete');
    expect(ctx).toContain('that a meeting was cut short, that dialogue is missing, or that the record is defective');
    expect(ctx).toContain('The complete version exists in the case file');
    expect(ctx).toContain('Content without that marker is complete as supplied');
  });

  it('the note is deterministic, not a prompt asking the model to guess', () => {
    // It only appears when the builder actually shortened something.
    const untouched = ctxFor([{ type: 'Investigation', date: '2026-09-01', record: 'Complete and short.' }]);
    expect(untouched).not.toContain(NOTE_HEAD);
  });
});

describe('E. over-budget path keeps truthful semantics', () => {
  // Push past MEETINGS_BUDGET_CHARS (6000) so later meetings take the
  // compressed branch.
  const many = Array.from({ length: 6 }, (_, i) => ({
    id: `m${i}`, type: 'Investigation', date: `2026-09-0${i + 1}`, record: 'z'.repeat(1500),
  }));

  it('over-budget excerpts are marked too', () => {
    const ctx = buildCaseContext({ ...baseCase, meetings: many }, [], []);
    expect(ctx).toContain(MARKER);
    expect(ctx).toContain(NOTE_HEAD);
  });

  it('a cached summary is labelled as a summary, not as the record', () => {
    const ctx = buildCaseContext({ ...baseCase, meetings: many }, [], [], { m0: 'Cached AI summary of the meeting.' });
    expect(ctx).toContain("[summary of this meeting's record, not the record itself]");
    expect(ctx).toContain('Cached AI summary of the meeting.');
    expect(ctx).toContain(NOTE_HEAD);
  });

  it('meetingsNeedingSummary budgeting is unchanged', () => {
    const needing = meetingsNeedingSummary({ meetings: many });
    expect(Array.isArray(needing)).toBe(true);
    expect(needing.length).toBeGreaterThan(0);
  });
});

describe('letters and investigation reports use the same semantics', () => {
  it('a long letter is marked as an excerpt', () => {
    const ctx = ctxFor([{ type: 'Disciplinary', date: '2026-09-01', record: 'short', letterOutput: 'L'.repeat(900) }]);
    expect(ctx).toContain('Letter sent');
    expect(ctx).toContain(MARKER);
  });

  it('a short letter is not marked', () => {
    const ctx = ctxFor([{ type: 'Disciplinary', date: '2026-09-01', record: 'short', letterOutput: 'Dear Sam, this is complete.' }]);
    expect(ctx).toContain('Dear Sam, this is complete.');
    expect(ctx).not.toContain(MARKER);
  });

  it('a long investigation report is marked; a short one is not', () => {
    const long = buildCaseContext({ ...baseCase, meetings: [], investigationReport: 'R'.repeat(2500) }, [], []);
    expect(long).toContain(MARKER);
    const short = buildCaseContext({ ...baseCase, meetings: [], investigationReport: 'Findings: substantiated.' }, [], []);
    expect(short).toContain('Findings: substantiated.');
    expect(short).not.toContain(MARKER);
  });
});

describe('F/G. adjacent protections intact', () => {
  it('F. stripAdvisorNotes still removes advisory content from grounding', () => {
    const withAdvisor = [
      '## Meeting Details', 'Type: Investigation', '',
      '## Meeting Dialogue', 'WC: Factual content here.', '',
      '## HR Advisor Notes', 'TEST_ADVISORY_CONTENT should never reach grounding.',
    ].join('\n');
    const ctx = ctxFor([{ type: 'Investigation', date: '2026-09-01', record: withAdvisor }]);
    expect(ctx).not.toContain('TEST_ADVISORY_CONTENT');
    expect(ctx).not.toContain('## HR Advisor Notes');
    expect(ctx).toContain('WC: Factual content here.');
    expect(stripAdvisorNotes(withAdvisor)).not.toContain('TEST_ADVISORY_CONTENT');
  });

  it('F. the stored record object is not mutated by excerpting', () => {
    const meeting = { id: 'm1', type: 'Investigation', date: '2026-09-22', record: NEW29_RECORD };
    const snapshot = JSON.parse(JSON.stringify(meeting));
    buildCaseContext({ ...baseCase, meetings: [meeting] }, [], []);
    expect(meeting).toEqual(snapshot);
    expect(meeting.record).toContain('Can you confirm you are ready to proceed?');
  });

  it('G. no new AI call, endpoint or schema dependency was introduced', async () => {
    const src = await import('node:fs').then(fs => fs.readFileSync('src/lib/caseContext.js', 'utf8'));
    expect(src).not.toMatch(/authedFetch|\/api\/|supabase|streamClaude|migration/);
    expect(src).toContain('export function buildCaseContext');
    expect(src).toContain('export function meetingsNeedingSummary');
    expect(src).toContain('export function stripAdvisorNotes');
  });

  it('G. the existing budget architecture is preserved', async () => {
    const src = await import('node:fs').then(fs => fs.readFileSync('src/lib/caseContext.js', 'utf8'));
    expect(src).toContain('const MEETING_FULL_CHARS = 500;');
    expect(src).toContain('const MEETINGS_BUDGET_CHARS = 6000;');
    expect(src).toContain('const MEETING_FALLBACK_EXCERPT_CHARS = 150;');
    expect(src).toContain('const LETTER_EXCERPT_CHARS = 300;');
  });
});
