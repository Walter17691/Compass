import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { HrReviewGatePanel } from '../components/HrReviewGatePanel';
import {
  decisionNoteMissing, decisionNoteRequirement, requiresWrittenNote,
  STATUSES_REQUIRING_A_WRITTEN_NOTE, INVESTIGATION_REVIEW_STATUSES,
} from '../lib/approvals';

// ─────────────────────────────────────────────────────────────────────────
// Phase 0 stabilisation — the empty clarification request.
//
// B3 A3c (hr_review_lifecycle_mutex_2026-10-12.sql, applied to production
// 2026-10-12) made an empty clarification question a database error:
//
//   if new.status = 'clarification_requested' then
//     if coalesce(btrim(new.comments), '') = '' then
//       raise exception 'Requesting clarification needs a written question…'
//
// The guard's status branch has no report_regime condition, so it governs
// every case today. The panel still said "Comments (optional)" for all six
// actions, so the action went from working to failing with a raw database
// message. These tests pin the client-side rule that now prevents the
// request from being sent at all.
//
// They do NOT test the database. The guard remains the authority and is
// untouched; what is asserted here is that the interface states the same
// rule and refuses before the network, and that the other five decisions
// keep their optional comment.
// ─────────────────────────────────────────────────────────────────────────

const CASE_ID = 'case-1';
const REVIEW_ID = 'review-1';

const pendingReview = {
  id: REVIEW_ID, case_id: CASE_ID, step: 'inv_report', status: 'pending',
  requested_at: '2026-10-12T09:00:00Z', requested_by_name: 'Sam Investigator',
};

function renderPanel(overrides = {}) {
  const resolveInvestigationReview = vi.fn();
  render(
    <HrReviewGatePanel
      cs={{ id: CASE_ID }}
      hrReviewRequests={[pendingReview]}
      resolveInvestigationReview={resolveInvestigationReview}
      isHR
      {...overrides}
    />,
  );
  return { resolveInvestigationReview };
}

const clarifyButton = () => screen.getByRole('button', { name: 'Request clarification' });
const noteField = () => screen.getByLabelText('Review comments');

describe('Phase 0 — the rule itself', () => {
  it('names clarification_requested, and ONLY that status, as needing a note', () => {
    expect(STATUSES_REQUIRING_A_WRITTEN_NOTE).toEqual(['clarification_requested']);
    expect(requiresWrittenNote('clarification_requested')).toBe(true);
    // The control: every other investigation decision must NOT require one.
    for (const s of INVESTIGATION_REVIEW_STATUSES.filter(x => x.id !== 'clarification_requested')) {
      expect(requiresWrittenNote(s.id), `${s.id} must keep its optional comment`).toBe(false);
    }
  });

  it('refuses empty, whitespace-only and missing notes for clarification', () => {
    expect(decisionNoteMissing('clarification_requested', '')).toBe(true);
    expect(decisionNoteMissing('clarification_requested', '   ')).toBe(true);
    expect(decisionNoteMissing('clarification_requested', '\t')).toBe(true);
    expect(decisionNoteMissing('clarification_requested', '\n')).toBe(true);
    expect(decisionNoteMissing('clarification_requested', ' \t\n ')).toBe(true);
    expect(decisionNoteMissing('clarification_requested', undefined)).toBe(true);
    expect(decisionNoteMissing('clarification_requested', null)).toBe(true);
  });

  it('accepts a real question, including one with surrounding whitespace', () => {
    expect(decisionNoteMissing('clarification_requested', 'Why was no witness interviewed?')).toBe(false);
    expect(decisionNoteMissing('clarification_requested', '  Why?  ')).toBe(false);
  });

  it('is STRICTER than the database, which is the safe direction', () => {
    // Verified against production: Postgres btrim() with no second argument
    // strips SPACES ONLY, so btrim(E'\t') <> '' and a tab-only question
    // SATISFIES the applied guard. The client refuses it anyway. If this ever
    // inverts — client looser than the database — the user gets a raw
    // database error again, which is the whole defect this phase fixes.
    const dbWouldAccept = s => s.replace(/^ +| +$/g, '') !== '';
    const clientRefuses = s => decisionNoteMissing('clarification_requested', s);
    expect(dbWouldAccept('\t')).toBe(true);
    expect(clientRefuses('\t')).toBe(true);
    // And nothing the client allows may be refused by the database.
    for (const s of ['a', ' a ', 'Why?', '\tWhy?\n']) {
      if (!clientRefuses(s)) expect(dbWouldAccept(s), `db must accept ${JSON.stringify(s)}`).toBe(true);
    }
  });

  it('never requires a note for an unknown status', () => {
    expect(decisionNoteMissing('not_a_status', '')).toBe(false);
    expect(decisionNoteRequirement('not_a_status')).toBeNull();
  });

  it('explains the requirement in words, only for the status that has one', () => {
    expect(decisionNoteRequirement('clarification_requested')).toMatch(/written question/i);
    expect(decisionNoteRequirement('approved')).toBeNull();
    expect(decisionNoteRequirement('returned')).toBeNull();
  });
});

describe('Phase 0 — the panel enforces it', () => {
  it('disables Request clarification while the note is empty', () => {
    renderPanel();
    expect(clarifyButton()).toBeDisabled();
  });

  it('keeps the other five decisions enabled with an empty note', () => {
    renderPanel();
    for (const s of INVESTIGATION_REVIEW_STATUSES.filter(x => x.id !== 'clarification_requested')) {
      expect(
        screen.getByRole('button', { name: s.actionLabel }),
        `${s.actionLabel} must stay available — its comment is genuinely optional`,
      ).toBeEnabled();
    }
  });

  it('still disables it for a whitespace-only question', () => {
    renderPanel();
    fireEvent.change(noteField(), { target: { value: '   \t  ' } });
    expect(clarifyButton()).toBeDisabled();
  });

  it('enables it as soon as a real question is typed, and submits', () => {
    const { resolveInvestigationReview } = renderPanel();
    fireEvent.change(noteField(), { target: { value: 'Why was no witness interviewed?' } });
    expect(clarifyButton()).toBeEnabled();
    fireEvent.click(clarifyButton());
    expect(resolveInvestigationReview).toHaveBeenCalledWith(
      REVIEW_ID, CASE_ID, 'clarification_requested', 'Why was no witness interviewed?',
    );
  });

  it('does not call the handler when clicked while empty', () => {
    const { resolveInvestigationReview } = renderPanel();
    fireEvent.click(clarifyButton());
    expect(resolveInvestigationReview).not.toHaveBeenCalled();
  });

  it('enforces the same rule on the keyboard path', () => {
    // A real `disabled` attribute is what makes Enter and Space inert on a
    // focused button. Styling alone would leave the keyboard route open, so
    // this asserts the attribute and not merely the appearance.
    const { resolveInvestigationReview } = renderPanel();
    const btn = clarifyButton();
    expect(btn).toHaveAttribute('disabled');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' });
    fireEvent.keyUp(btn, { key: 'Enter', code: 'Enter' });
    fireEvent.keyDown(btn, { key: ' ', code: 'Space' });
    expect(resolveInvestigationReview).not.toHaveBeenCalled();
    // The field itself must not submit on Enter either — it is a textarea in
    // no form, and Enter must keep inserting a newline.
    fireEvent.keyDown(noteField(), { key: 'Enter', code: 'Enter' });
    expect(resolveInvestigationReview).not.toHaveBeenCalled();
  });

  it('does not submit other decisions on the keyboard while they are enabled-but-unclicked', () => {
    const { resolveInvestigationReview } = renderPanel();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Approve' }), { key: 'Enter' });
    expect(resolveInvestigationReview).not.toHaveBeenCalled();
  });
});

describe('Phase 0 — the interface tells the truth', () => {
  it('no longer claims the comment is simply optional', () => {
    renderPanel();
    // The old placeholder is the defect: it promised something the applied
    // database guard had already stopped being true.
    expect(screen.queryByPlaceholderText('Comments (optional)')).toBeNull();
    expect(noteField()).toHaveAttribute(
      'placeholder',
      'Comments — required to request clarification, optional otherwise',
    );
  });

  it('explains the disabled button, and the explanation is reachable from the field', () => {
    renderPanel();
    const hintId = noteField().getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId).textContent).toMatch(/written question/i);
  });

  it('switches the hint back once the question is valid', () => {
    renderPanel();
    const hintId = noteField().getAttribute('aria-describedby');
    fireEvent.change(noteField(), { target: { value: 'Why?' } });
    expect(document.getElementById(hintId).textContent).toMatch(/optional/i);
    // Control: it must go back to the requirement when emptied again, or the
    // hint is static text rather than a reflection of the current state.
    fireEvent.change(noteField(), { target: { value: '' } });
    expect(document.getElementById(hintId).textContent).toMatch(/written question/i);
  });
});

describe('Phase 0 — nothing else moved', () => {
  it('leaves the legacy HR Review screens reachable and unchanged', () => {
    // The six actions, the isHR gate, the newest-first ordering and the
    // non-HR/empty cases are covered by HrReviewGatePanel.test.jsx and
    // AskHrPanel.test.jsx. What matters here is that this panel still
    // renders its history for a decided review with no action row at all.
    render(
      <HrReviewGatePanel
        cs={{ id: CASE_ID }}
        hrReviewRequests={[{ ...pendingReview, status: 'approved', reviewed_by_name: 'Dana HR', comments: 'Fine' }]}
        resolveInvestigationReview={vi.fn()}
        isHR
      />,
    );
    expect(screen.getByText('HR Review Gate')).toBeInTheDocument();
    expect(screen.getByText(/Dana HR/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request clarification' })).toBeNull();
  });

  it('shows no action row to a non-HR viewer, so the rule cannot be reached', () => {
    renderPanel({ isHR: false });
    expect(screen.queryByLabelText('Review comments')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request clarification' })).toBeNull();
  });

  it('guards the handler itself, not only the button', () => {
    // The panel is the only caller today, but resolveInvestigationReview is
    // passed down through the overview prop bag and its case-level effects run
    // BEFORE the awaited write. If the refusal lived only in the button, an
    // alternate caller would revert the stage and write an audit event, then
    // be refused by the database — leaving the case moved with no matching
    // review row. Asserted against the source because the handler is defined
    // inside the App component and is not separately importable.
    const src = readFileSync('src/App.jsx', 'utf8');
    const start = src.indexOf('const resolveInvestigationReview = async');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n  };', start));
    expect(body).toContain('decisionNoteMissing(actionId, comments)');
    // It must refuse BEFORE every case-level effect and before the write.
    const refusalAt = body.indexOf('decisionNoteMissing');
    for (const effect of ['confirmDialog', 'saveCases', 'createCaseTask', 'audit(', 'respondToReview']) {
      const at = body.indexOf(effect);
      expect(at, `${effect} must appear in resolveInvestigationReview`).toBeGreaterThan(-1);
      expect(refusalAt, `refusal must precede ${effect}`).toBeLessThan(at);
    }
  });
});
