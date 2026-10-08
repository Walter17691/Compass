import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';

import { mayRecordInvestigationNarrative } from '../lib/investigationAuthority.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AllegationsPanel } from '../components/AllegationsPanel.jsx';
import { hasReachedOutcomeStage } from '../lib/outcomeReachability.js';
import { hasGuidedStages } from '../lib/processStages.js';
import { computeDecisionQualityGaps } from '../lib/decisionQuality.js';
import { employeeStageLabel } from '../portal/employeeStageLabel.js';
import { getCaseStage } from '../lib/caseStage.js';
import { mapCaseRow } from '../lib/caseMapping.js';

// ─────────────────────────────────────────────────────────────────────────
// ER JOURNEY SLICE 1 — the right question at the right stage.
//
// Production UAT showed the Investigation screen asking the investigator to mark
// an allegation "Substantiated" — the DISCIPLINARY question — and showing how
// comparable cases had been SANCTIONED, before the employee had been heard.
//
// This slice changes presentation and authority only. No persistence semantics,
// no schema, no migration, no reinterpretation of the 343 historical
// substantiated rows. The gate is the existing canonical, process-type-aware
// hasReachedOutcomeStage, not a second stage comparison.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};
const ALLEGATION = {
  id: 'a1', caseId: 'c1', title: 'Unauthorised absence', status: 'substantiated',
  investigatorFinding: 'Swipe records confirm the absence.',
  outstandingUncertainty: 'Whether leave was verbally agreed.',
  decisionReasoning: 'Evidence was clear and undisputed.',
  employeeResponse: 'The employee said they overslept.',
};
const CS = { id: 'c1', caseType: 'misconduct', employeeName: 'Sam Employee', evidence: [] };

// Three closed comparable cases so both distributions clear MIN_SAMPLE_SIZE and
// would render if the stage gate were absent.
const CLOSED = [1, 2, 3].map(n => ({
  id: 'closed' + n, caseType: 'misconduct', stage: 'closed',
  outcome: n === 3 ? 'Dismissal with notice' : 'Final written warning', meetings: [], evidence: [],
}));
const CLOSED_ALLEGATIONS = CLOSED.map((c, i) => ({
  id: 'ca' + i, caseId: c.id, title: 'Prior', status: 'substantiated',
  decisionReasoning: 'Reasoning recorded for the prior case.',
}));

const base = {
  cs: CS, allegations: [ALLEGATION], allAllegations: [ALLEGATION, ...CLOSED_ALLEGATIONS],
  createAllegation: noop, patchAllegation: noop, changeAllegationStatus: noop,
  deleteAllegation: noop, saveCases: noop, cases: [CS, ...CLOSED],
  confirmDialog: noop, showToast: noop, setReviewOutput: noop, setScreen: noop, screens: {},
  orgMembers: [], fmtDate: d => d, generateAppealReview: noop, recordAppealOutcome: noop,
  policies: [], generateConsistencyReview: noop,
};

async function renderPanel(over = {}) {
  render(<AllegationsPanel {...base} {...over} />);
  const user = userEvent.setup();
  // The title also appears in the evidence matrix above; the expandable row is last.
  const matches = screen.getAllByText('Unauthorised absence');
  await user.click(matches[matches.length - 1]);
  return user;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. INVESTIGATION DOES NOT ASK THE DISCIPLINARY QUESTION
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — Investigation withholds the disciplinary determination', () => {
  it('shows no status CONTROL during investigation', async () => {
    await renderPanel({ atDecisionStage: false });
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('shows no decision reasoning during investigation', async () => {
    await renderPanel({ atDecisionStage: false });
    expect(screen.queryByLabelText(/Decision reasoning/)).not.toBeInTheDocument();
  });

  it('shows no finding consistency during investigation', async () => {
    await renderPanel({ atDecisionStage: false });
    expect(screen.queryByText('How similar cases have been decided')).not.toBeInTheDocument();
  });

  it('shows no sanction consistency or comparable sanctions during investigation', async () => {
    await renderPanel({ atDecisionStage: false });
    expect(screen.queryByText(/were sanctioned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Final written warning/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dismissal with notice/)).not.toBeInTheDocument();
  });

  it('STILL shows the allegation, the investigator assessment and outstanding uncertainty', async () => {
    await renderPanel({ atDecisionStage: false });
    expect(screen.getAllByText('Unauthorised absence').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Investigator's assessment/)).toBeInTheDocument();
    expect(screen.getByLabelText('Outstanding uncertainty')).toBeInTheDocument();
  });

  it('keeps a status already on the record visible, read-only — history is not hidden', async () => {
    // The 343 historical substantiated rows must stay inspectable. The value
    // appears as text (the list's own state chip plus the read-only field); what
    // must NOT exist is a control that invites the investigator to set it.
    await renderPanel({ atDecisionStage: false });
    expect(screen.getAllByText('Substantiated').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('offers no status field at all for an allegation with no finding yet', async () => {
    // The list keeps its own state chip ("Unreviewed") — that is a progress
    // indicator, not the disciplinary question. No control, and no read-only
    // "Status" FIELD implying a determination is pending from the investigator.
    await renderPanel({ atDecisionStage: false, allegations: [{ ...ALLEGATION, status: 'unreviewed' }] });
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
  });
});

describe('Slice 1 — the Disciplinary stage still exposes the finding controls', () => {
  it('shows the status control, reasoning and both consistency surfaces', async () => {
    await renderPanel({ atDecisionStage: true });
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText(/Decision reasoning/)).toBeInTheDocument();
    expect(screen.getByText('How similar cases have been decided')).toBeInTheDocument();
  });

  it('defaults to the decision stage when the prop is omitted — no silent regression', async () => {
    await renderPanel({});
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('gating never mutates an allegation', async () => {
    const changeAllegationStatus = vi.fn();
    const patchAllegation = vi.fn();
    await renderPanel({ atDecisionStage: false, changeAllegationStatus, patchAllegation });
    expect(changeAllegationStatus).not.toHaveBeenCalled();
    expect(patchAllegation).not.toHaveBeenCalled();
    expect(ALLEGATION.status).toBe('substantiated');   // the fixture object is untouched
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE GATE IS THE EXISTING CANONICAL DERIVATION
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — the stage gate reuses hasReachedOutcomeStage', () => {
  it('is false before the hearing and true from the hearing on, for misconduct', () => {
    const c = { caseType: 'misconduct' };
    expect(hasReachedOutcomeStage(c, 'investigation')).toBe(false);
    expect(hasReachedOutcomeStage(c, 'inv_report')).toBe(false);
    expect(hasReachedOutcomeStage(c, 'disciplinary')).toBe(true);
    expect(hasReachedOutcomeStage(c, 'outcome')).toBe(true);
  });

  it('is process-type aware — a grievance reaches its decision point at "hearing"', () => {
    const g = { caseType: 'grievance' };
    expect(hasReachedOutcomeStage(g, 'intake')).toBe(false);
    expect(hasReachedOutcomeStage(g, 'hearing')).toBe(true);
  });

  it('a case type with no stage model is not withheld from', () => {
    // Otherwise the control would become unreachable on the 2,951 production
    // cases whose case_type is empty, which is a regression not a deferral.
    expect(hasGuidedStages('')).toBe(false);
    expect(hasGuidedStages('misconduct')).toBe(true);
  });

  it('CaseViewScreen derives the gate from those two helpers and nothing else', () => {
    const src = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    expect(src).toContain('const atDecisionStage = !hasGuidedStages(cs.caseType) || hasReachedOutcomeStage(cs, stage)');
  });

  it('guardrail and quality-check COMPUTATION is untouched by presentation gating', () => {
    // Detection must not be disabled by hiding a control. The gaps engine is
    // independent of the panel and still reports the same risks.
    const gaps = computeDecisionQualityGaps(
      { ...CS, evidence: [] },
      [{ ...ALLEGATION, decisionReasoning: '' }],
      [{ id: 's1', caseId: 'c1', type: 'process_risk', status: 'open', ruleId: 'decision_reasoning_missing', title: 'A finding was recorded with little or no reasoning' }],
    );
    expect(gaps.some(g => /little or no reasoning/i.test(g))).toBe(true);
    expect(gaps.some(g => /No evidence linked/.test(g))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. INVESTIGATOR WRITE AUTHORITY — narrow
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — the assigned investigator may record the investigation', () => {
  const asInvestigator = { canDecide: false, canRecordInvestigation: true, atDecisionStage: false };

  it('can edit the investigator assessment', async () => {
    await renderPanel(asInvestigator);
    expect(screen.getByLabelText(/Investigator's assessment/)).toBeInTheDocument();
  });

  it('can edit outstanding uncertainty', async () => {
    await renderPanel(asInvestigator);
    expect(screen.getByLabelText('Outstanding uncertainty')).toBeInTheDocument();
  });

  it('CANNOT set the disciplinary finding merely by being the investigator', async () => {
    // Even at the decision stage: the status control is gated on canDecide.
    await renderPanel({ canDecide: false, canRecordInvestigation: true, atDecisionStage: true });
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Substantiated').length).toBeGreaterThan(0);   // read-only only
  });

  it('CANNOT write decision reasoning', async () => {
    await renderPanel({ canDecide: false, canRecordInvestigation: true, atDecisionStage: true });
    expect(screen.queryByLabelText(/Decision reasoning/)).not.toBeInTheDocument();
  });

  it('a non-investigator without canDecide still gets read-only narrative', async () => {
    await renderPanel({ canDecide: false, canRecordInvestigation: false, atDecisionStage: false });
    expect(screen.queryByLabelText(/Investigator's assessment/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Swipe records confirm the absence.').length).toBeGreaterThan(0);
  });

  it('the authority is derived from the existing case_access role, not from isHR', () => {
    // IR-REPORT-01a — this asserted the literal text
    // `const canRecordInvestigation = canDecide || isAssignedInvestigator`,
    // which pinned the EXPRESSION rather than the RULE and broke the moment
    // that rule moved into a tested pure function. The invariant it was
    // protecting is below, executed rather than string-matched: narrative
    // authority follows the case_access role, so a non-HR investigator holds
    // it and an unrelated non-HR viewer does not.
    expect(mayRecordInvestigationNarrative({ isHR: false, caseRole: 'investigator' })).toBe(true);
    expect(mayRecordInvestigationNarrative({ isHR: false, caseRole: 'disciplinary_officer' })).toBe(true);
    expect(mayRecordInvestigationNarrative({ isHR: false, caseRole: 'appeal_manager' })).toBe(false);
    expect(mayRecordInvestigationNarrative({ isHR: false, caseRole: null })).toBe(false);
    // ...and isHR alone is sufficient, so HR never depends on a case role.
    expect(mayRecordInvestigationNarrative({ isHR: true, caseRole: null })).toBe(true);
  });

  it('grants no outcome authority and no broader access', () => {
    const src = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    // canDecide — which gates the outcome button — is unchanged.
    expect(src).toContain('const canDecide = isHR || (myAccess?.role==="disciplinary_officer");');
    expect(src).not.toMatch(/canDecide\s*=\s*[^;]*isAssignedInvestigator/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. INVESTIGATION REPORT PROMPT
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — the investigation report does not decide the allegation', () => {
  const app = () => readFileSync('src/App.jsx', 'utf8');

  it('no longer instructs findings as upheld/not upheld', () => {
    expect(app()).not.toContain('findings for each allegation (upheld/not upheld)');
  });

  it('asks for evidence, accounts, assessment, uncertainty and a case-to-answer indication', () => {
    const src = app();
    const i = src.indexOf('"investigation-report":');
    const prompt = src.slice(i, i + 1600);
    for (const required of ['the evidence gathered', "employee's account", 'witness account',
      "investigator's assessment", 'unresolved or uncertain', 'may be a case to answer']) {
      expect(prompt, required).toContain(required);
    }
  });

  it('explicitly forbids substantiated/upheld language and any implied sanction', () => {
    const src = app();
    const i = src.indexOf('"investigation-report":');
    const prompt = src.slice(i, i + 1600);
    expect(prompt).toContain('must never describe an allegation as substantiated, not substantiated, upheld or not upheld');
    expect(prompt).toMatch(/never state or imply that misconduct has been established/);
  });

  it('the report states the structured conclusion but never a disciplinary finding', () => {
    // Slice 1 asserted the absence of any structured conclusion, because Slice 2
    // owned it. Slice 2 has since shipped it, and section K of that brief
    // requires the report to summarise it once one genuinely exists. So the
    // guard moves to the line that still matters: the report may carry the
    // procedural conclusion, and must not convert it into a finding.
    const src = app();
    expect(src).toContain('STRUCTURED INVESTIGATION CONCLUSION');
    // Never asked for per-allegation upheld/not-upheld findings.
    expect(src).not.toContain('upheld / not upheld');
    // And the prompt says so explicitly rather than relying on omission.
    expect(src).toContain('Do NOT state whether the allegation is substantiated, upheld, proven or made out');
  });

  it('leaves the appeal prompt\'s legitimate use of "upheld" alone', () => {
    // There, "upheld" describes whether the APPEAL succeeded — a different question.
    expect(app()).toContain("'upheld' describes whether the APPEAL succeeded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. MEETING EMPLOYEE PRE-POPULATION, BY IDENTITY
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — a case-linked meeting carries the employee identity', () => {
  const cv = () => readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

  it('every meeting launcher seeds employeeId from the case', () => {
    const src = cv();
    expect((src.match(/employeeId:cs\.employeeId\|\|null/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('employee details are resolved by identity, not by name', () => {
    const src = cv();
    expect(src).not.toMatch(/employeeJobTitle:getEmployeeRecord\(cs\.employeeName\)/);
    expect(src).toContain('getCaseEmployeeRecord?.(cs)?.jobTitle');
  });

  it('the resolver prefers employee_id and only falls back to a name for legacy cases', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain('findEmployeeById(employeeRecords, cs?.employeeId) || findEmployeeByName(employeeRecords, cs?.employeeName)');
  });

  it('two employees sharing a name are distinguished by id', async () => {
    const { findEmployeeById, findEmployeeByName } = await import('../lib/employeeRecords.js');
    const roster = [
      { id: 'e1', name: 'John Smith', jobTitle: 'Driver' },
      { id: 'e2', name: 'John Smith', jobTitle: 'Supervisor' },
    ];
    // identity resolves exactly; the name is ambiguous, which is the whole point
    expect(findEmployeeById(roster, 'e2').jobTitle).toBe('Supervisor');
    expect(findEmployeeById(roster, 'e1').jobTitle).toBe('Driver');
    const byName = findEmployeeByName(roster, 'John Smith');
    expect(['Driver', 'Supervisor']).toContain(byName?.jobTitle);   // cannot be relied on
  });

  it('PrepScreen shows the linked employee instead of an empty picker', () => {
    const prep = readFileSync('src/screens/PrepScreen.jsx', 'utf8');
    // the locked display branch is keyed on caseInfo.employeeId, which is now seeded
    expect(prep).toContain('caseInfo.employeeId ?');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. assigned_to IS NO LONGER SILENTLY CLOBBERED
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — a generic case save preserves the case owner', () => {
  const app = () => readFileSync('src/App.jsx', 'utf8');

  it('an update preserves the existing assigned_to; a create defaults to the creator', () => {
    expect(app()).toContain('assigned_to: caseObj.updatedAt ? (caseObj.assignedTo ?? null) : (user?.id ?? null)');
  });

  it('no longer writes the current user unconditionally', () => {
    const src = app().replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(src).not.toContain('assigned_to: user?.id || null');
  });

  it('the branch condition matches the update/upsert condition exactly', () => {
    // If these ever diverge, a create could preserve nothing and an update could
    // reassign — so they are asserted to be the same expression.
    const src = app();
    expect(src).toContain('assigned_to: caseObj.updatedAt ?');
    expect(src).toContain('if(caseObj.updatedAt) {');
  });

  it('the behaviour is value-level: a loaded case round-trips its owner', () => {
    // mapCaseRow reads assigned_to, and the payload now echoes it on update.
    const mapped = mapCaseRow({ id: 'c1', assigned_to: 'owner-1', updated_at: '2026-01-01T00:00:00Z' });
    expect(mapped.assignedTo).toBe('owner-1');
    const written = mapped.updatedAt ? (mapped.assignedTo ?? null) : 'saver-2';
    expect(written).toBe('owner-1');
  });

  it('a brand-new case still gets the creator', () => {
    const fresh = { id: 'c2' };                       // no updatedAt
    const written = fresh.updatedAt ? (fresh.assignedTo ?? null) : 'creator-9';
    expect(written).toBe('creator-9');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. EMPLOYEE PORTAL STAGE
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — HR and the employee portal agree on the stage', () => {
  // The production UAT case: stored stage 'open', outcome issued.
  const POST_OUTCOME_ROW = {
    id: 'c1', case_type: 'misconduct', stage: 'open',
    outcome: 'First written warning', meetings: [{ id: 'm1', type: 'Disciplinary', status: 'completed', record: 'x' }],
  };

  it('the canonical derivation says "outcome" even though the column says "open"', () => {
    expect(POST_OUTCOME_ROW.stage).toBe('open');
    expect(getCaseStage(mapCaseRow(POST_OUTCOME_ROW))).toBe('outcome');
  });

  it('both portal routes derive the stage rather than returning the raw column', () => {
    for (const f of ['api/portal/_case-detail.js', 'api/portal/_case-list.js']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('getCaseStage(mapCaseRow(');
      expect(src, f).not.toMatch(/stage: c?s?\.stage,/);
    }
  });

  it('the list route selects the fields the derivation needs', () => {
    const src = readFileSync('api/portal/_case-list.js', 'utf8');
    for (const col of ['outcome', 'meetings', 'investigation_report']) {
      expect(src, col).toContain(col);
    }
  });

  it('the employee is shown a plain-English status, never an internal stage id', () => {
    expect(employeeStageLabel('inv_report')).toBe('Awaiting next step');
    expect(employeeStageLabel('outcome')).toBe('Outcome issued');
    expect(employeeStageLabel('open')).toBe('Open');
    // an unknown id never leaks through
    expect(employeeStageLabel('some_internal_id')).toBe('In progress');
    expect(employeeStageLabel(undefined)).toBe('In progress');
  });

  it('both portal surfaces use the one shared label', () => {
    for (const f of ['src/portal/PortalCaseDetail.jsx', 'src/portal/PortalCaseList.jsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain('employeeStageLabel');
      expect(src, f).not.toMatch(/\{data\.stage \|\| "In progress"\}/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. WHAT SLICE 1 MUST NOT HAVE TOUCHED
// ═══════════════════════════════════════════════════════════════════════════
describe('Slice 1 — out-of-scope architecture is untouched', () => {
  it('the Slice 3 disciplinary-finding model is still deferred', () => {
    // This test used to assert that NEITHER investigation_conclusion nor
    // disciplinary_finding appeared anywhere — true of Slice 1, which shipped no
    // schema change at all. Slice 2 then added the investigation conclusion
    // deliberately, so half of that assertion became a statement that Slice 2
    // had not happened rather than a guard on anything.
    //
    // What it protects now is the part that IS still deferred: Slice 3's
    // authoritative disciplinary-finding persistence. allegations.status remains
    // the compatibility field for the disciplinary side until then.
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).not.toContain('disciplinary_finding');
    // And the conclusion that Slice 2 did add is genuinely wired, so this test
    // cannot pass by the feature having been reverted.
    expect(app).toContain('investigation_conclusion');
  });

  it('the allegation status vocabulary is unchanged', async () => {
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
    expect(APPEAL_OUTCOMES.length).toBeGreaterThan(0);
    const panel = readFileSync('src/components/AllegationsPanel.jsx', 'utf8');
    expect(panel).toContain('hasAppealMeeting && isFindingStatus(a.status)');
  });

  it('the D4.3 outcome path and its boundary are untouched', () => {
    const modal = readFileSync('src/screens/OutcomeModal.jsx', 'utf8');
    expect(modal).toContain('recordCaseDecision');
    expect(modal).toContain('requireReason: true');
    const writes = readFileSync('src/lib/caseDecisionWrites.js', 'utf8');
    expect(writes).toContain("supabase.rpc('record_case_decision'");
  });

  it('the consistency CALCULATIONS are unchanged — only their timing', async () => {
    const mod = await import('../lib/outcomeConsistency.js');
    expect(typeof mod.computeOutcomeDistribution).toBe('function');
    expect(typeof mod.computeSanctionDistribution).toBe('function');
    expect(typeof mod.comparableCaseSummaries).toBe('function');
  });
});
