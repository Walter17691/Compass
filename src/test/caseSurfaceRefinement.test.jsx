import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import {
  REASON_CLASS, classifyNextStepReason, reasonForDefaultSurface,
  scheduledMeetingWhen, hasSubstantiveContext, caseInformationItems, hasCaseInformation,
} from '../lib/caseSurface.js';
import { isRiskExposureRelevant } from '../lib/tribunalExposureRelevance.js';
import { keyDateRelevance } from '../lib/caseKeyDates.js';
import { caseDetailSections, describeWhatIsHappening } from '../lib/caseViewSummary.js';
import { estimateExposure } from '../lib/tribunalEstimate.js';
import { CaseInformationPanel } from '../components/caseTabs/CaseInformationPanel.jsx';
import { TribunalExposurePanel } from '../components/caseTabs/TribunalExposurePanel.jsx';

// ─────────────────────────────────────────────────────────────────────────
// WAVE B.2 — the orphaned strip, and the bucket called "Checks and analysis".
//
// Two findings from Walter's production screenshots:
//
//   1. A full-width pale-purple band under the case header holding only
//      supporting text, left behind when B.1 removed the duplicate action.
//   2. "Checks and analysis" mixing the case description, the owner, an AI
//      risk rating, an AI readiness score, a tribunal compensation calculator
//      asking for the employee's weekly pay and age, a "Record a suspension"
//      action, and a role-assignment form.
//
// This file also inherits the exposure/key-date relevance coverage that lived
// in OverviewTab.test.jsx, now asserted directly against the pure predicates
// those tests were really about.
// ─────────────────────────────────────────────────────────────────────────

const read = f => readFileSync(f, 'utf8');
const caseViewSrc = read('src/screens/CaseViewScreen.jsx');
const noop = () => {};
const cs = { id: 'c1', employeeId: 'u-sam', caseType: 'misconduct', employeeName: 'Sam Employee' };
const intake = { stage: 'intake', currentRisk: null };

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.2 — the next-step reason is classified, not just rendered', () => {
  it('a real ambiguity is CLASS B and reaches the surface', () => {
    // Two meetings marked in progress: "Resume meeting" genuinely does not say
    // which one it opens. That is a fork the manager must see.
    const step = {
      action: 'resume_meeting',
      reason: 'This meeting is already under way. 2 meetings on this case are marked in progress — resuming opens the most recently started.',
    };
    expect(classifyNextStepReason(step)).toBe(REASON_CLASS.EXCEPTION);
    expect(reasonForDefaultSurface(step)).toBe(step.reason);
  });

  it('the screenshot\'s own reason is CLASS C and does not', () => {
    // "It does not need starting or resuming again" — with one action on the
    // screen, labelled "Review meeting record", beside a status chip reading
    // "Disciplinary record in review", there is nothing left to disambiguate.
    const step = {
      action: 'review_meeting_record',
      reason: 'This meeting has been held and its record has not been confirmed yet. It does not need starting or resuming again.',
    };
    expect(classifyNextStepReason(step)).toBe(REASON_CLASS.RATIONALE);
    expect(reasonForDefaultSurface(step)).toBeNull();
  });

  it('an unambiguous resume is also CLASS C — the label already says it', () => {
    const step = {
      action: 'resume_meeting',
      reason: 'This meeting is already under way. Resuming opens the same meeting rather than starting another.',
    };
    expect(classifyNextStepReason(step)).toBe(REASON_CLASS.RATIONALE);
  });

  it('a scheduled meeting\'s date is CLASS A — it is a fact, not a justification', () => {
    const step = {
      action: 'start_scheduled_meeting',
      reason: 'This meeting is already arranged for 12 Oct at 14:00. Starting it opens the same meeting that was scheduled.',
    };
    expect(classifyNextStepReason(step)).toBe(REASON_CLASS.STATE);
    expect(scheduledMeetingWhen(step)).toBe('12 Oct at 14:00');
    // Class A informs "What is happening" rather than getting its own surface.
    expect(reasonForDefaultSurface(step)).toBeNull();
  });

  it('ACAS rationale is CLASS C — valuable, but not permanent furniture', () => {
    const step = {
      action: 'disciplinary_invite',
      reason: 'ACAS Code: give the employee written notice of the allegations and evidence in good time before any hearing.',
    };
    expect(classifyNextStepReason(step)).toBe(REASON_CLASS.RATIONALE);
    expect(reasonForDefaultSurface(step)).toBeNull();
  });

  it('the reason DATA is never deleted — only its placement decided', () => {
    // The engine still produces every reason; this wave touched none of them.
    const engine = read('src/lib/nextStep.js');
    expect(engine).toMatch(/reason:"ACAS Code: give the employee written notice/);
    expect(engine).toMatch(/It does not need starting or resuming again/);
    // And the classifier reads the live object rather than a copied string table.
    expect(read('src/lib/caseSurface.js')).toContain('nextStep?.reason');
  });

  it('classifies nothing when there is nothing to classify', () => {
    expect(classifyNextStepReason(null)).toBeNull();
    expect(classifyNextStepReason({ action: 'x' })).toBeNull();
    expect(classifyNextStepReason({ action: 'x', reason: '   ' })).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.2 — the strip appears only when it carries something', () => {
  it('the screenshot state produces NO strip', () => {
    expect(hasSubstantiveContext({
      exceptionReason: null, hasSecondaryAction: false, hasInvestigatorProgress: false,
      hasNextActionSignal: false, showAppealInviteLogistics: false, showInlineDraft: false,
    })).toBe(false);
  });

  it('every genuinely substantive thing still opens it', () => {
    const cases = [
      { exceptionReason: 'two meetings in progress' },
      { hasSecondaryAction: true },
      { hasInvestigatorProgress: true },
      { hasNextActionSignal: true },
      { showAppealInviteLogistics: true },
      { showInlineDraft: true },
      { hasOpenChecklist: true },
    ];
    cases.forEach(c => expect(hasSubstantiveContext(c), JSON.stringify(c)).toBe(true));
  });

  it('defaults to closed rather than open', () => {
    expect(hasSubstantiveContext()).toBe(false);
  });

  it('the screen actually gates the strip on it', () => {
    expect(caseViewSrc).toContain('hasSubstantiveContext({');
    // and renders only the classified reason, once
    expect((caseViewSrc.match(/>\{exceptionReason\}</g) || []).length).toBe(1);
  });

  it('"Ask Compass for its take" no longer has a band under the header', () => {
    // It exists exactly once, inside Compass analysis.
    expect(caseViewSrc).not.toContain('Ask Compass for its take');
    // The RENDERED literal, not the phrase: the panel's own header comment
    // explains the move and mentions it, which is prose, not a surface.
    const panel = read('src/components/caseTabs/CompassAnalysisPanel.jsx');
    expect((panel.match(/: "Ask Compass for its take"\}/g) || []).length).toBe(1);
  });

  it('there is exactly ONE primary action, and the strip holds no copy of it', () => {
    // The header's primary wires handleNextStepAction through the action object.
    // A second copy would be a JSX onClick attribute — of which there must be none.
    expect(caseViewSrc).toContain('onClick: handleNextStepAction');
    expect((caseViewSrc.match(/onClick=\{handleNextStepAction\}/g) || []).length).toBe(0);
  });

  it('the readiness badge left the strip for Compass analysis', () => {
    expect(caseViewSrc).not.toContain('<CaseReadinessBadge');
    expect(read('src/components/caseTabs/CompassAnalysisPanel.jsx')).toContain('<CaseReadinessBadge');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.2 — "What is happening" keeps enough state', () => {
  const held = { id: 'm1', type: 'disciplinary', status: 'review_draft', record: 'x', endedAt: '2026-09-01T10:00:00Z' };

  it('says the record is awaiting review, so the removed strip is not missed', () => {
    const text = describeWhatIsHappening({ cs, stage: 'disciplinary', allegations: [], meetings: [held] });
    expect(text).toMatch(/awaiting review/i);
    expect(text).toMatch(/disciplinary stage/i);
  });

  it('absorbs the scheduled date — the one genuinely new fact the reason carried', () => {
    const scheduled = { id: 'm2', type: 'disciplinary', status: 'scheduled', schedule: { date: '2026-10-12', time: '14:00' } };
    const text = describeWhatIsHappening({
      cs, stage: 'disciplinary', allegations: [], meetings: [scheduled], scheduledWhen: '12 Oct at 14:00',
    });
    expect(text).toContain('A meeting is scheduled for 12 Oct at 14:00.');
  });

  it('stays short and never borrows button language', () => {
    const text = describeWhatIsHappening({ cs, stage: 'disciplinary', allegations: [], meetings: [held] });
    expect(text.split('. ').length).toBeLessThanOrEqual(3);
    expect(text).not.toMatch(/Review meeting record|Click|→/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.2 — "Checks and analysis" is gone, not re-wrapped', () => {
  it('the bucket component no longer exists', () => {
    expect(existsSync('src/components/caseTabs/OverviewTab.jsx')).toBe(false);
    expect(caseViewSrc).not.toContain("from '../components/caseTabs/OverviewTab'");
  });

  it('it is not in the section list, or even in the section vocabulary', () => {
    const ids = caseDetailSections({ canSeeAnalysis: true }).map(s => s.id);
    expect(ids).not.toContain('overview');
    // A stale deep link cannot resurrect it either.
    expect(read('src/lib/caseViewSummary.js')).not.toMatch(/overview: "Checks and analysis"/);
  });

  it('was not replaced by another catch-all', () => {
    const labels = caseDetailSections({ canSeeAnalysis: true, hasInformation: true, showExposure: true }).map(s => s.label);
    [/checks/i, /misc/i, /other/i, /dashboard/i, /more detail/i].forEach(
      re => expect(labels.some(l => re.test(l)), String(re)).toBe(false)
    );
  });

  it('no new top-level AI surface was invented', () => {
    ['Compass insight', 'Compass recommendation', 'Compass score', 'Risk score'].forEach(
      bad => expect(caseViewSrc, bad).not.toContain(bad)
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.2 — each child got a coherent home', () => {
  it('Case information holds the basic facts', () => {
    const items = caseInformationItems(
      { ...cs, description: 'Allegation of misuse of company equipment.', referredBy: 'A. Rivera' },
      { repeatCount: 2 }
    );
    expect(items.map(i => i.id)).toEqual(['description', 'referredBy', 'repeat']);
  });

  it('Owner is NOT repeated — it is already in the header', () => {
    const items = caseInformationItems({ ...cs, manager: 'UAT - HR Manager' }, { repeatCount: 1 });
    expect(items.map(i => i.id)).not.toContain('owner');
    expect(read('src/components/caseTabs/CaseInformationPanel.jsx')).not.toMatch(/>Owner</);
    // Exactly one visible "Owner" placement remains, the header's.
    expect((caseViewSrc.match(/Owner: /g) || []).length).toBeLessThanOrEqual(1);
  });

  it('the Risk rating moved to Compass analysis, because that is what it is', () => {
    // getCurrentRisk reads the most recent meeting's AI riskScore.rating.
    expect(read('src/lib/caseStage.js')).toMatch(/riskScore\?\.rating/);
    expect(read('src/components/caseTabs/CompassAnalysisPanel.jsx')).toContain('Risk rating');
    expect(read('src/components/caseTabs/CaseInformationPanel.jsx')).not.toContain('Risk');
  });

  it('a blank description is never prominent, and the section is absent entirely', () => {
    expect(hasCaseInformation(cs, { repeatCount: 1 })).toBe(false);
    const ids = caseDetailSections({ canSeeAnalysis: true, hasInformation: false }).map(s => s.id);
    expect(ids).not.toContain('information');
    // The main surface says nothing about a missing description.
    expect(caseViewSrc).not.toContain('No description recorded');
    // And the screen derives the flag rather than hard-coding it open — a literal
    // `hasInformation: true` would put an all-but-empty section on every case.
    expect(caseViewSrc).toContain('hasInformation: hasCaseInformation(cs, { repeatCount })');
    expect(caseViewSrc).not.toMatch(/hasInformation:\s*true/);
  });

  it('but a restrained empty state IS allowed where case information is being read', () => {
    render(<CaseInformationPanel cs={cs} cases={[cs]} saveCases={noop} repeatCount={1} dateRelevance={{}} />);
    expect(screen.getByText('No description recorded.')).toBeInTheDocument();
  });

  it('Case roles sits with Participants, and is not called analysis', () => {
    expect(caseViewSrc).toMatch(/people: \(\s*<>/);
    expect(caseViewSrc).toContain('<CaseRolesPanel');
    // Same server-side authority as before — no client gate added or removed.
    expect(caseViewSrc).not.toMatch(/isHR\s*&&\s*<CaseRolesPanel/);
  });

  it('"Record a suspension" is an action, in More actions, and never prominent', () => {
    expect(caseViewSrc).toMatch(/label: "Record a suspension"/);
    expect(caseViewSrc).not.toMatch(/primary[^\n]*Record a suspension/);
    // It opens Case information with the field revealed, rather than living
    // under a tribunal calculator.
    expect(caseViewSrc).toContain('setSuspensionRevealed(true); setActiveTab("information")');
    // Asserts the GATE, not the label: `false && { label: "Record a suspension" }`
    // still contains the label while removing the action entirely.
    expect(caseViewSrc).toContain('!dateRelevance.suspensionReviewDate && stage!=="closed" && {');
  });

  it('process blockers are on the main surface, not two clicks inside a bucket', () => {
    expect(caseViewSrc).toContain('<ApprovalsPanel');
    expect(caseViewSrc).toContain('<HrReviewGatePanel');
    expect(caseViewSrc).toContain('<AskHrPanel');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.2 — the tribunal exposure estimator', () => {
  it('is off the normal case surface: its own section, last, and only when relevant', () => {
    const sections = caseDetailSections({ canSeeAnalysis: true, showExposure: true });
    expect(sections[sections.length - 1].id).toBe('exposure');
    expect(caseDetailSections({ canSeeAnalysis: true, showExposure: false }).map(s => s.id))
      .not.toContain('exposure');
  });

  it('nothing in the product consumes its output — it drives no workflow', () => {
    // If this ever changes, this assertion is the place that should fail first.
    const readers = ['src/lib/nextStep.js', 'src/lib/caseStage.js', 'src/lib/caseRisk.js', 'src/lib/caseSignals.js']
      .filter(f => existsSync(f))
      .filter(f => /estimateExposure|estimatedWeeklyPay|estimatedAgeAtDismissal/.test(read(f)));
    expect(readers).toEqual([]);
  });

  it('is deterministic — no AI, no network', () => {
    const src = read('src/lib/tribunalEstimate.js');
    ['fetch(', 'anthropic', 'claude', '/api/'].forEach(bad => expect(src.toLowerCase()).not.toContain(bad));
    const a = estimateExposure({ weeklyPay: 500, ageAtDismissal: 35, yearsService: 6, caseType: 'misconduct' });
    const b = estimateExposure({ weeklyPay: 500, ageAtDismissal: 35, yearsService: 6, caseType: 'misconduct' });
    expect(a).toEqual(b);
  });

  it('the assumed age is an assumption of the CALCULATION, never an employee fact', () => {
    const withAge = estimateExposure({ weeklyPay: 500, ageAtDismissal: 30, yearsService: 6, caseType: 'misconduct' });
    const without = estimateExposure({ weeklyPay: 500, yearsService: 6, caseType: 'misconduct' });
    // The fallback IS used, and is flagged.
    expect(without.ageAssumed).toBe(true);
    expect(withAge.ageAssumed).toBe(false);
    expect(without.basicAward).toBe(withAge.basicAward);   // fallback is the 22-40 mid-point, 30
    // Nothing is persisted, so nothing assumed can be disclosed as fact.
    expect(Object.keys(without)).not.toContain('estimatedAgeAtDismissal');
  });

  it('the truncated "Assumes 22" placeholder is gone', () => {
    const panel = read('src/components/caseTabs/TribunalExposurePanel.jsx');
    // The old 110px input clipped "Assumes 22-40" to the words "Assumes 22",
    // which reads as Compass asserting the employee's age.
    expect(panel).not.toContain('placeholder="Assumes 22-40"');
    expect(panel).not.toMatch(/Assumes 22"/);
    const csWithPay = { ...cs, estimatedWeeklyPay: 500 };
    render(<TribunalExposurePanel cs={csWithPay} cases={[csWithPay]} saveCases={noop} currentRisk={null} yearsService={6}/>);
    expect(screen.getByText(/assumes the 22–40 statutory band/i)).toBeInTheDocument();
    expect(screen.getByText(/not claiming the employee/i)).toBeInTheDocument();
  });

  it('weekly pay stays with the specialist tool, not general case management', () => {
    expect(caseViewSrc).not.toContain('Weekly pay');
    expect(read('src/components/caseTabs/CaseInformationPanel.jsx')).not.toContain('Weekly pay');
    expect(read('src/components/caseTabs/TribunalExposurePanel.jsx')).toContain('Weekly pay (£, gross)');
  });

  it('says plainly that it is not legal advice', () => {
    expect(read('src/components/caseTabs/TribunalExposurePanel.jsx')).toMatch(/not legal advice/i);
  });

  it('does not broaden who can see it — same gate, no role change', () => {
    // It was ungated beyond case access before, and still is: relocation only.
    expect(caseViewSrc).not.toMatch(/isHR\s*&&\s*<TribunalExposurePanel/);
    expect(caseViewSrc).toContain('showExposure: showRiskExposure');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Inherited from OverviewTab.test.jsx — the relevance rules themselves, now
// asserted against the pure predicates rather than through a rendered bucket.
describe('Wave B.2 — exposure relevance (moved verbatim, behaviour unchanged)', () => {
  it('an ordinary misconduct case at intake shows nothing', () => {
    expect(isRiskExposureRelevant(cs, intake, 'misconduct')).toBe(false);
  });

  it('once real investigative work has started, it applies', () => {
    expect(isRiskExposureRelevant(cs, { ...intake, stage: 'investigation' }, 'misconduct')).toBe(true);
  });

  it('redundancy and appeal apply from day one — no stage gate', () => {
    expect(isRiskExposureRelevant(cs, intake, 'redundancy')).toBe(true);
    expect(isRiskExposureRelevant(cs, intake, 'appeal')).toBe(true);
  });

  it('discrimination and whistleblowing grievances apply; an ordinary grievance does not', () => {
    expect(isRiskExposureRelevant({ ...cs, caseType: 'discrimination' }, intake, 'grievance')).toBe(true);
    expect(isRiskExposureRelevant({ ...cs, caseType: 'whistleblowing' }, intake, 'grievance')).toBe(true);
    expect(isRiskExposureRelevant({ ...cs, caseType: 'grievance' }, intake, 'grievance')).toBe(false);
  });

  it('a figure someone already entered is never hidden', () => {
    expect(isRiskExposureRelevant({ ...cs, estimatedWeeklyPay: 500 }, intake, 'misconduct')).toBe(true);
    expect(isRiskExposureRelevant({ ...cs, estimatedAgeAtDismissal: 44 }, intake, 'misconduct')).toBe(true);
  });

  it('risk genuinely assessed above LOW makes it relevant regardless of type', () => {
    expect(isRiskExposureRelevant(cs, { stage: 'intake', currentRisk: 'HIGH' }, 'misconduct')).toBe(true);
    expect(isRiskExposureRelevant(cs, { stage: 'intake', currentRisk: 'LOW' }, 'misconduct')).toBe(false);
  });
});

describe('Wave B.2 — key-date relevance (moved verbatim, behaviour unchanged)', () => {
  it('an ordinary misconduct case at intake has no key dates', () => {
    const rel = keyDateRelevance(cs, intake, [], 'misconduct');
    expect(Object.values(rel).some(Boolean)).toBe(false);
  });

  it('long-term sickness brings the health dates', () => {
    const rel = keyDateRelevance(cs, intake, [], 'long_term_sickness');
    expect(rel.fitNoteEndDate).toBe(true);
    expect(rel.ohReferralDate).toBe(true);
  });

  it('real wellbeing notes for this employee bring them to a misconduct case too', () => {
    const rel = keyDateRelevance(cs, intake, [{ employeeId: 'u-sam' }], 'misconduct');
    expect(rel.fitNoteEndDate).toBe(true);
  });

  it('a value already entered keeps its field visible', () => {
    const rel = keyDateRelevance({ ...cs, suspensionReviewDate: '2026-03-01' }, intake, [], 'misconduct');
    expect(rel.suspensionReviewDate).toBe(true);
  });

  it('key dates render under Case information with working labels', () => {
    const sick = { ...cs, caseType: 'long_term_sickness', ohReferralDate: '2026-01-01' };
    render(<CaseInformationPanel cs={sick} cases={[sick]} saveCases={noop} repeatCount={1}
      dateRelevance={keyDateRelevance(sick, intake, [], 'long_term_sickness')} />);
    expect(screen.getByLabelText('Fit note expires')).toBeInTheDocument();
    expect(screen.getByLabelText('OH referral date')).toBeInTheDocument();
    expect(screen.getByLabelText('OH report received')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('Wave B.2 — nothing approved was disturbed', () => {
  it('Guardrails are untouched: conditional, prominent, and not analysis', () => {
    expect(caseViewSrc).toContain('openSignalsForCase(caseSignals, cs.id, "process_risk")');
    expect(caseViewSrc).toContain('{openGuardrails.length > 0 && (');
    expect(caseViewSrc).toContain('signals={openGuardrails}');
    // Guardrails are NOT inside Compass analysis.
    expect(read('src/components/caseTabs/CompassAnalysisPanel.jsx')).not.toContain('GuardrailsPanel');
  });

  it('the B.1 sidebar hierarchy is frozen', () => {
    const sidebar = read('src/components/AppSidebar.jsx');
    expect(sidebar).toMatch(/SCREENS\.CASES[^}]*indent:true/);
    expect(sidebar).toMatch(/SCREENS\.ARCHIVE[^}]*indent:true/);
    expect(sidebar).not.toMatch(/SCREENS\.PEOPLE[^}]*indent:true/);
  });

  it('one primary action, the case record, and progressive details all survive', () => {
    expect((caseViewSrc.match(/>Case record</g) || []).length).toBe(1);
    expect(caseViewSrc).toContain('caseRecordEntries(cs, caseAllegations');
    expect(caseViewSrc).toContain('aria-expanded={open}');
    expect(caseViewSrc).toContain('transform:open?"rotate(90deg)":"none"');
  });

  it('Wave A and Wave 0 are still intact', () => {
    expect(read('src/lib/employeeFileActions.js')).toContain('label: "Start conversation"');
    expect(read('src/lib/employeeFile.js')).toContain('recentActivity: activityEntries.slice(0, 5)');
    expect(read('src/lib/dsarCompile.js')).toContain('subjectCases.map(disclosableCase)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §32 — the rendered surface, across the case states the brief named.
import { CaseViewScreen } from '../screens/CaseViewScreen.jsx';

const renderCase = (caseOverrides = {}, { nextStep = null, stage = 'disciplinary', extraShell = {} } = {}) => {
  const theCase = {
    id: 'c1', employeeName: 'Sam Employee', manager: 'Alex Manager',
    meetings: [], evidence: [], confidential: false, caseType: 'misconduct', ...caseOverrides,
  };
  const shell = {
    cases: [theCase], activeCaseId: 'c1', setScreen: noop, confirmDialog: noop,
    getCaseStage: () => stage, getNextStep: () => nextStep, fmtDate: d => d || '',
    getProceedingTitle: () => 'Disciplinary Investigation',
    getCaseStatus: () => ({ label: 'Disciplinary record in review', color: '#000', bg: '#fff' }),
    setMeetingSetup: noop, getEmployeeRecord: () => null, orgMembers: [], setCaseInfo: noop,
    saveCases: noop, setReviewOutput: noop, setMeetingType: noop, showToast: noop,
    currentUser: { user_id: 'u1', name: 'Test User' }, setLetterOutput: noop, handleLetter: noop,
    isHR: true, caseAccess: [], allegations: [], auditLog: [], caseTasks: [], createCaseTask: noop,
    caseSignals: [], changeSignalStatus: noop, toggleCaseTaskDone: noop, setShowHandoffModal: noop,
    setShowAppealOfficerModal: noop, generateInvestigationPlan: noop, investigationPlanLoading: {},
    ...extraShell,
  };
  const header = {
    showAppealInput: {}, setShowAppealInput: noop, appealText: {}, setAppealText: noop,
    recordAppealReceived: async () => true, setShowReassignModal: noop, setShowAssignInvestigatorModal: noop,
    setShowOutcomeModal: noop, setShowSignModal: noop, letterOutput: '', aiProcessing: false, aiError: null,
    toggleNextStepDone: noop, concludingInvestigation: false, attemptSubmitInvestigation: noop,
    openEscalateModal: noop, openHrInterventionModal: noop, generateNextBestAction: noop,
    nextActionLoading: {}, changesSinceView: [], changesSummary: '', changesSummaryLoading: false,
  };
  const overview = {
    linkSignalToAllegation: noop, requestOverrideReason: noop, requestPolicyDeviationReason: noop,
    assignCaseRole: noop, hrReviewRequests: [], respondToReview: noop, resolveInvestigationReview: noop,
    wellbeingNotes: [], dueSoon: [], processTemplates: [], unansweredCovered: [], unansweredLoading: false,
    generateUnansweredQuestions: noop, generateInconsistencies: noop, inconsistencyLoading: {},
    ohReportFindings: [], ohReportAnalysisLoading: false, onAnalyseOhReport: noop, onAcceptOhFinding: noop,
    onDismissOhFinding: noop, onSendForSignature: noop, automationLevels: {}, onResendReminder: noop,
  };
  return render(<CaseViewScreen
    shell={shell} header={header} overview={overview} initialTab={null} clearInitialTab={noop} deleteCaseTask={noop}
    timeline={{ toggleTimelineExclude: noop, editTimelineDescription: noop, generateTimelineRelevance: noop, timelineRelevanceLoading: {}, loadJsPDF: noop }}
    allegationsTab={{ createAllegation: noop, patchAllegation: noop, changeAllegationStatus: noop, deleteAllegation: noop,
      evidenceSuggestions: {}, evidenceSuggestionsLoading: {}, generateEvidenceSuggestions: noop, acceptEvidenceSuggestion: noop,
      rejectEvidenceSuggestion: noop, generateAppealReview: noop, appealReviewLoading: false, recordAppealOutcome: noop,
      policies: [], consistencyReview: {}, consistencyReviewLoading: false, generateConsistencyReview: noop }}
    meetingsTab={{ activeCaseStage: null, setActiveCaseStage: noop, onAcceptSavedSuggestion: noop, onDismissSavedSuggestion: noop }}
    evidenceTab={{ documentFindings: {}, documentAnalysisLoading: {}, analyseEvidenceDocument: noop, acceptDocumentFinding: noop, dismissDocumentFinding: noop, removeEvidence: noop }}
    documentsTab={{ onGenerateHearingPack: noop, hearingPackGenerating: {}, onDraftCorrespondence: noop }}
    themesTab={{ organisationThemes: [], caseThemes: [], themeSuggestions: {}, themeSuggestionLoading: {}, onSuggestThemes: noop,
      onConfirmThemeSuggestion: noop, onDismissThemeSuggestion: noop, onAssignExistingTheme: noop, onRemoveTheme: noop }}
    aiTab={{ caseChatHistory: {}, caseChatInput: '', setCaseChatInput: noop, caseChatProcessing: false, sendCaseChat: noop,
      caseOverview: {}, caseOverviewLoading: {}, generateCaseOverview: noop, caseOverviewSources: {} }}
  />);
};

const REVIEW_DRAFT_STEP = {
  label: 'Review meeting record', action: 'review_meeting_record', primary: true, reviewMeetingId: 'm1',
  reason: 'This meeting has been held and its record has not been confirmed yet. It does not need starting or resuming again.',
};

describe('Wave B.2 §32 — the rendered surface, by case state', () => {
  it('review_draft: ONE action, no orphaned explanation, no Ask Compass band', () => {
    const meeting = { id: 'm1', type: 'disciplinary', status: 'review_draft', record: 'x', endedAt: '2026-09-01T10:00:00Z' };
    renderCase({ meetings: [meeting] }, { nextStep: REVIEW_DRAFT_STEP });

    // Walter's exact screenshot text is gone from the surface.
    expect(screen.queryByText(/does not need starting or resuming again/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Ask Compass for its take')).not.toBeInTheDocument();
    // The action appears exactly once.
    expect(screen.getAllByRole('button', { name: /Review meeting record/i })).toHaveLength(1);
    // And the state is still explained.
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
  });

  it('review_draft: the case record is reachable without opening anything', () => {
    const meeting = { id: 'm1', type: 'disciplinary', status: 'review_draft', record: 'x', endedAt: '2026-09-01T10:00:00Z' };
    renderCase({ meetings: [meeting] }, { nextStep: REVIEW_DRAFT_STEP });
    expect(screen.getByText('Case record')).toBeInTheDocument();
    // "Checks and analysis" is not among the sections.
    expect(screen.queryByRole('button', { name: /Checks and analysis/ })).not.toBeInTheDocument();
  });

  it('review_draft: no blank description, no weekly pay, no owner repeated', () => {
    const meeting = { id: 'm1', type: 'disciplinary', status: 'review_draft', record: 'x', endedAt: '2026-09-01T10:00:00Z' };
    renderCase({ meetings: [meeting] }, { nextStep: REVIEW_DRAFT_STEP });
    expect(screen.queryByText('No description recorded.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Weekly pay/)).not.toBeInTheDocument();
    expect(screen.queryByText('Risk & tribunal exposure')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Record a suspension')).not.toBeInTheDocument();
  });

  it('scheduled: the arranged date is stated once, in What is happening', () => {
    const scheduled = { id: 'm2', type: 'disciplinary', status: 'scheduled', schedule: { date: '2026-10-12', time: '14:00' } };
    renderCase({ meetings: [scheduled] }, { nextStep: {
      label: 'Start scheduled meeting', action: 'start_scheduled_meeting', primary: true, scheduledMeetingId: 'm2',
      reason: 'This meeting is already arranged for 2026-10-12 at 14:00. Starting it opens the same meeting that was scheduled.',
    }});
    expect(screen.getByText(/A meeting is scheduled for 2026-10-12 at 14:00\./)).toBeInTheDocument();
    // The reason itself is not repeated underneath.
    expect(screen.queryByText(/Starting it opens the same meeting/)).not.toBeInTheDocument();
  });

  it('in_progress with a genuine ambiguity: the warning DOES show', () => {
    const live = { id: 'm3', type: 'disciplinary', status: 'in_progress', startedAt: '2026-09-01T09:00:00Z' };
    renderCase({ meetings: [live] }, { nextStep: {
      label: 'Resume meeting', action: 'resume_meeting', primary: true, resumeMeetingId: 'm3',
      reason: 'This meeting is already under way. 2 meetings on this case are marked in progress — resuming opens the most recently started.',
    }});
    expect(screen.getByText(/2 meetings on this case are marked in progress/)).toBeInTheDocument();
  });

  it('outcome due: a secondary choice keeps the strip, because it is a real alternative', () => {
    renderCase({}, { stage: 'outcome', nextStep: {
      label: 'Draft outcome letter', action: 'outcome_letter', primary: true,
      reason: 'ACAS Code: confirm the decision in writing, normally within 5 working days of the hearing.',
      secondary: { label: 'No case to answer — close', action: 'close_no_case' },
    }});
    expect(screen.getByRole('button', { name: /No case to answer/ })).toBeInTheDocument();
    // The ACAS rationale still does not appear.
    expect(screen.queryByText(/within 5 working days/)).not.toBeInTheDocument();
  });

  it('appeal: state is explained without a next-step strip of explanation', () => {
    renderCase({}, { stage: 'appeal', nextStep: {
      label: 'Start appeal hearing', action: 'start_appeal_meeting', primary: true,
      reason: 'An appeal has been raised but not yet heard.',
    }});
    expect(screen.getByText(/An appeal is in progress\./)).toBeInTheDocument();
    expect(screen.queryByText('An appeal has been raised but not yet heard.')).not.toBeInTheDocument();
  });

  it('closed: still no strip, and no workflow action', () => {
    renderCase({ outcome: 'First written warning' }, { stage: 'closed', nextStep: null });
    expect(screen.getByText(/Closed\. The outcome was First written warning\./)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §8 — Guardrails, RENDERED.
//
// This suite exists because Wave B, B.1 and B.2 all asserted guardrail
// behaviour against the SOURCE TEXT of CaseViewScreen and never once rendered a
// case that had an open guardrail. GuardrailsPanel was used in JSX but never
// imported, so the whole Case View threw "GuardrailsPanel is not defined" for
// every case with an open process_risk signal — 252 production cases, 8.5%.
//
// Wave B.1 is what exposed it: before B.1 the gate filtered on `sig.kind`,
// which case_signals does not have, so the block never rendered and the missing
// import never ran. Fixing the gate turned a silently-dead block into a crash.
// `no-undef` is not enabled in this repo's eslint config and Vite resolves JSX
// identifiers at runtime, so neither lint nor build could catch it. Only
// rendering could.
const GUARDRAIL = {
  id: 'sig-1', caseId: 'c1', type: 'process_risk', status: 'open',
  title: 'No investigation meeting before the disciplinary hearing',
  reasoning: 'ACAS expects fact-finding before a hearing is arranged.',
  sourceRefs: [{ kind: 'policy', id: 'p1', label: 'Disciplinary Policy', clauseHeading: '4.2', clauseText: 'Investigate before any hearing.' }],
};

describe('Wave B.2 §8 — Guardrails render, exactly once, on the main surface', () => {
  it('a case with an open guardrail RENDERS instead of throwing', () => {
    renderCase({}, { extraShell: { caseSignals: [GUARDRAIL] } });
    expect(screen.getByText('Procedural guardrails')).toBeInTheDocument();
    expect(screen.getByText(GUARDRAIL.title)).toBeInTheDocument();
  });

  it('it appears exactly ONCE — not duplicated into Compass analysis', () => {
    renderCase({}, { extraShell: { caseSignals: [GUARDRAIL] } });
    expect(screen.getAllByText('Procedural guardrails')).toHaveLength(1);
    expect(screen.getAllByText(GUARDRAIL.title)).toHaveLength(1);
  });

  it('its policy citation survives', () => {
    renderCase({}, { extraShell: { caseSignals: [GUARDRAIL] } });
    expect(screen.getByText(/Disciplinary Policy/)).toBeInTheDocument();
  });

  it('a case with NO open guardrail shows no empty panel', () => {
    renderCase({}, { extraShell: { caseSignals: [] } });
    expect(screen.queryByText('Procedural guardrails')).not.toBeInTheDocument();
  });

  it('a RESOLVED guardrail is not shown — status is honoured, not just type', () => {
    renderCase({}, { extraShell: { caseSignals: [{ ...GUARDRAIL, status: 'resolved' }] } });
    expect(screen.queryByText('Procedural guardrails')).not.toBeInTheDocument();
  });

  it('a signal of another type does not leak into guardrails', () => {
    renderCase({}, { extraShell: { caseSignals: [{ ...GUARDRAIL, type: 'next_action' }] } });
    expect(screen.queryByText('Procedural guardrails')).not.toBeInTheDocument();
  });

  it('every JSX component the screen renders is actually in scope', () => {
    // The generalised form of the defect: a component used but never imported.
    const src = read('src/screens/CaseViewScreen.jsx');
    const used = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g)].map(m => m[1]));
    const imported = new Set();
    for (const m of src.matchAll(/import\s+(?:(\w+)\s*,\s*)?\{([^}]*)\}\s*from/g)) {
      if (m[1]) imported.add(m[1]);
      m[2].split(',').forEach(p => { const n = p.trim().split(' as ').pop().trim(); if (n) imported.add(n); });
    }
    for (const m of src.matchAll(/import\s+([A-Z][A-Za-z0-9_]*)\s+from/g)) imported.add(m[1]);
    const declared = new Set([...src.matchAll(/(?:function|const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1]));
    const missing = [...used].filter(n => !imported.has(n) && !declared.has(n) && n !== 'Fragment' && n !== 'React');
    expect(missing).toEqual([]);
  });
});
