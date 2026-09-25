import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { HomeMeetingScreen } from '../screens/HomeMeetingScreen.jsx';
import { invitationGuidance, noticeRequirement } from '../lib/invitationGuidance.js';
import {
  caseRequirement, caseRequirementNotice, isStandaloneIntended, CASE_REQUIREMENT,
} from '../lib/meetingCaseRequirement.js';
import { WRITE_FAILURE, planMeetingWrite, planIdentifiedStart, planMeetingEnd } from '../lib/meetingWrites.js';

// ─────────────────────────────────────────────────────────────────────────
// Phase 4A — the New Meeting screen asserted that the employee "must receive a
// written invitation at least 48 hours before the hearing ... (ERA 1999 s.10)".
// s.10 is the right to be accompanied and imposes no notice period, and nothing
// in Compass supplied the 48 hours: not a statute, not the ACAS Code, not a
// configured policy, not retrieval. It was a hard-coded string, and the codebase
// already contradicted it in two places that deliberately refuse to guess a
// number.
//
// Phase 4B — a CASE REQUIRED meeting told the user nothing until persistence
// failed, after the work was done. The explanation now comes first. PARENT_REQUIRED
// is NOT weakened; it remains the backstop.
// ─────────────────────────────────────────────────────────────────────────

const homeSrc = readFileSync('src/screens/HomeMeetingScreen.jsx', 'utf8');
const guidanceSrc = readFileSync('src/lib/invitationGuidance.js', 'utf8');
const strip = src => src.split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');
const homeCode = strip(homeSrc);

describe('1/2. the unsupported 48-hour requirement is gone', () => {
  it('1. no universal 48-hour assertion remains anywhere user-facing', () => {
    // Comment-stripped: prose legitimately describes what was removed.
    expect(homeCode).not.toContain('48 hours');
    expect(homeCode).not.toContain('48-hour');
    expect(strip(guidanceSrc)).not.toContain('48 hours');
    for (const g of Object.keys({ disciplinary: 1, grievance: 1, 'redundancy-atrisk': 1, 'appeal-disciplinary': 1, 'pip-review': 1 })) {
      const body = invitationGuidance(g).body;
      expect(body, g).not.toMatch(/\b\d+\s*(hour|hours|day|days|working day|working days)\b/i);
    }
  });

  it('1b. no invented absolute replaced it — no fixed period, and no "must"', () => {
    for (const type of ['disciplinary', 'grievance', 'redundancy-atrisk', 'appeal-disciplinary', 'pip-review']) {
      const g = invitationGuidance(type);
      expect(g.body, type).not.toMatch(/\bmust\b/i);
      expect(g.heading, type).toBe('Formal invitation');       // not "...required"
    }
  });

  it('2. ERA 1999 s.10 is cited only for the right to be accompanied', () => {
    for (const type of ['disciplinary', 'grievance', 'appeal-disciplinary']) {
      const body = invitationGuidance(type).body;
      if (body.includes('ERA 1999 s.10')) {
        expect(body, type).toMatch(/accompanied[^.]*\(ERA 1999 s\.10\)/);
      }
    }
    // and never alongside a notice period
    const disc = invitationGuidance('disciplinary').body;
    expect(disc).toContain('reasonable notice');
    expect(disc).toContain('right to be accompanied (ERA 1999 s.10)');
    expect(disc).not.toMatch(/\d+\s*hours?[^.]*ERA 1999/);
  });

  it('3. correct accompaniment guidance is retained where it applies', () => {
    expect(invitationGuidance('disciplinary').body).toContain('right to be accompanied');
    expect(invitationGuidance('grievance').body).toContain('right to be accompanied');
    expect(invitationGuidance('appeal-disciplinary').body).toContain('right to be accompanied');
    // the separate, already-correct field label is untouched
    expect(homeCode).toContain('right to be accompanied, ERA 1999 s.10');
  });

  it('a period is stated ONLY when the organisation configured one', () => {
    expect(noticeRequirement(null)).toBeNull();
    expect(noticeRequirement('')).toBeNull();
    expect(noticeRequirement('   ')).toBeNull();
    expect(noticeRequirement("5 working days' notice"))
      .toBe("Your organisation's policy states: 5 working days' notice");
    // attributed, so it is visibly the policy speaking rather than Compass
    expect(noticeRequirement('48 hours notice')).toContain("Your organisation's policy states:");
    expect(invitationGuidance('disciplinary').policyNotice).toBeNull();
    expect(invitationGuidance('disciplinary', { policyNotice: '7 days' }).policyNotice)
      .toBe("Your organisation's policy states: 7 days");
  });

  it('no citation is invented for types that have none', () => {
    expect(invitationGuidance('redundancy-atrisk').body).not.toContain('ERA');
    expect(invitationGuidance('pip-review').body).not.toContain('ERA');
    expect(invitationGuidance('nonexistent-type')).toBeNull();
  });
});

describe('the case requirement is classified, not guessed', () => {
  it('CASE REQUIRED covers hearings, appeals and redundancy', () => {
    for (const t of ['disciplinary', 'appeal-disciplinary', 'appeal-grievance', 'appeal-dismissal',
                     'redundancy-atrisk', 'redundancy-consult', 'redundancy-outcome', 'redundancy-appeal']) {
      expect(caseRequirement(t), t).toBe(CASE_REQUIREMENT.REQUIRED);
    }
  });

  it('standalone-intended types are STANDALONE_ALLOWED since 4C.3, and never REQUIRED', () => {
    // Phase 4B classified these as PENDING_ARCHITECTURE because Compass could not
    // yet persist a meeting without a case. Phase 4C.3 built that store, so they
    // are now genuinely permitted. The invariant this test has always protected
    // is the second line: they must never become REQUIRED.
    for (const t of ['informal', 'return', 'investigation']) {
      expect(caseRequirement(t), t).toBe(CASE_REQUIREMENT.STANDALONE_ALLOWED);
      expect(caseRequirement(t), t).not.toBe(CASE_REQUIREMENT.REQUIRED);
      expect(isStandaloneIntended(t), t).toBe(true);
      // And nothing blocks them any more.
      expect(caseRequirementNotice(t, false), t).toBeNull();
    }
  });

  it('deferred types behave as PENDING, not REQUIRED — Compass asserts nothing', () => {
    for (const t of ['formal', 'grievance']) {
      expect(caseRequirement(t), t).toBe(CASE_REQUIREMENT.PENDING_ARCHITECTURE);
    }
  });

  it('the dev group is untouched, so NEW-20 FULL is not disturbed', () => {
    for (const t of ['probation', 'appraisal', 'pip-review', 'pdp']) {
      expect(caseRequirement(t), t).toBe(CASE_REQUIREMENT.NOT_APPLICABLE);
    }
    expect(caseRequirement('anything', { isDevGroup: true })).toBe(CASE_REQUIREMENT.NOT_APPLICABLE);
  });

  it('the two reasons carry DIFFERENT copy — a welfare meeting is not a formal case', () => {
    const required = caseRequirementNotice('disciplinary', false);
    // Since 4C.3 the PENDING message belongs to the DEFERRED types only —
    // `informal` is now permitted and shows no notice at all.
    const pending = caseRequirementNotice('formal', false);
    expect(required.title).toBe('This meeting is part of a formal case');
    expect(required.body).toContain('belongs to the case it arises from');
    expect(pending.title).toBe('Link this meeting to a case to continue');
    expect(pending.body).toContain('does not have to be part of a formal case');
    // the crucial distinction: PENDING must never claim a formal process
    expect(pending.body).not.toContain('formal case process');
    expect(pending.title).not.toContain('formal');
  });

  it('a linked case clears the notice entirely', () => {
    for (const t of ['disciplinary', 'informal', 'investigation']) {
      expect(caseRequirementNotice(t, true), t).toBeNull();
    }
  });
});

describe('9/10. the Phase 2.1 backstop is untouched', () => {
  it('9. PARENT_REQUIRED still fires in every primitive on a missing caseId', () => {
    expect(planMeetingWrite({ cases: [], caseId: '', meeting: { id: 'm' } }).reason)
      .toBe(WRITE_FAILURE.PARENT_REQUIRED);
    expect(planIdentifiedStart({ cases: [], caseId: null, meetingId: 'm' }).reason)
      .toBe(WRITE_FAILURE.PARENT_REQUIRED);
    expect(planMeetingEnd({ cases: [], caseId: undefined, meetingId: 'm' }).reason)
      .toBe(WRITE_FAILURE.PARENT_REQUIRED);
  });

  it('10. no employee-name matching or automatic case creation is introduced', () => {
    const libs = readFileSync('src/lib/meetingCaseRequirement.js', 'utf8') + guidanceSrc;
    for (const forbidden of ['employeeName', 'toLowerCase()', 'crypto.randomUUID', 'createCase', 'newId(']) {
      expect(libs, forbidden).not.toContain(forbidden);
    }
    // the guard reads an explicit id, never a name
    expect(homeCode).toContain('const linkedCaseIdForGuard = meetingSetup.preparedCaseId||meetingSetup.linkedCaseId||activeCaseId||null;');
    expect(homeCode).toContain('caseRequirementNotice(meetingSetup.type, !!linkedCaseIdForGuard');
  });

  it('the guard is pure UX — it writes nothing', () => {
    const libs = readFileSync('src/lib/meetingCaseRequirement.js', 'utf8');
    for (const forbidden of ['saveCases', 'supabase', 'persistMeeting', 'transitionMeeting', 'await']) {
      expect(libs, forbidden).not.toContain(forbidden);
    }
  });
});

// ── rendered screen ──
const noop = () => {};
const baseSetup = { employee: 'Sam Patel', type: '', date: '', time: '', participants: [] };
const renderHome = (setup = {}, over = {}) => {
  const setScreen = vi.fn();
  const utils = render(<HomeMeetingScreen
    beginMeeting={vi.fn()} scheduleCaseMeeting={vi.fn()}
    meetingSetup={{ ...baseSetup, ...setup }} setMeetingSetup={noop}
    orgMembers={[]} getEmployeeRecord={() => null} cases={[]} getCaseStage={() => 'open'}
    activeCaseId={over.activeCaseId ?? null} setActiveCaseId={noop}
    needsInvitation={() => false} setCaseInfo={noop} setMeetingType={noop}
    setPendingLetterType={noop} setShowLetterModal={noop} setScreen={setScreen}
    setTranscript={noop} setPrepNotes={noop} setPrepQuestions={noop}
    setMeetingEvidenceSuggestions={noop} setMeetingActionSuggestions={noop}
    setReviewOutput={noop} setReviewOutputOriginal={noop} setMeetingSummary={noop}
    setLetterOutput={noop} setRiskScore={noop} setLiveChatHistory={noop}
    setParticipants={noop} setDismissedCoachingTipKeys={noop}
    fmtDate={d => d || ''} startSession={noop} />);
  return { ...utils, setScreen };
};
const btn = name => screen.queryByRole('button', { name });

describe('4/5/6/7. the reason is visible BEFORE any work', () => {
  it('4/5/6. a CASE REQUIRED type with no case cannot Start, Schedule or Prepare', () => {
    renderHome({ type: 'disciplinary', date: '2026-10-04', time: '10:00' });
    expect(btn('Start meeting')).toBeDisabled();
    expect(btn('Schedule meeting')).toBeDisabled();
    expect(btn('Prepare meeting')).toBeDisabled();
  });

  it('7. and the reason is on screen, not hidden in a tooltip alone', () => {
    renderHome({ type: 'disciplinary' });
    expect(screen.getByText('This meeting is part of a formal case')).toBeInTheDocument();
    expect(screen.getByText(/belongs to the case it arises from/)).toBeInTheDocument();
    expect(btn('Start meeting')).toHaveAttribute('title',
      expect.stringContaining('a hearing or appeal belongs to a formal case'));
  });

  it('7b. both routes forward are offered', () => {
    const { setScreen } = renderHome({ type: 'disciplinary' });
    expect(btn('Link to an existing case')).toBeEnabled();
    expect(btn('Create a case')).toBeEnabled();
    btn('Create a case').click();
    expect(setScreen).toHaveBeenCalled();
  });

  it('4C.3 — a standalone-eligible type with no case can now simply be started', () => {
    renderHome({ type: 'informal' });
    expect(btn('Start meeting')).toBeEnabled();
    // No notice, and — importantly — no "are you sure this is standalone?"
    // confirmation and no architecture terminology. The user chose a type and
    // chose no case; Compass understands the machinery.
    expect(screen.queryByText('Link this meeting to a case to continue')).toBeNull();
    expect(screen.queryByText('This meeting is part of a formal case')).toBeNull();
    const body = document.body.textContent;
    [/standalone/i, /table/i, /storage/i, /are you sure/i, /confirm/i]
      .forEach(p => expect(body, String(p)).not.toMatch(p));
  });

  it('4C.3 — a DEFERRED type is still blocked, and still told the honest reason', () => {
    renderHome({ type: 'formal' });
    expect(btn('Start meeting')).toBeDisabled();
    expect(screen.getByText('Link this meeting to a case to continue')).toBeInTheDocument();
    expect(screen.getByText(/does not have to be part of a formal case/)).toBeInTheDocument();
    expect(screen.queryByText('This meeting is part of a formal case')).toBeNull();
  });

  it('8. a linked case leaves the existing flow completely unchanged', () => {
    renderHome({ type: 'disciplinary', date: '2026-10-04', time: '10:00' }, { activeCaseId: 'case-1' });
    expect(screen.queryByText('This meeting is part of a formal case')).toBeNull();
    expect(screen.queryByText('Link this meeting to a case to continue')).toBeNull();
    expect(btn('Start meeting')).toBeEnabled();
    expect(btn('Schedule meeting')).toBeEnabled();
    expect(btn('Prepare meeting')).toBeEnabled();
  });

  it('the pre-existing date/time gate on Schedule still works', () => {
    renderHome({ type: 'disciplinary' }, { activeCaseId: 'case-1' });
    expect(btn('Schedule meeting')).toBeDisabled();          // no date/time
    expect(btn('Start meeting')).toBeEnabled();              // Start never needed them
  });

  it('no notice at all before a type is chosen', () => {
    renderHome({ type: '' });
    expect(screen.queryByText('This meeting is part of a formal case')).toBeNull();
    expect(screen.queryByText('Link this meeting to a case to continue')).toBeNull();
  });
});
