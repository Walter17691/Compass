import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  CASE_ROLE,
  mayRecordInvestigationNarrative,
  mayRecordInvestigationConclusion,
  investigationAuthority,
} from '../lib/investigationAuthority.js';
import {
  INVESTIGATION_CHECKLIST_STEPS, seedInvestigationChecklist,
} from '../lib/investigationChecklist.js';
import { linkEvidenceToAllegation, EVIDENCE_STANCES } from '../lib/allegations.js';
import { INVESTIGATION_CONCLUSION_VALUES } from '../lib/investigationConclusion.js';
import { assessReportGeneration, REPORT_GENERATION } from '../lib/investigationReportDocument.js';
import { planHrReviewRequest, HR_REVIEW_OUTCOME } from '../lib/hrReviewIdempotency.js';
import { InvestigatorFindingsPanel } from '../components/InvestigatorFindingsPanel.jsx';
import { InvestigatorChecklistView } from '../components/InvestigatorChecklistView.jsx';
import { AllegationsPanel } from '../components/AllegationsPanel.jsx';

// ─────────────────────────────────────────────────────────────────────────
// IR-REPORT-01a — THE INVESTIGATOR FINDINGS WORKSPACE.
//
// Every test here exercises BEHAVIOUR — a rendered control, a captured write,
// a function's return. None asserts the source text of a component, because
// that is the test shape this project has repeatedly found worthless: it has
// matched its own explanatory comment, pinned a production bug in place, and
// passed while `if(false && ...)` sat in front of the thing it claimed to
// protect.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};

const issue = (over = {}) => ({
  id: 'alg_1', caseId: 'case_1',
  title: 'Missing stock count on 2 October 2026',
  description: 'Fact-finding into an unreconciled stock count.',
  period: '', peopleInvolved: '', status: 'unreviewed',
  employeeResponse: '', witnessEvidence: '',
  investigatorFinding: '', outstandingUncertainty: '',
  investigationConclusion: null, investigationConclusionReasoning: '',
  investigationConclusionBy: null, investigationConclusionAt: null,
  ...over,
});

const panelProps = (over = {}) => ({
  issues: [issue()],
  evidence: [],
  canRecordNarrative: true,
  canRecordConclusion: true,
  onPatchIssue: noop,
  onRecordConclusion: async () => true,
  onSetEvidenceStance: noop,
  onCreateIssue: noop,
  conclusionAuthors: [],
  fmtDate: d => d,
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A. who may record what — the two authorities', () => {
  it('HR holds both the narrative and the conclusion', () => {
    const a = investigationAuthority({ isHR: true, caseRole: null });
    expect(a.mayRecordNarrative).toBe(true);
    expect(a.mayRecordConclusion).toBe(true);
  });

  it('the assigned investigator holds both — the whole point of the slice', () => {
    const a = investigationAuthority({ isHR: false, caseRole: CASE_ROLE.INVESTIGATOR });
    expect(a.mayRecordNarrative).toBe(true);
    expect(a.mayRecordConclusion).toBe(true);
  });

  it('the disciplinary officer holds the narrative but NOT the conclusion', () => {
    // The database refuses this write with 42501 because the person who will
    // hear the case must not also decide whether there is a case to answer.
    const a = investigationAuthority({ isHR: false, caseRole: CASE_ROLE.DISCIPLINARY_OFFICER });
    expect(a.mayRecordNarrative).toBe(true);
    expect(a.mayRecordConclusion).toBe(false);
  });

  it('holds neither for any other case role, or none at all', () => {
    ['appeal_manager', 'notetaker', 'case_owner', 'approver', 'employee_manager', null, undefined, '']
      .forEach(caseRole => {
        expect(mayRecordInvestigationNarrative({ isHR: false, caseRole })).toBe(false);
        expect(mayRecordInvestigationConclusion({ isHR: false, caseRole })).toBe(false);
      });
  });

  it('never grants conclusion authority to someone without narrative authority', () => {
    // The invariant that matters is the RELATIONSHIP: conclusion authority is a
    // strict subset. A future edit that widened the conclusion rule in
    // isolation would fail here.
    [true, false].forEach(isHR => {
      [...Object.values(CASE_ROLE), 'appeal_manager', 'case_owner', null].forEach(caseRole => {
        const a = investigationAuthority({ isHR, caseRole });
        if (a.mayRecordConclusion) expect(a.mayRecordNarrative).toBe(true);
      });
    });
  });

  it('defaults to refusing when asked about nobody', () => {
    expect(mayRecordInvestigationNarrative()).toBe(false);
    expect(mayRecordInvestigationConclusion()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. the investigator can record their own work', () => {
  it('shows the three narrative fields the investigator owns', () => {
    render(<InvestigatorFindingsPanel {...panelProps()} />);
    expect(screen.getByLabelText('Your assessment of this issue')).toBeInTheDocument();
    expect(screen.getByLabelText('What remains uncertain')).toBeInTheDocument();
    expect(screen.getByLabelText('Witness evidence summary')).toBeInTheDocument();
  });

  it('persists the assessment to investigator_finding, on blur', async () => {
    const onPatchIssue = vi.fn();
    render(<InvestigatorFindingsPanel {...panelProps({ onPatchIssue })} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Your assessment of this issue'), 'Stock was counted twice.');
    expect(onPatchIssue).not.toHaveBeenCalled();  // not on every keystroke
    await user.tab();
    expect(onPatchIssue).toHaveBeenCalledWith('alg_1', { investigatorFinding: 'Stock was counted twice.' });
  });

  it('persists uncertainty to outstanding_uncertainty', async () => {
    const onPatchIssue = vi.fn();
    render(<InvestigatorFindingsPanel {...panelProps({ onPatchIssue })} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('What remains uncertain'), 'The 1 Oct count is unverified.');
    await user.tab();
    expect(onPatchIssue).toHaveBeenCalledWith('alg_1', { outstandingUncertainty: 'The 1 Oct count is unverified.' });
  });

  it('persists witness evidence to witness_evidence', async () => {
    const onPatchIssue = vi.fn();
    render(<InvestigatorFindingsPanel {...panelProps({ onPatchIssue })} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Witness evidence summary'), 'Two colleagues interviewed.');
    await user.tab();
    expect(onPatchIssue).toHaveBeenCalledWith('alg_1', { witnessEvidence: 'Two colleagues interviewed.' });
  });

  it('writes nothing and offers no input to a viewer without narrative authority', () => {
    render(<InvestigatorFindingsPanel {...panelProps({ canRecordNarrative: false, canRecordConclusion: false })} />);
    expect(screen.queryByLabelText('Your assessment of this issue')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
  });

  it('shows an already-recorded assessment rather than an empty box', () => {
    render(<InvestigatorFindingsPanel {...panelProps({ issues: [issue({ investigatorFinding: 'Established on CCTV.' })] })} />);
    expect(screen.getByLabelText('Your assessment of this issue')).toHaveValue('Established on CCTV.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. the conclusion control follows the database rule', () => {
  it('is offered to someone the database will accept', () => {
    render(<InvestigatorFindingsPanel {...panelProps()} />);
    expect(screen.getByRole('button', { name: 'Record investigation conclusion' })).toBeInTheDocument();
  });

  it('is NOT offered when only narrative authority is held — the disciplinary officer', () => {
    // The exact production mismatch: narrative yes, conclusion no. Before this
    // slice the control appeared and the save returned 42501.
    render(<InvestigatorFindingsPanel {...panelProps({ canRecordNarrative: true, canRecordConclusion: false })} />);
    expect(screen.queryByRole('button', { name: 'Record investigation conclusion' })).not.toBeInTheDocument();
    expect(screen.getByText('Not yet recorded')).toBeInTheDocument();
    // Narrative editing is still available — the authority was not collapsed.
    expect(screen.getByLabelText('Your assessment of this issue')).toBeInTheDocument();
  });

  it('records the conclusion against the issue, with its reasoning', async () => {
    const onRecordConclusion = vi.fn(async () => true);
    render(<InvestigatorFindingsPanel {...panelProps({ onRecordConclusion })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    await user.click(screen.getByRole('radio', { name: 'Case to answer' }));
    await user.type(screen.getByPlaceholderText(/what in the investigation leads to this conclusion/i),
      'Two accounts agree and the till log corroborates them.');
    await user.click(screen.getByRole('button', { name: 'Save conclusion' }));
    expect(onRecordConclusion).toHaveBeenCalledWith('alg_1', 'case_to_answer',
      'Two accounts agree and the till log corroborates them.');
  });

  it('cannot record a conclusion without reasoning', async () => {
    const onRecordConclusion = vi.fn(async () => true);
    render(<InvestigatorFindingsPanel {...panelProps({ onRecordConclusion })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record investigation conclusion' }));
    await user.click(screen.getByRole('radio', { name: 'No case to answer' }));
    expect(screen.getByRole('button', { name: 'Save conclusion' })).toBeDisabled();
    expect(onRecordConclusion).not.toHaveBeenCalled();
  });

  it('summarises a recorded conclusion on the collapsed row', () => {
    render(<InvestigatorFindingsPanel {...panelProps({
      issues: [issue({ investigationConclusion: 'further_investigation_required' }), issue({ id: 'alg_2', title: 'Second issue' })],
    })} />);
    expect(screen.getByText('Conclusion: Further investigation required')).toBeInTheDocument();
    expect(screen.getByText('Assessment not recorded')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. issues, not allegations', () => {
  it('records an issue with no employee identified and no description', async () => {
    const onCreateIssue = vi.fn();
    render(<InvestigatorFindingsPanel {...panelProps({ issues: [], onCreateIssue })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record an issue under investigation' }));
    await user.type(screen.getByLabelText('Issue under investigation'), 'Unreconciled stock count');
    await user.click(screen.getByRole('button', { name: 'Add issue' }));
    // Title only. Nothing asked for, or sent, about any individual.
    expect(onCreateIssue).toHaveBeenCalledWith({ title: 'Unreconciled stock count', description: '' });
  });

  it('will not create an issue with a blank title', async () => {
    const onCreateIssue = vi.fn();
    render(<InvestigatorFindingsPanel {...panelProps({ issues: [], onCreateIssue })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record an issue under investigation' }));
    await user.type(screen.getByLabelText('Issue under investigation'), '   ');
    expect(screen.getByRole('button', { name: 'Add issue' })).toBeDisabled();
    expect(onCreateIssue).not.toHaveBeenCalled();
  });

  it('never calls the issue an allegation in the workspace it owns', () => {
    const { container } = render(<InvestigatorFindingsPanel {...panelProps()} />);
    expect(container.textContent.toLowerCase()).not.toContain('allegation');
  });

  it('says "issues under investigation" when there are none', () => {
    render(<InvestigatorFindingsPanel {...panelProps({ issues: [] })} />);
    expect(screen.getByText(/No issues under investigation have been recorded/)).toBeInTheDocument();
  });

  it('offers no create affordance to a viewer who may not record', () => {
    render(<InvestigatorFindingsPanel {...panelProps({ issues: [], canRecordNarrative: false })} />);
    expect(screen.queryByRole('button', { name: 'Record an issue under investigation' })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. evidence classification is the investigator\'s, not a default', () => {
  const evidence = [
    { id: 'ev_1', name: 'Till log 2 Oct', allegationId: 'alg_1', stance: 'contradicts' },
    { id: 'ev_2', name: 'Rota 1-3 Oct' },
  ];

  it('links evidence without asserting that it supports the issue', async () => {
    const onSetEvidenceStance = vi.fn();
    render(<InvestigatorFindingsPanel {...panelProps({ evidence, onSetEvidenceStance })} />);
    await userEvent.setup().selectOptions(screen.getByLabelText('Link evidence to this issue'), 'ev_2');
    // No stance argument at all — the library's documented default decides.
    expect(onSetEvidenceStance).toHaveBeenCalledWith('alg_1', 'ev_2', undefined);
  });

  it('that unasserted default is neutral, decided in exactly one place', () => {
    const linked = linkEvidenceToAllegation([{ id: 'ev_2', name: 'Rota' }], 'ev_2', 'alg_1', undefined);
    expect(linked[0].stance).toBe('neutral');
    expect(linked[0].allegationId).toBe('alg_1');
  });

  it('lets the investigator classify supporting, contradictory and contextual evidence', async () => {
    const onSetEvidenceStance = vi.fn();
    render(<InvestigatorFindingsPanel {...panelProps({ evidence, onSetEvidenceStance })} />);
    const select = screen.getByLabelText('How this evidence relates to the issue: Till log 2 Oct');
    const user = userEvent.setup();
    for (const stance of ['supports', 'contradicts', 'context', 'neutral']) {
      await user.selectOptions(select, stance);
      expect(onSetEvidenceStance).toHaveBeenCalledWith('alg_1', 'ev_1', stance);
    }
    expect(EVIDENCE_STANCES.map(s => s.id)).toEqual(['supports', 'contradicts', 'context', 'neutral']);
  });

  it('shows an existing classification rather than overwriting it on render', () => {
    render(<InvestigatorFindingsPanel {...panelProps({ evidence })} />);
    expect(screen.getByLabelText('How this evidence relates to the issue: Till log 2 Oct')).toHaveValue('contradicts');
  });

  it('does not reclassify any other evidence item when one is linked', () => {
    const before = [
      { id: 'ev_1', name: 'A', allegationId: 'alg_1', stance: 'supports' },
      { id: 'ev_2', name: 'B', allegationId: 'alg_2', stance: 'contradicts' },
      { id: 'ev_3', name: 'C' },
    ];
    const after = linkEvidenceToAllegation(before, 'ev_3', 'alg_1', undefined);
    expect(after[0]).toEqual(before[0]);   // historical classification untouched
    expect(after[1]).toEqual(before[1]);
    expect(after[2].stance).toBe('neutral');
  });

  it('shows the classification read-only to a viewer who may not record', () => {
    render(<InvestigatorFindingsPanel {...panelProps({ evidence, canRecordNarrative: false })} />);
    expect(screen.queryByLabelText('How this evidence relates to the issue: Till log 2 Oct')).not.toBeInTheDocument();
    expect(screen.getByText('Contradicts')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. the workspace is reachable from the investigator\'s own screen', () => {
  const cs = { id: 'case_1', employeeName: 'Sam Testcase', evidence: [], meetings: [] };
  const viewProps = (over = {}) => ({
    cs,
    caseAllegations: [issue()],
    checklistTasks: INVESTIGATION_CHECKLIST_STEPS.map((s, i) => ({ id: `t${i}`, caseId: 'case_1', name: s.label, status: 'open' })),
    toggleCaseTaskDone: noop,
    openQuestions: [],
    setScreen: noop, screens: {}, fmtDate: d => d,
    canRecordNarrative: true, canRecordConclusion: true,
    onPatchIssue: noop, onRecordConclusion: async () => true,
    onSetEvidenceStance: noop, onCreateIssue: noop,
    ...over,
  });

  it('renders the findings workspace inside the investigator checklist', () => {
    render(<InvestigatorChecklistView {...viewProps()} />);
    expect(screen.getByLabelText('Your assessment of this issue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record investigation conclusion' })).toBeInTheDocument();
  });

  it('shows neutral step wording while the persisted task name is unchanged', () => {
    const toggleCaseTaskDone = vi.fn();
    render(<InvestigatorChecklistView {...viewProps({ toggleCaseTaskDone })} />);
    // What the investigator reads. Two matches for the first step is correct:
    // the step card AND the "Compass recommends next" line, which points at
    // the same step and must use the same wording.
    expect(screen.getAllByText('Review the issue(s) under investigation')).toHaveLength(2);
    expect(screen.getByText('Record your findings and conclusion')).toBeInTheDocument();
    // What is NOT on screen anywhere, because it asserts an accusation:
    expect(screen.queryByText('Review the allegation(s)')).not.toBeInTheDocument();
    expect(screen.queryByText('Complete the investigation')).not.toBeInTheDocument();
  });

  it('still matches checklist tasks by the persisted label, not the display wording', async () => {
    // The task carries the OLD label. If step matching had moved to
    // displayLabel, no task would be found and the toggle would be inert.
    const toggleCaseTaskDone = vi.fn();
    render(<InvestigatorChecklistView {...viewProps({ toggleCaseTaskDone })} />);
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Mark done' })[0]);
    expect(toggleCaseTaskDone).toHaveBeenCalledWith('t0');
  });

  it('still offers the submit action it always did', () => {
    const onSubmitInvestigation = vi.fn();
    render(<InvestigatorChecklistView {...viewProps({ onSubmitInvestigation })} />);
    expect(screen.getByRole('button', { name: 'Submit investigation' })).toBeInTheDocument();
  });

  it('keeps the existing meeting, witness and plan affordances', () => {
    render(<InvestigatorChecklistView {...viewProps({ onGeneratePlan: noop })} />);
    expect(screen.getByRole('button', { name: 'Start a witness interview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start the investigation meeting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate investigation plan' })).toBeInTheDocument();
  });

  it('says "issues under investigation" on the review step when there are none', () => {
    render(<InvestigatorChecklistView {...viewProps({ caseAllegations: [] })} />);
    expect(screen.getAllByText(/No issues under investigation have been recorded/).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. HR\'s own panel keeps the same two authorities', () => {
  const hrCs = { id: 'case_1', employeeName: 'Sam Testcase', evidence: [], meetings: [] };
  const hrProps = (over = {}) => ({
    cs: hrCs, allegations: [issue()], allAllegations: [issue()],
    createAllegation: noop, patchAllegation: noop, changeAllegationStatus: noop,
    deleteAllegation: noop, saveCases: noop, cases: [hrCs], confirmDialog: noop,
    showToast: noop, setReviewOutput: noop, setScreen: noop, screens: {},
    orgMembers: [], fmtDate: d => d, generateAppealReview: noop,
    recordAppealOutcome: noop, policies: [], generateConsistencyReview: noop,
    atDecisionStage: false,
    ...over,
  });
  const expand = async () => {
    const user = userEvent.setup();
    const matches = screen.getAllByText('Missing stock count on 2 October 2026');
    await user.click(matches[matches.length - 1]);
    return user;
  };

  it('lets the witness evidence summary be edited by someone with narrative authority', async () => {
    render(<AllegationsPanel {...hrProps()} canRecordInvestigation={true} />);
    await expand();
    expect(screen.getByLabelText('Witness evidence summary')).toBeInTheDocument();
  });

  it('makes the witness evidence summary READ-ONLY without narrative authority', async () => {
    // It previously had no gate at all: an appeal manager or case owner viewing
    // the case read-only could still rewrite it.
    render(<AllegationsPanel {...hrProps()} canDecide={false} canRecordInvestigation={false} />);
    await expand();
    expect(screen.queryByLabelText('Witness evidence summary')).not.toBeInTheDocument();
    expect(screen.getByText('Witness evidence summary')).toBeInTheDocument();
  });

  it('keys the conclusion control to the narrower authority, not the narrative one', async () => {
    render(<AllegationsPanel {...hrProps()} canRecordInvestigation={true} canConcludeInvestigation={false} />);
    await expand();
    expect(screen.queryByRole('button', { name: 'Record investigation conclusion' })).not.toBeInTheDocument();
  });

  it('offers the conclusion control when that narrower authority is held', async () => {
    render(<AllegationsPanel {...hrProps()} canRecordInvestigation={true} canConcludeInvestigation={true} />);
    await expand();
    expect(screen.getByRole('button', { name: 'Record investigation conclusion' })).toBeInTheDocument();
  });

  it('refuses the conclusion control when the caller never decided the authority', async () => {
    // Defaulting canConcludeInvestigation to canRecordInvestigation would have
    // quietly reinstated the mismatch. It defaults to false instead.
    render(<AllegationsPanel {...hrProps()} canRecordInvestigation={true} />);
    await expand();
    expect(screen.queryByRole('button', { name: 'Record investigation conclusion' })).not.toBeInTheDocument();
  });

  it('no longer stamps newly linked evidence as supporting the allegation', async () => {
    const saveCases = vi.fn();
    const evidence = [{ id: 'ev_9', name: 'Rota 1-3 Oct' }];
    render(<AllegationsPanel {...hrProps({ cs: { ...hrCs, evidence }, cases: [{ ...hrCs, evidence }], saveCases })} canRecordInvestigation={true} />);
    const user = await expand();
    await user.selectOptions(screen.getByLabelText('Link existing evidence'), 'ev_9');
    expect(saveCases).toHaveBeenCalled();
    const written = saveCases.mock.calls[0][0].find(c => c.id === 'case_1').evidence.find(e => e.id === 'ev_9');
    expect(written.allegationId).toBe('alg_1');
    expect(written.stance).toBe('neutral');
    expect(written.stance).not.toBe('supports');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('H. nothing outside this slice moved', () => {
  it('keeps every persisted checklist task name exactly as it was', () => {
    // These strings are case_task NAMES on live cases. Changing one orphans
    // every seeded task; finalizeInvestigationSubmission also looks the last
    // one up by this exact text.
    expect(INVESTIGATION_CHECKLIST_STEPS.map(s => s.label)).toEqual([
      'Review the allegation(s)',
      'Review the evidence',
      'Interview witnesses',
      'Interview the employee',
      'Review outstanding questions',
      'Complete the investigation',
      'Submit findings to HR',
    ]);
  });

  it('still seeds and dedupes the checklist by the persisted label', () => {
    const seeded = seedInvestigationChecklist([], 'case_1', 'Investigator');
    expect(seeded.filter(t => t.caseId === 'case_1')).toHaveLength(INVESTIGATION_CHECKLIST_STEPS.length);
    // Re-seeding adds nothing — the dedupe key is still `label`.
    expect(seedInvestigationChecklist(seeded, 'case_1', 'Investigator')).toHaveLength(seeded.length);
  });

  it('keeps the investigation conclusion vocabulary, and keeps "substantiated" out of it', () => {
    expect(INVESTIGATION_CONCLUSION_VALUES).toEqual(['case_to_answer', 'no_case_to_answer', 'further_investigation_required']);
    expect(JSON.stringify(INVESTIGATION_CONCLUSION_VALUES).toLowerCase()).not.toContain('substantiat');
  });

  it('leaves report generation assessment behaviour untouched', () => {
    expect(assessReportGeneration({ text: 'A report.' })).toMatchObject({ ok: true, reason: REPORT_GENERATION.OK });
    expect(assessReportGeneration({ text: '' })).toMatchObject({ ok: false, reason: REPORT_GENERATION.EMPTY });
    expect(assessReportGeneration({ text: 'Cut off', truncated: true }))
      .toMatchObject({ ok: false, reason: REPORT_GENERATION.TRUNCATED });
  });

  it('leaves HR review idempotency behaviour untouched', () => {
    const pending = [{ case_id: 'case_1', step: 'inv_report', status: 'pending' }];
    expect(planHrReviewRequest({ requests: pending, caseId: 'case_1', step: 'inv_report' }))
      .toMatchObject({ shouldInsert: false, outcome: HR_REVIEW_OUTCOME.REUSED });
    expect(planHrReviewRequest({ requests: [], caseId: 'case_1', step: 'inv_report' }))
      .toMatchObject({ shouldInsert: true, outcome: HR_REVIEW_OUTCOME.CREATED });
  });
});
