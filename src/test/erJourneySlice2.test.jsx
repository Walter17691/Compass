import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';

import {
  INVESTIGATION_CONCLUSION_VALUES, INVESTIGATION_CONCLUSION_COPY,
  isValidConclusion, conclusionLabel, conclusionMeaning,
  rollupInvestigationConclusions, ROLLUP, describeRollup,
} from '../lib/investigationConclusion.js';
import {
  recordInvestigationConclusionWrite, CONCLUSION_WRITE_RESULT, describeConclusionWriteOutcome,
} from '../lib/investigationConclusionWrite.js';
import {
  disclosableAllegation, summariseAllegationDisclosure,
  ALLEGATION_DISCLOSE, ALLEGATION_REVIEW_REQUIRED, ALLEGATION_WITHHELD_INTERNAL,
} from '../lib/dsarAllegationDisclosure.js';
import { getNextStep } from '../lib/nextStep.js';
import { AllegationsPanel } from '../components/AllegationsPanel.jsx';
import { InvestigationConclusionField } from '../components/InvestigationConclusionField.jsx';
import { compileSubjectData } from '../lib/dsarCompile.js';

// ═══════════════════════════════════════════════════════════════════════════
// ER JOURNEY SLICE 2 — THE STRUCTURED INVESTIGATION CONCLUSION.
//
// Three things that used to be one:
//   1. the investigator's assessment      (narrative, theirs)
//   2. the investigation conclusion       (is there a case to answer?)   ← new
//   3. the disciplinary finding           (is it substantiated?)         Slice 3
//
// Where a claim is about the DATABASE — authority, provenance, cross-tenant
// refusal, no-false-audit — the authoritative evidence is the behavioural probe
// run against production inside an aborted transaction (recorded in the wave
// report). The assertions here pin the migration that produces that behaviour so
// it cannot be silently removed or weakened, which is what a source assertion is
// genuinely good for. UI claims are proven by rendering.
// ═══════════════════════════════════════════════════════════════════════════

const MIG = () => readFileSync('supabase/investigation_conclusion_2026-10-04.sql', 'utf8');
const app = () => readFileSync('src/App.jsx', 'utf8');
const panelSrc = () => readFileSync('src/components/AllegationsPanel.jsx', 'utf8');

// Comments are prose, not enforcement. Every assertion about what the code DOES
// strips them first — the trap this project has hit about a dozen times.
const stripSql = s => s.replace(/--[^\n]*/g, '');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

const alleg = (over = {}) => ({
  id: 'a1', caseId: 'c1', title: 'Unauthorised absence', status: 'unreviewed',
  investigationConclusion: null, investigationConclusionReasoning: '',
  investigationConclusionBy: null, investigationConclusionAt: null, ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE VOCABULARY (tests 1-4)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — the conclusion vocabulary is closed and means what it says', () => {
  it('offers exactly the three conclusions, and no more', () => {
    expect(INVESTIGATION_CONCLUSION_VALUES).toEqual([
      'case_to_answer', 'no_case_to_answer', 'further_investigation_required',
    ]);
  });

  it('accepts each of the three', () => {
    ['case_to_answer', 'no_case_to_answer', 'further_investigation_required']
      .forEach(v => expect(isValidConclusion(v), v).toBe(true));
  });

  it('rejects an invalid conclusion, including every disciplinary-finding word', () => {
    ['substantiated', 'partially_substantiated', 'not_substantiated', 'upheld',
     'proven', 'guilty', 'unreviewed', '', null, undefined, 'CASE_TO_ANSWER',
    ].forEach(v => expect(isValidConclusion(v), String(v)).toBe(false));
  });

  it('the database carries the same closed vocabulary, so the client is not the boundary', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/add constraint allegations_investigation_conclusion_check/);
    expect(sql).toMatch(/investigation_conclusion is null\s*\n\s*or investigation_conclusion in \('case_to_answer', 'no_case_to_answer', 'further_investigation_required'\)/);
  });

  it('NEVER describes a conclusion in disciplinary-finding language', () => {
    const copy = JSON.stringify(INVESTIGATION_CONCLUSION_COPY).toLowerCase();
    ['substantiat', 'upheld', 'proven', 'guilt', 'innocent', 'found against']
      .forEach(w => expect(copy, w).not.toContain(w));
    // And says what it DOES mean: a hearing, not a verdict.
    expect(conclusionMeaning('case_to_answer')).toContain('considered at a disciplinary hearing');
    expect(conclusionMeaning('no_case_to_answer')).toContain('does not identify sufficient grounds');
    expect(conclusionMeaning('further_investigation_required')).toContain('More information is needed');
  });

  it('labels are the plain three', () => {
    expect(conclusionLabel('case_to_answer')).toBe('Case to answer');
    expect(conclusionLabel('no_case_to_answer')).toBe('No case to answer');
    expect(conclusionLabel('further_investigation_required')).toBe('Further investigation required');
    expect(conclusionLabel('substantiated')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. ABSENCE IS NOT A CONCLUSION (tests 5, 16)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — a missing conclusion stays unknown', () => {
  it('a legacy allegation with no conclusion is UNRESOLVED, not either answer', () => {
    const r = rollupInvestigationConclusions([alleg()]);
    expect(r.state).toBe(ROLLUP.UNRESOLVED);
    expect(r.unresolved).toBe(1);
    expect(r.concluded).toBe(0);
    expect(r.canProceedToDisciplinary).toBe(false);
    expect(r.canCloseNoCase).toBe(false);
    expect(r.investigationComplete).toBe(false);
  });

  it('a historical "substantiated" status is NOT read as a case to answer', () => {
    // The single most important inference this domain must never make. 343
    // production rows are in exactly this state.
    const r = rollupInvestigationConclusions([alleg({ status: 'substantiated' })]);
    expect(r.state).toBe(ROLLUP.UNRESOLVED);
    expect(r.counts.case_to_answer).toBeUndefined();
  });

  it('no other field is mined for a conclusion either', () => {
    const r = rollupInvestigationConclusions([alleg({
      status: 'not_substantiated',
      investigatorFinding: 'The allegation is made out in full.',
      decisionReasoning: 'Clear evidence.',
      appealOutcome: 'upheld',
    })]);
    expect(r.state).toBe(ROLLUP.UNRESOLVED);
    expect(r.concluded).toBe(0);
  });

  it('an unrecognised stored value counts as unresolved rather than being coerced', () => {
    const r = rollupInvestigationConclusions([alleg({ investigationConclusion: 'case to answer' })]);
    expect(r.state).toBe(ROLLUP.UNRESOLVED);
  });

  it('the migration backfills nothing, and says which sources it refuses to infer from', () => {
    const sql = MIG();
    expect(stripSql(sql)).not.toMatch(/update public\.allegations\s+set investigation_conclusion/i);
    expect(stripSql(sql)).not.toMatch(/insert into public\.allegations/i);
    // The columns are added nullable with no default: that IS the fail-safe.
    expect(stripSql(sql)).toMatch(/add column if not exists investigation_conclusion text/);
    expect(stripSql(sql)).not.toMatch(/investigation_conclusion text\s+(not null|default)/i);
    // And the reasoning is on the record.
    expect(sql).toContain('NO BACKFILL');
    expect(sql).toContain('Unknown stays unknown');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. THE CONCLUSION IS PER ALLEGATION (tests 6, 7)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — the conclusion is per allegation', () => {
  it('two allegations can hold different conclusions at once', () => {
    const r = rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'case_to_answer' }),
      alleg({ id: 'a2', investigationConclusion: 'no_case_to_answer' }),
    ]);
    expect(r.counts).toEqual({ case_to_answer: 1, no_case_to_answer: 1 });
    expect(r.total).toBe(2);
    expect(r.concluded).toBe(2);
  });

  it('all three can coexist on one case', () => {
    const r = rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'case_to_answer' }),
      alleg({ id: 'a2', investigationConclusion: 'no_case_to_answer' }),
      alleg({ id: 'a3', investigationConclusion: 'further_investigation_required' }),
    ]);
    expect(r.counts).toEqual({ case_to_answer: 1, no_case_to_answer: 1, further_investigation_required: 1 });
  });

  it('there is NO case-level conclusion column — the case position is derived', () => {
    const sql = stripSql(MIG());
    expect(sql).not.toMatch(/alter table public\.cases\s+add column/i);
    expect(sql).toMatch(/alter table public\.allegations/);
    // And no stored stage projection was introduced.
    expect(sql).not.toMatch(/add column if not exists .*stage/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. THE ROLLUP (tests 8, 9, 10, 11)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — the case-level position is derived, with the safe reading winning', () => {
  it('ONE further-investigation allegation blocks progression', () => {
    const r = rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'case_to_answer' }),
      alleg({ id: 'a2', investigationConclusion: 'further_investigation_required' }),
    ]);
    expect(r.state).toBe(ROLLUP.FURTHER_REQUIRED);
    expect(r.canProceedToDisciplinary).toBe(false);
    expect(r.canCloseNoCase).toBe(false);
  });

  it('one case-to-answer plus remaining no-case conclusions permits disciplinary', () => {
    const r = rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'case_to_answer' }),
      alleg({ id: 'a2', investigationConclusion: 'no_case_to_answer' }),
      alleg({ id: 'a3', investigationConclusion: 'no_case_to_answer' }),
    ]);
    expect(r.state).toBe(ROLLUP.PROCEED_TO_DISCIPLINARY);
    expect(r.canProceedToDisciplinary).toBe(true);
    expect(r.canCloseNoCase).toBe(false);
  });

  it('all no-case conclusions permits closing', () => {
    const r = rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'no_case_to_answer' }),
      alleg({ id: 'a2', investigationConclusion: 'no_case_to_answer' }),
    ]);
    expect(r.state).toBe(ROLLUP.CLOSE_NO_CASE);
    expect(r.canCloseNoCase).toBe(true);
    expect(r.canProceedToDisciplinary).toBe(false);
  });

  it('an UNRESOLVED allegation outranks a case-to-answer — the fail-safe ordering', () => {
    // The ordering that matters most: one answered allegation must not carry a
    // case past one nobody has looked at.
    const r = rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'case_to_answer' }),
      alleg({ id: 'a2' }),
    ]);
    expect(r.state).toBe(ROLLUP.UNRESOLVED);
    expect(r.canProceedToDisciplinary).toBe(false);
    expect(r.investigationComplete).toBe(false);
  });

  it('unresolved also outranks further-investigation, and further outranks proceed', () => {
    expect(rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'further_investigation_required' }),
      alleg({ id: 'a2' }),
    ]).state).toBe(ROLLUP.UNRESOLVED);
    expect(rollupInvestigationConclusions([
      alleg({ id: 'a1', investigationConclusion: 'further_investigation_required' }),
      alleg({ id: 'a2', investigationConclusion: 'case_to_answer' }),
    ]).state).toBe(ROLLUP.FURTHER_REQUIRED);
  });

  it('a case with no allegations keeps the pre-Slice-2 behaviour', () => {
    const r = rollupInvestigationConclusions([]);
    expect(r.state).toBe(ROLLUP.NO_ALLEGATIONS);
    expect(r.canProceedToDisciplinary).toBe(false);
    expect(r.canCloseNoCase).toBe(false);
  });

  it('investigationComplete is never true while anything is unresolved', () => {
    for (const list of [
      [alleg()],
      [alleg({ id: 'a1', investigationConclusion: 'case_to_answer' }), alleg({ id: 'a2' })],
      [alleg({ id: 'a1', investigationConclusion: 'no_case_to_answer' }), alleg({ id: 'a2' })],
    ]) expect(rollupInvestigationConclusions(list).investigationComplete).toBe(false);
  });

  it('describes what the case is waiting for, in plain words, or says nothing', () => {
    expect(describeRollup(rollupInvestigationConclusions([]))).toBeNull();
    expect(describeRollup(rollupInvestigationConclusions([alleg()]))).toBe('1 allegation still needs an investigation conclusion.');
    expect(describeRollup(rollupInvestigationConclusions([alleg({ id: 'a1' }), alleg({ id: 'a2' })])))
      .toBe('2 allegations still need an investigation conclusion.');
  });

  it('tolerates junk input without inventing a position', () => {
    [null, undefined, 'nonsense', 42].forEach(v => {
      const r = rollupInvestigationConclusions(v);
      expect(r.canProceedToDisciplinary).toBe(false);
      expect(r.canCloseNoCase).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. THE TRANSITION GATE (tests 8, 9, 10, 11, 34, 35, 36)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — the structured conclusions drive the EXISTING transition', () => {
  // A case sitting at inv_report: an investigation report exists, no disciplinary
  // meeting, no outcome. That is exactly how getCaseStage derives inv_report.
  const invReportCase = (over = {}) => ({
    id: 'c1', caseType: 'misconduct', employeeName: 'Sam',
    investigationReport: 'A report.', meetings: [], ...over,
  });
  const stepFor = conclusions => getNextStep(invReportCase(), {
    isHR: true,
    conclusionRollup: rollupInvestigationConclusions(
      conclusions.map((c, i) => alleg({ id: `a${i}`, investigationConclusion: c }))
    ),
  });

  it('the case really is at inv_report, so these tests exercise the right branch', async () => {
    const { getCaseStage } = await import('../lib/caseStage.js');
    expect(getCaseStage(invReportCase())).toBe('inv_report');
  });

  it('an unresolved allegation offers NEITHER progression nor closure', () => {
    const step = stepFor([null]);
    expect(step.action).toBe('investigation_conclusions');
    expect(step.secondary).toBeUndefined();
    expect(step.label).toMatch(/investigation conclusion/i);
  });

  it('further investigation required offers NEITHER', () => {
    const step = stepFor(['further_investigation_required']);
    expect(step.action).toBe('investigation_conclusions');
    expect(step.secondary).toBeUndefined();
    expect(step.label).toBe('Continue the investigation');
  });

  it('a case to answer offers the disciplinary invitation, and NOT the close shortcut', () => {
    const step = stepFor(['case_to_answer']);
    expect(step.action).toBe('disciplinary_invite');
    // The permanently-available "No case to answer — close" alternative is gone:
    // the conclusions have already answered that question.
    expect(step.secondary).toBeUndefined();
  });

  it('all no-case-to-answer makes closing the PRIMARY action', () => {
    const step = stepFor(['no_case_to_answer', 'no_case_to_answer']);
    expect(step.action).toBe('close_no_case');
    expect(step.primary).toBe(true);
    expect(step.reason).toMatch(/no allegation has a case to answer/i);
    // And it is offered ONCE. Leaving the old secondary in place here would put
    // the same action on screen twice and resurrect the competing-CTA problem.
    expect(step.secondary).toBeUndefined();
  });

  it('mixed conclusions with one case to answer still proceed to disciplinary', () => {
    expect(stepFor(['case_to_answer', 'no_case_to_answer']).action).toBe('disciplinary_invite');
  });

  it('a case with NO allegations keeps the old both-actions behaviour exactly', () => {
    const step = getNextStep(invReportCase(), { isHR: true, conclusionRollup: rollupInvestigationConclusions([]) });
    expect(step.action).toBe('disciplinary_invite');
    expect(step.secondary).toEqual({ label: 'No case to answer — close', action: 'close_no_case' });
  });

  it('and so does a case whose caller passes no rollup at all — non-regression for every other consumer', () => {
    // homeFeed, CasesScreen, InsightsScreen and the AI floor check all call
    // getNextStep WITHOUT a rollup. None of them may start seeing a blocked step.
    const step = getNextStep(invReportCase(), { isHR: true });
    expect(step.action).toBe('disciplinary_invite');
    expect(step.secondary).toEqual({ label: 'No case to answer — close', action: 'close_no_case' });
  });

  it('no OTHER stage changed behaviour', () => {
    const roll = rollupInvestigationConclusions([alleg()]);   // the blocking state
    const at = (over) => getNextStep({ id: 'c1', caseType: 'misconduct', meetings: [], ...over }, { isHR: true, conclusionRollup: roll });
    expect(at({}).action).toBe('start_investigation');                        // intake
    expect(at({ stage: 'disciplinary' }).action).toBe('start_disciplinary');  // disciplinary
    expect(at({ stage: 'closed' })).toBeNull();                               // closed
  });

  it('close_no_case has exactly ONE implementation, reachable from both positions', () => {
    const cv = stripJs(readFileSync('src/screens/CaseViewScreen.jsx', 'utf8'));
    // One definition...
    expect((cv.match(/const closeWithNoCaseToAnswer = /g) || []).length).toBe(1);
    // ...called from the primary dispatch and from the secondary button.
    expect((cv.match(/closeWithNoCaseToAnswer\(\)/g) || []).length).toBe(2);
    // The old inline duplicate is gone.
    expect(cv).not.toMatch(/nextStep\.secondary\.action==="close_no_case"\)\{requestCloseCase\(\{allowNoCase/);
    // And it still routes through the one HR-gated closure path.
    expect(cv).toMatch(/closeWithNoCaseToAnswer = \(\) => requestCloseCase\(\{/);
  });

  it('closing records NO second conclusion of its own — it executes a consequence', () => {
    const cv = stripJs(readFileSync('src/screens/CaseViewScreen.jsx', 'utf8'));
    const body = cv.slice(cv.indexOf('const closeWithNoCaseToAnswer'), cv.indexOf('if(isAssignedNotetaker)'));
    expect(body).not.toContain('investigation_conclusion');
    expect(body).not.toContain('recordCaseDecision');
    expect(body).not.toContain('investigationConclusion');
    // It writes a stage transition and a letter, nothing else.
    expect(body).toContain('allowNoCase: true');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. THE WRITER (tests 4, 12, 13, 14, 25, 26, 45)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — the write sends the conclusion and nothing else', () => {
  let captured;
  const conditionalUpdate = vi.fn(async (_sb, _table, _id, _ver, fields) => { captured = fields; return {}; });
  beforeEach(() => { captured = undefined; conditionalUpdate.mockClear(); });

  const write = (over = {}) => recordInvestigationConclusionWrite({
    supabase: {}, allegationId: 'a1', conclusion: 'case_to_answer',
    reasoning: 'Documents and accounts gathered.', expectedUpdatedAt: 'v1',
    conditionalUpdate, ...over,
  });

  it('records a case to answer', async () => {
    const r = await write();
    expect(r.result).toBe(CONCLUSION_WRITE_RESULT.OK);
    expect(captured.investigation_conclusion).toBe('case_to_answer');
  });

  it('records no case to answer', async () => {
    await write({ conclusion: 'no_case_to_answer' });
    expect(captured.investigation_conclusion).toBe('no_case_to_answer');
  });

  it('records further investigation required', async () => {
    await write({ conclusion: 'further_investigation_required' });
    expect(captured.investigation_conclusion).toBe('further_investigation_required');
  });

  it('refuses an invalid conclusion WITHOUT touching the network', async () => {
    for (const bad of ['substantiated', 'upheld', '', null, 'CASE_TO_ANSWER']) {
      const r = await write({ conclusion: bad });
      expect(r.result, String(bad)).toBe(CONCLUSION_WRITE_RESULT.INVALID);
    }
    expect(conditionalUpdate).not.toHaveBeenCalled();
  });

  it('requires reasoning, and blank space is not reasoning', async () => {
    for (const bad of ['', '   ', '\n\t', null, undefined]) {
      const r = await write({ reasoning: bad });
      expect(r.result, JSON.stringify(bad)).toBe(CONCLUSION_WRITE_RESULT.REASONING_REQUIRED);
    }
    expect(conditionalUpdate).not.toHaveBeenCalled();
  });

  it('NEVER sends conclusion_by or conclusion_at — provenance is not the client\'s to claim', async () => {
    await write();
    expect(captured).not.toHaveProperty('investigation_conclusion_by');
    expect(captured).not.toHaveProperty('investigation_conclusion_at');
    expect(Object.keys(captured).sort()).toEqual([
      'investigation_conclusion', 'investigation_conclusion_reasoning', 'updated_at',
    ]);
  });

  it('cannot be tricked into sending provenance by passing it in', async () => {
    await recordInvestigationConclusionWrite({
      supabase: {}, allegationId: 'a1', conclusion: 'case_to_answer', reasoning: 'r',
      investigation_conclusion_by: 'attacker', investigationConclusionBy: 'attacker',
      investigationConclusionAt: '1999-01-01', conditionalUpdate,
    });
    expect(JSON.stringify(captured)).not.toContain('attacker');
    expect(JSON.stringify(captured)).not.toContain('1999');
  });

  it('writes NOTHING touching the disciplinary finding, a decision, or an appeal', async () => {
    await write();
    const keys = Object.keys(captured);
    ['status', 'decided_by', 'decided_at', 'decision_reasoning',
     'appeal_outcome', 'appeal_reasoning', 'appeal_decided_by', 'appeal_decided_at',
    ].forEach(k => expect(keys, k).not.toContain(k));
  });

  it('trims the reasoning it does send', async () => {
    await write({ reasoning: '  Gathered the records.  ' });
    expect(captured.investigation_conclusion_reasoning).toBe('Gathered the records.');
  });

  it('turns a database refusal into a sentence about authority, not a stack trace', async () => {
    const r = await write({ conditionalUpdate: async () => ({ error: { message: 'Only HR or this case\'s assigned investigator can record an investigation conclusion' } }) });
    expect(r.result).toBe(CONCLUSION_WRITE_RESULT.REFUSED);
    expect(describeConclusionWriteOutcome(r.result)).toBe("Only HR or this case's assigned investigator can record an investigation conclusion.");
  });

  it('recognises the no-erasure refusal', async () => {
    const r = await write({ conditionalUpdate: async () => ({ error: { message: 'An investigation conclusion cannot be removed once recorded.' } }) });
    expect(r.result).toBe(CONCLUSION_WRITE_RESULT.REFUSED);
  });

  it('recognises a confidential-case refusal', async () => {
    const r = await write({ conditionalUpdate: async () => ({ error: { message: 'You do not have access to modify this confidential case' } }) });
    expect(r.result).toBe(CONCLUSION_WRITE_RESULT.REFUSED);
  });

  it('reports a stale-copy conflict rather than overwriting', async () => {
    const r = await write({ conditionalUpdate: async () => ({ conflict: true }) });
    expect(r.result).toBe(CONCLUSION_WRITE_RESULT.CONFLICT);
    expect(describeConclusionWriteOutcome(r.result)).toMatch(/refreshed/i);
  });

  it('never throws, whatever the client does', async () => {
    const r = await write({ conditionalUpdate: async () => { throw new Error('socket closed'); } });
    expect(r.result).toBe(CONCLUSION_WRITE_RESULT.FAILED);
  });

  it('every outcome has a message, and none leaks a table, column or SQL state', () => {
    Object.values(CONCLUSION_WRITE_RESULT).forEach(res => {
      const m = describeConclusionWriteOutcome(res);
      expect(m, res).toBeTruthy();
      ['allegations', 'investigation_conclusion', '42501', '23514', 'trigger', 'postgres', 'row-level']
        .forEach(leak => expect(m.toLowerCase(), `${res} must not leak ${leak}`).not.toContain(leak.toLowerCase()));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. THE GENERIC SAVE CANNOT TOUCH THE CONCLUSION (test 45, 44)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — only one writer can reach the conclusion columns', () => {
  it('saveAllegationToDB does not mention the conclusion columns at all', () => {
    const src = stripJs(app());
    const start = src.indexOf('const saveAllegationToDB');
    const body = src.slice(start, src.indexOf('const deleteAllegationFromDB', start));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('investigator_finding');            // it does send the narrative
    expect(body).not.toContain('investigation_conclusion');    // and not the conclusion
  });

  it('the CSV importer invents no conclusion', () => {
    const src = stripJs(app());
    // Every import path is in the same file; none may write the column.
    const importRegions = src.split('\n').filter(l => /import|csv|Csv|CSV/.test(l) && l.includes('investigation_conclusion'));
    expect(importRegions).toEqual([]);
  });

  it('the ONLY place the conclusion columns are written is the dedicated writer', () => {
    const writer = stripJs(readFileSync('src/lib/investigationConclusionWrite.js', 'utf8'));
    expect(writer).toContain('investigation_conclusion:');
    expect(writer).toContain('investigation_conclusion_reasoning:');
    // Grep the whole src tree for anything else writing the snake_case columns.
    const files = ['src/App.jsx', 'src/screens/CaseViewScreen.jsx', 'src/components/AllegationsPanel.jsx',
                   'src/components/InvestigationConclusionField.jsx'];
    files.forEach(f => {
      const s = stripJs(readFileSync(f, 'utf8'));
      expect(s, f).not.toMatch(/investigation_conclusion\s*:/);
    });
  });

  it('the database refuses the bypass regardless, which is the actual boundary', () => {
    const sql = stripSql(MIG());
    // Provenance is ASSIGNED, not validated — so no entry path can forge it.
    //
    // Asserted as an UNCONDITIONAL statement on its own line. A plain substring
    // match is not enough: it also passes for
    //   if new.investigation_conclusion_by is null then new... := auth.uid(); end if;
    // which is the spoofable version, because it only fills in provenance the
    // client did not supply. Mutation M9 proved that hole in this very test.
    expect(sql).toMatch(/^\s*new\.investigation_conclusion_by := auth\.uid\(\);\s*$/m);
    expect(sql).toMatch(/^\s*new\.investigation_conclusion_at := now\(\);\s*$/m);
    // And nothing anywhere makes either conditional on what arrived.
    expect(sql).not.toMatch(/investigation_conclusion_by is null/);
    expect(sql).not.toMatch(/investigation_conclusion_at is null/);
    expect(sql).not.toMatch(/coalesce\(new\.investigation_conclusion_by/);
    expect(sql).not.toMatch(/coalesce\(new\.investigation_conclusion_at/);
    // And the trigger is BEFORE UPDATE on the table itself, not on an RPC.
    expect(sql).toMatch(/create trigger protect_allegations_investigation_conclusion_trigger\s*\n\s*before update on public\.allegations/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. AUTHORITY, IN THE DATABASE (tests 21, 22, 23, 24, 27)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — authority is enforced by the database, not the UI', () => {
  it('restricts the write to HR or THIS case\'s assigned investigator', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/public\.is_hr_role\(om\.role\)/);
    expect(sql).toMatch(/ca\.case_id = old\.case_id and ca\.user_id = auth\.uid\(\) and ca\.role = 'investigator'/);
    expect(sql).toMatch(/Only HR or this case''s assigned investigator can record an investigation conclusion/);
  });

  it('deliberately does NOT extend it to the disciplinary officer', () => {
    const sql = stripSql(MIG());
    const fn = sql.slice(sql.indexOf('protect_allegations_investigation_conclusion_columns'),
                         sql.indexOf('log_investigation_conclusion'));
    expect(fn).not.toContain('disciplinary_officer');
  });

  it('the three decisions have DISJOINT non-HR authorities — that is the separation', () => {
    // investigation conclusion -> investigator        (this migration)
    // disciplinary finding     -> disciplinary_officer (existing trigger)
    // appeal decision          -> appeal_manager       (existing trigger)
    const sql = stripSql(MIG());
    const fn = sql.slice(sql.indexOf('create or replace function public.protect_allegations_investigation_conclusion_columns'),
                         sql.indexOf('create or replace function public.log_investigation_conclusion'));
    expect(fn).toContain("'investigator'");
    expect(fn).not.toContain("'appeal_manager'");
    expect(fn).not.toContain("'disciplinary_officer'");
  });

  it('a cross-tenant caller fails because the check is scoped to the allegation\'s own org and case', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/om\.org_id = old\.org_id/);
    expect(sql).toMatch(/ca\.case_id = old\.case_id/);
    // old.*, never new.* — so a caller cannot redirect the check by sending a
    // different org_id or case_id in the same UPDATE.
    const fn = sql.slice(sql.indexOf('if not ('), sql.indexOf('CONFIDENTIAL') > -1 ? sql.indexOf('select * into v_case') : sql.length);
    expect(fn).not.toMatch(/om\.org_id = new\.org_id/);
    expect(fn).not.toMatch(/ca\.case_id = new\.case_id/);
  });

  it('enforces confidential-case access ITSELF, because the cases-table guard never fires here', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/v_case\.confidential is true/);
    expect(sql).toMatch(/om\.case_access_level = 1/);
    expect(sql).toMatch(/v_case\.created_by is distinct from auth\.uid\(\)/);
    expect(sql).toMatch(/You do not have access to modify this confidential case/);
  });

  it('validates the allegation really belongs to a real case', () => {
    expect(stripSql(MIG())).toMatch(/This allegation does not reference a real case/);
  });

  it('refuses to erase a recorded conclusion', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/An investigation conclusion cannot be removed once recorded/);
  });

  it('requires reasoning at the database too, not only in the client', () => {
    expect(stripSql(MIG())).toMatch(/coalesce\(btrim\(new\.investigation_conclusion_reasoning\), ''\) = ''/);
  });

  it('leaves the existing finding and appeal triggers completely alone', () => {
    const sql = stripSql(MIG());
    expect(sql).not.toMatch(/create or replace function public\.protect_allegations_finding_columns/);
    expect(sql).not.toMatch(/create or replace function public\.protect_allegations_appeal_decision_columns/);
    expect(sql).not.toMatch(/drop trigger .*protect_allegations_finding/);
    expect(sql).not.toMatch(/drop trigger .*appeal/i);
  });

  it('weakens no RLS policy and creates none', () => {
    const sql = stripSql(MIG());
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/drop policy/i);
    expect(sql).not.toMatch(/alter table .* (enable|disable) row level security/i);
  });

  it('does not touch cases, case_decisions, appeals or closure authorisation', () => {
    const sql = stripSql(MIG());
    expect(sql).not.toMatch(/alter table public\.cases/);
    expect(sql).not.toMatch(/alter table public\.case_decisions/);
    expect(sql).not.toMatch(/record_case_decision/);
    expect(sql).not.toMatch(/protect_case_closure/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. AUDIT (tests 28, 29, 30)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — the conclusion is audited, and the allegation stays authoritative', () => {
  it('records the first conclusion and an amendment as DIFFERENT actions', () => {
    const sql = stripSql(MIG());
    expect(sql).toContain("'Investigation conclusion recorded'");
    expect(sql).toContain("'Investigation conclusion amended'");
    expect(sql).toMatch(/if old\.investigation_conclusion is null then\s*\n\s*v_action := 'Investigation conclusion recorded'/);
  });

  it('an amendment captures the from→to pair', () => {
    expect(stripSql(MIG())).toMatch(/%s amended to %s/);
  });

  it('names the allegation in a typed column, not only in prose', () => {
    const sql = stripSql(MIG());
    expect(sql).toMatch(/add column if not exists allegation_id text references public\.allegations\(id\) on delete set null/);
    expect(sql).toMatch(/insert into public\.audit_log \(org_id, user_id, user_name, action, detail, case_id, allegation_id\)/);
  });

  it('both actions are unforgeable through the generic audit RPC', () => {
    const sql = MIG();
    // The reserved-list text is built inside a SQL string literal, so every quote
    // is DOUBLED in the file. Asserting the undoubled form would silently never
    // match — the assertion has to be written against what is actually there.
    expect(sql).toContain("''Investigation conclusion recorded'',");
    expect(sql).toContain("''Investigation conclusion amended''");
    // And the reserved-list edit is applied to the DEPLOYED definition rather
    // than a retyped copy — the D4.3 incident class.
    expect(sql).toMatch(/pg_get_functiondef\(p\.oid\) into v_def/);
    expect(sql).toMatch(/refusing to guess where the list is/i);
  });

  it('the client writes no audit event for this — the trigger does', () => {
    const src = stripJs(app());
    const start = src.indexOf('const recordInvestigationConclusion = async');
    const body = src.slice(start, src.indexOf('};', src.indexOf('showToast(describeConclusionWriteOutcome(result), "error")', start)));
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/\baudit\(/);
  });

  it('a FAILED conclusion cannot produce an audit row — the BEFORE trigger aborts first', () => {
    const sql = stripSql(MIG());
    // Authority is checked in a BEFORE trigger; the audit is written by an AFTER
    // trigger. A raise in BEFORE aborts the statement, so AFTER never runs.
    expect(sql).toMatch(/before update on public\.allegations\s*\n\s*for each row execute function public\.protect_allegations_investigation_conclusion_columns/);
    expect(sql).toMatch(/after update on public\.allegations\s*\n\s*for each row execute function public\.log_investigation_conclusion/);
  });

  it('audit_log is NOT used as the domain store', () => {
    const sql = stripSql(MIG());
    // The authoritative value lives on the allegation; audit gets the fact of
    // the change, never the reasoning text.
    expect(sql).not.toMatch(/investigation_conclusion_reasoning[^)]*\)\s*\n?\s*values/);
    const fn = sql.slice(sql.indexOf('create or replace function public.log_investigation_conclusion'));
    expect(fn).not.toContain('new.investigation_conclusion_reasoning,');
  });

  it('writes no audit row when there is no authenticated actor, rather than inventing one', () => {
    expect(stripSql(MIG())).toMatch(/if auth\.uid\(\) is null then\s*\n\s*return null;/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. THE UI (tests 17, 18, 19, 20) — rendered, not read
// ═══════════════════════════════════════════════════════════════════════════
const noop = () => {};
const cs = { id: 'c1', caseType: 'misconduct', employeeName: 'Sam Employee', evidence: [] };
const panelProps = (a, over = {}) => ({
  cs, allegations: [a], allAllegations: [a],
  createAllegation: noop, patchAllegation: noop, changeAllegationStatus: noop,
  deleteAllegation: noop, saveCases: noop, cases: [cs], confirmDialog: noop,
  showToast: noop, setReviewOutput: noop, setScreen: noop, screens: {},
  orgMembers: [], fmtDate: d => d, generateAppealReview: noop,
  recordAppealOutcome: noop, policies: [], generateConsistencyReview: noop,
  ...over,
});
async function expand(title = 'Unauthorised absence') {
  const user = userEvent.setup();
  const matches = screen.getAllByText(title);
  await user.click(matches[matches.length - 1]);
  return user;
}

describe('Slice 2 — the Investigation screen asks the investigation question', () => {
  it('offers the conclusion to someone entitled to record it', async () => {
    // IR-REPORT-01a — "entitled" is now canConcludeInvestigation (HR or the
    // assigned investigator), not canRecordInvestigation (which also admits
    // the disciplinary officer, whom the database refuses).
    render(<AllegationsPanel {...panelProps(alleg())} canRecordInvestigation={true} canConcludeInvestigation={true} atDecisionStage={false} />);
    await expand();
    expect(screen.getByRole('button', { name: 'Record investigation conclusion' })).toBeInTheDocument();
  });

  it('is PROGRESSIVELY DISCLOSED — one button, no panel, until it is being used', async () => {
    render(<AllegationsPanel {...panelProps(alleg())} canRecordInvestigation={true} atDecisionStage={false} />);
    await expand();
    // The three choices are not on screen yet.
    expect(screen.queryByRole('radio', { name: /Case to answer/ })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/what in the investigation leads to this conclusion/i)).not.toBeInTheDocument();
  });

  it('reveals the three choices and the reasoning only when asked', async () => {
    render(<AllegationsPanel {...panelProps(alleg())} canRecordInvestigation={true} canConcludeInvestigation={true} atDecisionStage={false} />);
    const user = await expand();
    await user.click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    ['Case to answer', 'No case to answer', 'Further investigation required']
      .forEach(l => expect(screen.getByText(l)).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/what in the investigation leads to this conclusion/i)).toBeInTheDocument();
  });

  it('shows each option\'s plain meaning, so the user is not guessing', async () => {
    render(<InvestigationConclusionField allegation={alleg()} canRecord={true} onRecord={noop} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    expect(screen.getByText('There is sufficient information for this issue to be considered at a disciplinary hearing.')).toBeInTheDocument();
    expect(screen.getByText('The investigation does not identify sufficient grounds for this issue to proceed to a disciplinary hearing.')).toBeInTheDocument();
    expect(screen.getByText('More information is needed before deciding whether this issue should proceed.')).toBeInTheDocument();
  });

  it('states plainly that it is not a decision on the issue', async () => {
    render(<InvestigationConclusionField allegation={alleg()} canRecord={true} onRecord={noop} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    expect(screen.getByText(/It is not a decision on the issue itself/)).toBeInTheDocument();
  });

  it('never calls the subject an allegation — an investigation may have none', async () => {
    // IR-REPORT-01a follow-up. This control is shared by HR's panel and the
    // investigator's workspace, and an investigation may be opened on an
    // incident before any allegation exists. Asserted on the rendered output
    // rather than the copy module, so a future reword anywhere in this
    // component is caught too.
    const { container } = render(<InvestigationConclusionField allegation={alleg()} canRecord={true} onRecord={noop} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    expect(container.textContent.toLowerCase()).not.toContain('allegation');
    // ...and the three choices are still all present and correctly worded.
    ['Case to answer', 'No case to answer', 'Further investigation required']
      .forEach(l => expect(screen.getByText(l)).toBeInTheDocument());
  });

  it('cannot be saved without BOTH a choice and reasoning', async () => {
    const onRecord = vi.fn(async () => true);
    render(<InvestigationConclusionField allegation={alleg()} canRecord={true} onRecord={onRecord} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record investigation conclusion' }));

    const save = screen.getByRole('button', { name: 'Save conclusion' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /Case to answer/ }));
    expect(screen.getByRole('button', { name: 'Save conclusion' })).toBeDisabled();   // still no reasoning

    await user.type(screen.getByPlaceholderText(/what in the investigation leads to this conclusion/i), 'The records confirm it.');
    expect(screen.getByRole('button', { name: 'Save conclusion' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Save conclusion' }));
    expect(onRecord).toHaveBeenCalledWith('case_to_answer', 'The records confirm it.');
  });

  it('whitespace-only reasoning does not enable saving', async () => {
    render(<InvestigationConclusionField allegation={alleg()} canRecord={true} onRecord={noop} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    await user.click(screen.getByRole('radio', { name: /No case to answer/ }));
    await user.type(screen.getByPlaceholderText(/what in the investigation leads to this conclusion/i), '    ');
    expect(screen.getByRole('button', { name: 'Save conclusion' })).toBeDisabled();
  });

  it('summarises a recorded conclusion compactly, with who and when', () => {
    render(<InvestigationConclusionField
      allegation={alleg({ investigationConclusion: 'case_to_answer',
        investigationConclusionReasoning: 'Accounts were consistent.',
        investigationConclusionBy: 'u1', investigationConclusionAt: '2026-10-04' })}
      canRecord={true} onRecord={noop} fmtDate={d => d}
      orgMembers={[{ user_id: 'u1', name: 'Dana HR' }]} />);
    expect(screen.getByText('Case to answer')).toBeInTheDocument();
    expect(screen.getByText('Accounts were consistent.')).toBeInTheDocument();
    expect(screen.getByText(/Recorded 2026-10-04 by Dana HR/)).toBeInTheDocument();
    // Compact: not an open form.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('offers amendment, and says the amendment is recorded', async () => {
    render(<InvestigationConclusionField
      allegation={alleg({ investigationConclusion: 'case_to_answer', investigationConclusionReasoning: 'r' })}
      canRecord={true} onRecord={noop} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Amend conclusion' }));
    expect(screen.getByText(/Amending is recorded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save amended conclusion' })).toBeInTheDocument();
  });

  it('someone NOT entitled to record one sees the state read-only and no control', async () => {
    render(<AllegationsPanel {...panelProps(alleg())} canRecordInvestigation={false} canDecide={false} atDecisionStage={false} />);
    await expand();
    expect(screen.queryByRole('button', { name: 'Record investigation conclusion' })).not.toBeInTheDocument();
    // "Not yet recorded" is also the read-only placeholder for the investigator's
    // assessment, so scope to the conclusion's own label rather than the bare text.
    const label = screen.getByText('Investigation conclusion:');
    expect(label.parentElement.textContent).toContain('Not yet recorded');
  });

  it('keeps the typed reasoning when the save is refused', async () => {
    const onRecord = vi.fn(async () => false);
    render(<InvestigationConclusionField allegation={alleg()} canRecord={true} onRecord={onRecord} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    await user.click(screen.getByRole('radio', { name: /Case to answer/ }));
    const box = screen.getByPlaceholderText(/what in the investigation leads to this conclusion/i);
    await user.type(box, 'Carefully written reasoning.');
    await user.click(screen.getByRole('button', { name: 'Save conclusion' }));
    expect(onRecord).toHaveBeenCalled();
    expect(screen.getByDisplayValue('Carefully written reasoning.')).toBeInTheDocument();
  });

  it('the terminology is "Investigator\'s assessment" everywhere a user can see it', async () => {
    render(<AllegationsPanel {...panelProps(alleg({ investigatorFinding: 'x' }))} canRecordInvestigation={true} atDecisionStage={false} />);
    await expand();
    expect(screen.getAllByText(/Investigator's assessment/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Investigator's finding/)).not.toBeInTheDocument();
  });

  it('no disciplinary finding control has returned to Investigation', async () => {
    render(<AllegationsPanel {...panelProps(alleg({ status: 'substantiated' }))}
      canDecide={true} canRecordInvestigation={true} atDecisionStage={false} />);
    await expand();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Decision reasoning/)).not.toBeInTheDocument();
  });

  it('no consistency or sanction intelligence has returned to Investigation', async () => {
    render(<AllegationsPanel {...panelProps(alleg())} canDecide={true} canRecordInvestigation={true} atDecisionStage={false} />);
    await expand();
    expect(screen.queryByText(/How similar cases have been decided/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sanction consistency/i)).not.toBeInTheDocument();
  });

  it('the conclusion appears AFTER the investigation material, not above it', () => {
    // Order in the source is the render order, and section E is explicit that the
    // conclusion must not sit above the evidence or the assessment.
    const src = panelSrc();
    const assessment = src.indexOf("Investigator's assessment — what the investigation");
    const uncertainty = src.indexOf('allegation-outstanding-uncertainty-');
    const conclusion = src.indexOf('<InvestigationConclusionField');
    expect(assessment).toBeGreaterThan(-1);
    expect(conclusion).toBeGreaterThan(uncertainty);
    expect(uncertainty).toBeGreaterThan(assessment);
  });

  it('the conclusion is NOT gated behind the decision stage — it belongs during investigation', async () => {
    // IR-REPORT-01a — this read the JSX text of the call and asserted
    // `canRecord={canRecordInvestigation}`, so it failed when that binding
    // correctly narrowed to canConcludeInvestigation, while never actually
    // proving the atDecisionStage point it is named for. Both halves are now
    // executed: the control appears before the decision stage, and it is the
    // conclusion authority — not the decision stage — that governs it.
    render(<AllegationsPanel {...panelProps(alleg())} canRecordInvestigation={true} canConcludeInvestigation={true} atDecisionStage={false} />);
    await expand();
    expect(screen.getByRole('button', { name: 'Record investigation conclusion' })).toBeInTheDocument();
  });

  it('is governed by the conclusion authority, not the narrative one', async () => {
    render(<AllegationsPanel {...panelProps(alleg())} canRecordInvestigation={true} canConcludeInvestigation={false} atDecisionStage={true} />);
    await expand();
    expect(screen.queryByRole('button', { name: 'Record investigation conclusion' })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. THE INVESTIGATION REPORT (tests 31, 32)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — the report states the conclusion and never converts it to a finding', () => {
  it('carries the real structured conclusion into the report context', () => {
    const src = app();
    expect(src).toContain('STRUCTURED INVESTIGATION CONCLUSION');
    expect(src).toMatch(/a\.investigationConclusion\s*\n?\s*\?/);
  });

  it('says "not recorded" rather than inferring one', () => {
    expect(app()).toContain('STRUCTURED INVESTIGATION CONCLUSION: not recorded');
    expect(app()).toContain('never infer one from the disciplinary status');
  });

  it('distinguishes the three things explicitly in the prompt', () => {
    const src = app();
    expect(src).toContain("INVESTIGATOR'S ASSESSMENT");
    expect(src).toContain('STRUCTURED INVESTIGATION CONCLUSION');
    expect(src).toContain('RECORDED DISCIPLINARY STATUS');
    expect(src).toContain('must never be merged or substituted for one another');
  });

  it('no longer asks for upheld / not upheld per allegation', () => {
    expect(app()).not.toContain('upheld / not upheld');
    expect(app()).toContain('Do NOT state whether the allegation is substantiated, upheld, proven or made out');
  });

  it('labels the disciplinary status as the separate later decision it is', () => {
    expect(app()).toContain('a SEPARATE later decision, not the investigation conclusion');
  });

  it('the HR review flow around the report is untouched', () => {
    const src = stripJs(app());
    expect(src).toContain('requestHrReview("inv_report"');
    expect(src).toContain('const resolveInvestigationReview');
    expect(src).toContain('finalizeInvestigationSubmission');
    // No second investigation decision was introduced alongside it.
    expect(src).not.toMatch(/investigationDecision|caseToAnswerDecision/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. DSAR (test 42) — the new fields, classified
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — DSAR discloses the conclusion, not the people inside it', () => {
  const full = () => ({
    id: 'a1', caseId: 'c1', orgId: 'o1', title: 'T', description: 'D', period: 'P',
    peopleInvolved: 'Someone', status: 'substantiated', employeeResponse: 'ER',
    witnessEvidence: 'WE', investigatorFinding: 'IF', outstandingUncertainty: 'OU',
    decisionReasoning: 'DR', decidedBy: 'user-hr-1', decidedAt: '2026-01-01',
    appealOutcome: 'upheld', appealReasoning: 'AR', appealDecidedBy: 'user-hr-2',
    appealDecidedAt: '2026-02-01', createdBy: 'user-hr-3', createdAt: 'c', updatedAt: 'u',
    investigationConclusion: 'case_to_answer',
    investigationConclusionReasoning: 'Sensitive internal reasoning.',
    investigationConclusionBy: 'user-investigator-9',
    investigationConclusionAt: '2026-10-04T10:00:00Z',
  });

  it('discloses the conclusion and its timestamp', () => {
    const d = disclosableAllegation(full());
    expect(d.investigationConclusion).toBe('case_to_answer');
    expect(d.investigationConclusionAt).toBe('2026-10-04T10:00:00Z');
  });

  it('WITHHOLDS the internal actor id, and every other provenance id', () => {
    const d = disclosableAllegation(full());
    expect(d).not.toHaveProperty('investigationConclusionBy');
    expect(d).not.toHaveProperty('decidedBy');
    expect(d).not.toHaveProperty('appealDecidedBy');
    expect(d).not.toHaveProperty('createdBy');
    expect(JSON.stringify(d)).not.toContain('user-investigator-9');
    expect(JSON.stringify(d)).not.toContain('user-hr-1');
    expect(d.withheldAsInternalAnalysis).toContain('investigationConclusionBy');
  });

  it('marks the conclusion reasoning, the assessment and the uncertainty REVIEW-REQUIRED, not disclosed', () => {
    const d = disclosableAllegation(full());
    expect(d).not.toHaveProperty('investigationConclusionReasoning');
    expect(d).not.toHaveProperty('investigatorFinding');
    expect(d).not.toHaveProperty('outstandingUncertainty');
    expect(JSON.stringify(d)).not.toContain('Sensitive internal reasoning.');
    expect(d.reviewRequired.map(r => r.field).sort())
      .toEqual(['investigatorFinding', 'investigationConclusionReasoning', 'outstandingUncertainty'].sort());
    d.reviewRequired.forEach(r => expect(r.reason, r.field).toBeTruthy());
  });

  it('FAILS CLOSED on a column nobody classified', () => {
    const d = disclosableAllegation({ ...full(), someFutureColumn: 'leaky value' });
    expect(d).not.toHaveProperty('someFutureColumn');
    expect(JSON.stringify(d)).not.toContain('leaky value');
    expect(d.unrecognisedFieldsWithheld).toContain('someFutureColumn');
  });

  it('every classified field is in exactly one list', () => {
    const all = [...ALLEGATION_DISCLOSE, ...ALLEGATION_REVIEW_REQUIRED, ...ALLEGATION_WITHHELD_INTERNAL];
    expect(new Set(all).size).toBe(all.length);
  });

  it('every one of the four new columns is classified — none can slip through', () => {
    const known = new Set([...ALLEGATION_DISCLOSE, ...ALLEGATION_REVIEW_REQUIRED, ...ALLEGATION_WITHHELD_INTERNAL]);
    ['investigationConclusion', 'investigationConclusionReasoning',
     'investigationConclusionBy', 'investigationConclusionAt',
    ].forEach(f => expect(known.has(f), f).toBe(true));
  });

  it('a null conclusion discloses nothing and flags nothing', () => {
    const d = disclosableAllegation(alleg());
    expect(d.investigationConclusion).toBeNull();
    expect(d.reviewRequired).toEqual([]);
  });

  it('the compiled package routes allegations through the projection', () => {
    const base = {
      employees: [{ id: 'e1', name: 'Ada Lovelace' }],
      cases: [{ id: 'c1', employeeName: 'Ada Lovelace', employeeId: 'e1', meetings: [] }],
      allegations: [{ ...full(), caseId: 'c1' }],
    };
    const r = compileSubjectData('Ada Lovelace', base);
    expect(r.allegations).toHaveLength(1);
    expect(r.allegations[0]).not.toHaveProperty('investigationConclusionBy');
    expect(JSON.stringify(r.allegations)).not.toContain('user-investigator-9');
    expect(r.allegationDisclosure.reviewRequired.length).toBeGreaterThan(0);
  });

  it('the reviewer is TOLD, so a flag is not computed and then hidden', () => {
    const summary = summariseAllegationDisclosure([disclosableAllegation(full())]);
    expect(summary.reviewRequired.length).toBe(3);
    summary.reviewRequired.forEach(r => {
      expect(r.allegationId).toBe('a1');
      expect(r.caseId).toBe('c1');
    });
    // And the screen merges it into the one banner the reviewer reads.
    const dsar = stripJs(readFileSync('src/screens/DsarScreen.jsx', 'utf8'));
    expect(dsar).toContain('compiled.allegationDisclosure?.reviewRequired');
  });

  it('the conclusion reasoning is scanned for third-party mentions', () => {
    const src = stripJs(readFileSync('src/lib/dsarCompile.js', 'utf8'));
    expect(src).toContain("'investigationConclusionReasoning',");
    // One shared list, used by both scan directions — it used to be two hand-kept copies.
    expect((src.match(/ALLEGATION_FREE_TEXT_FIELDS\.forEach/g) || []).length).toBe(2);
  });

  it('governance records the change, and the known asymmetry, truthfully', async () => {
    // Reads the RUNTIME value, not the file text: the note is assembled from
    // concatenated string literals, so a phrase that spans a `+` boundary exists
    // in the string and not in the source. Asserting on the source would have
    // been asserting on line wrapping.
    const { classificationFor } = await import('../lib/dataClassification.js');
    const note = classificationFor('allegations').dsarNote;
    expect(note).toContain('dsarAllegationDisclosure.js');
    expect(note).toContain('investigation_conclusion_by are withheld');
    expect(note).toContain('KNOWN ASYMMETRY');
    expect(note).toContain('review-required');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. EVERYTHING ELSE IS UNCHANGED (tests 12, 13, 14, 15, 37-41, 43)
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 2 — out-of-scope architecture is untouched', () => {
  it('the allegation status vocabulary is byte-identical', async () => {
    const { ALLEGATION_STATUSES, FINDING_STATUSES } = await import('../lib/allegations.js');
    expect(ALLEGATION_STATUSES.map(s => s.id)).toEqual([
      'unreviewed', 'evidence_gathering', 'substantiated',
      'partially_substantiated', 'not_substantiated', 'unable_to_determine',
    ]);
    expect(FINDING_STATUSES).toEqual([
      'substantiated', 'partially_substantiated', 'not_substantiated', 'unable_to_determine',
    ]);
  });

  it('the appeal model is untouched', async () => {
    const { APPEAL_OUTCOMES } = await import('../lib/allegations.js');
    expect(APPEAL_OUTCOMES.map(o => o.id)).toEqual(
      ['upheld', 'partially_upheld', 'not_upheld', 'further_investigation_required']);
    // NOTE: 'further_investigation_required' is ALSO an appeal-outcome id. Same
    // token, different column, different CHECK constraint — the two vocabularies
    // are independent and this slice did not touch the appeal one.
    const sql = stripSql(MIG());
    expect(sql).not.toContain('appeal_outcome');
    expect(sql).not.toContain('appeal_decided_by');
  });

  it('the D4.3 decision vocabulary and architecture are untouched', async () => {
    const { DECISION_OUTCOMES } = await import('../lib/caseDecisions.js');
    expect(DECISION_OUTCOMES.length).toBeGreaterThan(0);
    expect(DECISION_OUTCOMES).not.toContain('case_to_answer');
    expect(DECISION_OUTCOMES).not.toContain('no_case_to_answer');
  });

  it('recording a conclusion creates no case_decision and no appeal outcome', async () => {
    const captured = [];
    await recordInvestigationConclusionWrite({
      supabase: {}, allegationId: 'a1', conclusion: 'case_to_answer', reasoning: 'r',
      conditionalUpdate: async (_s, table, _i, _v, f) => { captured.push([table, f]); return {}; },
    });
    expect(captured).toHaveLength(1);
    expect(captured[0][0]).toBe('allegations');
    expect(JSON.stringify(captured[0][1])).not.toContain('decision');
    expect(JSON.stringify(captured[0][1])).not.toContain('appeal');
  });

  it('the conclusion does not alter the disciplinary status in client state either', () => {
    // setAllegationStatus is the only thing that changes status, and the
    // conclusion writer does not go near it.
    const writer = stripJs(readFileSync('src/lib/investigationConclusionWrite.js', 'utf8'));
    expect(writer).not.toContain('status');
    expect(writer).not.toContain('setAllegationStatus');
  });

  it('the meeting lifecycle, Current Warnings and portal surfaces are not touched by the migration', () => {
    const sql = stripSql(MIG());
    ['meetings', 'standalone_meetings', 'employee_records', 'hr_review_requests', 'case_signals']
      .forEach(t => expect(sql, t).not.toMatch(new RegExp(`alter table public\\.${t}`)));
  });

  it('tenant isolation is unchanged — org_id still comes from the parent case', () => {
    const sql = stripSql(MIG());
    // sync_case_child_org_id is the existing trigger that does this, and this
    // migration neither replaces nor bypasses it.
    expect(sql).not.toContain('sync_case_child_org_id');
    expect(sql).not.toMatch(/new\.org_id\s*:=/);
  });

  it('the migration is additive: no drop column, no type change, no rename', () => {
    const sql = stripSql(MIG());
    expect(sql).not.toMatch(/alter table[\s\S]{0,80}drop column(?! if exists investigation_conclusion)/i);
    expect(sql).not.toMatch(/alter column/i);
    expect(sql).not.toMatch(/rename/i);
    // investigator_finding is NOT renamed — only its UI wording changed.
    expect(sql).not.toContain('investigator_finding');
  });

  it('it carries a complete rollback, and is honest that rollback loses new conclusions', () => {
    const sql = MIG();
    expect(sql).toContain('ROLLBACK');
    expect(sql).toMatch(/drop trigger if exists protect_allegations_investigation_conclusion_trigger/);
    expect(sql).toMatch(/drop trigger if exists log_investigation_conclusion_trigger/);
    expect(sql).toMatch(/drop column if exists investigation_conclusion/);
    expect(sql).toContain('which is real data loss');
  });

  it('it records its baseline with the DIGEST EXPRESSIONS, not just the values', () => {
    const sql = MIG();
    ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'].forEach(d => expect(sql, d).toContain(d + ' md5('));
    expect(sql).toContain("md5(string_agg(id||':'||coalesce(status,'-'), ',' order by id))");
    expect(sql).toContain('084dedd8581418aa232532a6ee95f063');
    expect(sql).toContain('can neither confirm nor deny drift');
  });
});
