import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getNextStep } from '../lib/nextStep.js';
import {
  caseStatusLabel, isClosedStage, describeWhatIsHappening,
  caseRecordEntries, caseDetailSections, withRequestedSection,
} from '../lib/caseViewSummary.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B — reading a case without operating it.
//
// The derivations are pure, so they are tested directly. The point of each is
// that it composes an EXISTING authority — getNextStep, buildCaseTimeline,
// getCaseStage — rather than becoming a second opinion about the process.
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
const stripJs = src => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const summarySrc = stripJs(read('src/lib/caseViewSummary.js'));
const screenSrc = stripJs(read('src/screens/CaseViewScreen.jsx'));

const meeting = (over = {}) => ({
  id: 'm1', type: 'Investigation', date: '2026-09-20', record: 'Held.', transcript: [], ...over,
});

const kase = (over = {}) => ({
  id: 'c1', employeeId: 'e1', employeeName: 'John Smith', caseType: 'misconduct',
  dateReceived: '2026-09-01', meetings: [], evidence: [], ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B — the stage reads as words, never an internal id', () => {
  it('maps the validated stages to human labels', () => {
    expect(caseStatusLabel('investigation')).toBe('Investigation');
    expect(caseStatusLabel('disciplinary')).toBe('Disciplinary');
    expect(caseStatusLabel('appeal')).toBe('Appeal');
    expect(caseStatusLabel('closed')).toBe('Closed');
  });

  it('never leaks an implementation value, and invents no meaning', () => {
    // "inv_report" is a column value. An unrecognised stage reads as something
    // true of every open case and claims nothing further.
    expect(caseStatusLabel('inv_report')).toBe('In progress');
    expect(caseStatusLabel('some_future_stage')).toBe('In progress');
    expect(caseStatusLabel(null)).toBe('Open');
    expect(caseStatusLabel('inv_report')).not.toMatch(/inv_report|_/);
  });

  it('closed is recognised as closed', () => {
    expect(isClosedStage('closed')).toBe(true);
    expect(isClosedStage('investigation')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B — What is happening states facts, nothing more', () => {
  it('describes the stage and what has actually been gathered', () => {
    const text = describeWhatIsHappening({
      cs: kase(), stage: 'investigation',
      allegations: [{ id: 'a1' }, { id: 'a2' }],
      meetings: [meeting()],
    });
    expect(text).toContain('Investigation in progress');
    expect(text).toContain('2 allegations recorded');
    expect(text).toContain('1 meeting held');
  });

  it('singularises honestly', () => {
    const text = describeWhatIsHappening({
      cs: kase(), stage: 'investigation', allegations: [{ id: 'a1' }], meetings: [],
    });
    expect(text).toContain('1 allegation recorded');
    expect(text).not.toContain('allegations');
  });

  it('names the most immediate meeting fact', () => {
    const live = describeWhatIsHappening({
      cs: kase(), stage: 'disciplinary',
      meetings: [meeting({ status: 'in_progress', record: '' })],
    });
    expect(live).toContain('A meeting is in progress');

    const review = describeWhatIsHappening({
      cs: kase(), stage: 'disciplinary',
      meetings: [meeting({ status: 'review_draft' })],
    });
    expect(review).toContain('awaiting review');

    const sched = describeWhatIsHappening({
      cs: kase(), stage: 'investigation',
      meetings: [meeting({ status: 'scheduled', record: '' })],
    });
    expect(sched).toContain('A meeting is scheduled');
  });

  it('a closed case says so, with its outcome', () => {
    expect(describeWhatIsHappening({ cs: kase({ outcome: 'First written warning' }), stage: 'closed' }))
      .toBe('Closed. The outcome was First written warning.');
    expect(describeWhatIsHappening({ cs: kase(), stage: 'closed' })).toBe('Closed.');
  });

  it('says NOTHING rather than padding the screen', () => {
    // An open case with no stage, no allegations and no meetings has no fact worth
    // a sentence. "This case exists" is not information.
    expect(describeWhatIsHappening({ cs: kase(), stage: null })).toBeNull();
    expect(describeWhatIsHappening({})).toBeNull();
  });

  it('is deterministic, with no AI and no invented facts', () => {
    ['askCompass', 'streamClaude', 'generate', 'recommend', 'suggest', 'likely', 'should']
      .forEach(t => expect(summarySrc, t).not.toContain(t));
    // Compass's generated analysis OF the person is never restated as the case's
    // own factual state — that is how a prediction becomes "what is happening".
    ['prediction', 'riskScore', 'riskRating', 'unresolvedSuggestions']
      .forEach(t => expect(summarySrc, t).not.toContain(t));
    const a = describeWhatIsHappening({ cs: kase(), stage: 'investigation', allegations: [{ id: 'a' }] });
    const b = describeWhatIsHappening({ cs: kase(), stage: 'investigation', allegations: [{ id: 'a' }] });
    expect(a).toBe(b);
  });

  it('invents no process guidance for an unsupported type', () => {
    // E1.4 is authoritative: no recipe means no guidance. This only ever reports
    // stage and counts, so it cannot advise a capability case to hold a hearing.
    const text = describeWhatIsHappening({ cs: kase({ caseType: 'capability' }), stage: null, allegations: [{ id: 'a' }] });
    expect(text).not.toMatch(/hearing|disciplinary|invite|dismiss/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B — the case record is process history, not audit history', () => {
  const cs = kase({
    outcome: 'First written warning', outcomeIssuedAt: '2026-09-25',
    meetings: [meeting({ id: 'm1', date: '2026-09-10' })],
  });
  const allegations = [{ id: 'a1', caseId: 'c1', title: 'Lateness', createdAt: '2026-09-05' }];

  it('carries the meaningful milestones', () => {
    const rec = caseRecordEntries(cs, allegations);
    const text = JSON.stringify(rec);
    expect(text).toContain('Case opened');
    expect(text).toContain('Allegation added');
    expect(text).toContain('Outcome issued');
  });

  it('excludes technical audit noise even if an audit log exists', () => {
    // buildCaseTimeline is called with NO audit log, and audit-typed entries are
    // filtered regardless — every "case viewed" row would bury the hearing.
    const rec = caseRecordEntries(cs, allegations);
    expect(rec.every(e => e.type !== 'audit')).toBe(true);
    expect(summarySrc).toContain('buildCaseTimeline(cs, allegations, [])');
    expect(summarySrc).toContain("e.type !== \"audit\"");
  });

  it('reads most-recent-first, because that is what matters now', () => {
    const rec = caseRecordEntries(cs, allegations);
    const times = rec.map(e => new Date(e.date).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('is bounded on the main surface and unbounded for the full record', () => {
    expect(caseRecordEntries(cs, allegations, { limit: 2 })).toHaveLength(2);
    expect(caseRecordEntries(cs, allegations).length).toBeGreaterThan(2);
  });

  it('does not build a second timeline engine', () => {
    expect(summarySrc).toContain("import { buildCaseTimeline }");
    expect(summarySrc).not.toContain('entries.push');
  });

  it('an empty case produces an empty record, not a placeholder row', () => {
    expect(caseRecordEntries(kase({ dateReceived: null }), [])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B — supporting detail appears only when it applies', () => {
  it('an empty optional section does not appear', () => {
    const ids = caseDetailSections({}).map(s => s.id);
    expect(ids).not.toContain('people');
    expect(ids).not.toContain('communications');
  });

  it('a populated optional section does', () => {
    const ids = caseDetailSections({ participants: [{ name: 'A' }] }).map(s => s.id);
    expect(ids).toContain('people');
  });

  it('sections whose absence would block work stay available when empty', () => {
    // An investigator with nothing recorded yet still needs somewhere to record
    // the first allegation.
    const ids = caseDetailSections({}).map(s => s.id);
    ['allegations', 'evidence', 'meetings', 'tasks', 'documents'].forEach(id =>
      expect(ids, id).toContain(id));
  });

  it('counts are real, and open tasks only', () => {
    const s = caseDetailSections({
      allegations: [{ id: 'a' }, { id: 'b' }],
      tasks: [{ id: 't1', done: true }, { id: 't2', done: false }],
    });
    expect(s.find(x => x.id === 'allegations').count).toBe(2);
    expect(s.find(x => x.id === 'tasks').count).toBe(1);
  });

  it('"AI Assistant" is renamed to what it actually is', () => {
    const ai = caseDetailSections({ canSeeAnalysis: true }).find(s => s.id === 'ai');
    expect(ai.label).toBe('Compass analysis');
    expect(JSON.stringify(caseDetailSections({ canSeeAnalysis: true }))).not.toContain('AI Assistant');
  });

  it('Outcome appears when there is an outcome to see', () => {
    expect(caseDetailSections({}).map(s => s.id)).not.toContain('outcome');
    expect(caseDetailSections({ hasOutcome: true }).map(s => s.id)).toContain('outcome');
  });

  it('Themes are HR-only, as before', () => {
    expect(caseDetailSections({}).map(s => s.id)).not.toContain('themes');
    expect(caseDetailSections({ canSeeThemes: true }).map(s => s.id)).toContain('themes');
  });

  it('an explicitly requested section is restored even when empty', () => {
    // Deep links name a section directly; an empty Participants list must not make
    // the link land on nothing.
    const base = caseDetailSections({});
    expect(base.map(s => s.id)).not.toContain('people');
    const withPeople = withRequestedSection('people', base);
    expect(withPeople.map(s => s.id)).toContain('people');
    expect(withPeople.find(s => s.id === 'people').label).toBe('Participants');
  });

  it('an unknown requested id is ignored rather than inventing a section', () => {
    const base = caseDetailSections({});
    expect(withRequestedSection('not_a_section', base)).toEqual(base);
    expect(withRequestedSection(null, base)).toEqual(base);
  });

  it('a section already present is not duplicated', () => {
    const base = caseDetailSections({});
    const once = withRequestedSection('evidence', base);
    expect(once.filter(s => s.id === 'evidence')).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B — the screen composes, it does not re-decide', () => {
  it('the process engine is still the only authority on what happens next', () => {
    expect(screenSrc).toContain('getNextStep(cs, {hasAppealManager: !!currentAppealManagerAccess, isHR})');
    expect(screenSrc).toContain('onClick: handleNextStepAction');
    // No second next-step table in the screen or the summary module.
    expect(summarySrc).not.toContain('nextStep');
    expect(summarySrc).not.toMatch(/action:\s*"(start_|send_|close_|appoint_)/);
  });

  it('an unsupported process type still gets NO invented next step', () => {
    // E1.4 is authoritative and Wave B must not have softened it: a type Compass
    // has no validated recipe for gets a neutral state, never a fallback to the
    // disciplinary recipe.
    ['capability', 'attendance', 'redundancy', 'other', ''].forEach(caseType => {
      expect(getNextStep(kase({ caseType }), { isHR: true }), caseType).toBeNull();
    });
  });

  it('the twelve-destination navigation model is deleted, not dormant', () => {
    ['const TABS = [', 'TAB_GROUPS', 'PRIMARY_TAB_IDS', 'MORE_GROUPS', 'showMoreTabs']
      .forEach(t => expect(screenSrc, t).not.toContain(t));
  });

  it('a closed case offers no workflow action as its primary', () => {
    expect(screenSrc).toContain(': caseClosed ? null');
    // ...and starting a meeting is still available, in the menu.
    expect(screenSrc).toContain('(showNextStepPrimary || caseClosed) && { label: "+ New meeting"');
  });

  it('guardrails stay on the main surface', () => {
    // Deterministic process-risk signals carrying policy citations: proceeding past
    // one is a recorded policy deviation, so it is not hidden for tidiness.
    // The exact conditional, not a substring of it: `false && openGuardrails.length
    // > 0` still contains "openGuardrails.length > 0" and would pass a loose check
    // while hiding safety-critical information.
    expect(screenSrc).toContain('{openGuardrails.length > 0 && (');
    expect(screenSrc).toContain('<GuardrailsPanel');
    expect(screenSrc).not.toMatch(/false && openGuardrails/);
  });

  it('attention is overdue work matched on the case id, never on a name', () => {
    expect(screenSrc).toContain('d.caseId === cs.id && d.overdue');
    expect(screenSrc).not.toMatch(/d\.employeeName\s*===/);
  });

  it('the primary action is not repeated as an attention item', () => {
    // The screen must not say the same instruction three times.
    const attention = screenSrc.slice(screenSrc.indexOf('const caseAttention'), screenSrc.indexOf('const openGuardrails'));
    expect(attention).not.toContain('nextStep');
  });
});
