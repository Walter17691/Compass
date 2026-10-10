import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InvestigationReportEditor } from '../components/caseTabs/InvestigationReportEditor.jsx';
import {
  createDraftSession, editSections, beginSave, applySaveResult, DRAFT_STATE, READ_ONLY_REASON,
  conflictLatestLoaded, conflictUnavailable, conflictBodyLoaded, conflictBodyLoading,
  conflictBodyUnavailable,
} from '../lib/reportDraftSession.js';
import { DRAFT_SAVE_RESULT } from '../lib/reportDraftGateway.js';
import { REPORT_SECTIONS } from '../lib/reportDraftComposer.js';

// ═══════════════════════════════════════════════════════════════════════════
// B3.2-1 — THE EDITOR SURFACE.
//
// The state machine is tested as data in reportDraftSession.test.js. This
// file tests the thing a human meets, and the property it must never break:
// NO SCREEN HERE OFFERS A PLACE TO WRITE A REPORT THAT CANNOT BE SAVED, and
// no screen hides text that has already been written.
// ═══════════════════════════════════════════════════════════════════════════

const CASE = 'case-1';
const open = (over = {}) => createDraftSession({ caseId: CASE, baseVersion: 0, canSave: true, ...over });

const version = (n, over = {}) => ({
  id: `v${n}`, versionNo: n, createdAt: `2026-10-0${n}T09:00:00Z`,
  createdBy: 'user-1', authorKind: 'user', adoptedAt: null, isCurrent: false,
  adoptionBasis: null, supersededAt: null, ...over,
});

const names = { 'user-1': 'E2E Investigator', 'user-2': 'UAT D4.3 (test)' };
const authorNameFor = (id) => names[id] || null;
const fmtDate = (d) => (d ? d.slice(0, 10) : '');

function renderEditor(props = {}) {
  const handlers = {
    onCommitLive: vi.fn(), onSave: vi.fn(), onReviewLatestBody: vi.fn(),
    onConfirmAndSave: vi.fn(), onContinueFrom: vi.fn(),
  };
  const utils = render(
    <InvestigationReportEditor
      session={open()} authorNameFor={authorNameFor} fmtDate={fmtDate}
      {...handlers} {...props}
    />,
  );
  return { ...utils, ...handlers };
}

describe('B3.2-1 — nothing to write in unless a save is possible', () => {
  it('offers NO text box when the organisation is not activated', () => {
    renderEditor({
      session: createDraftSession({ caseId: CASE, baseVersion: 0, canSave: false, readOnlyReason: READ_ONLY_REASON.NOT_ACTIVATED }),
    });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/not yet switched on for your organisation/i)).toBeTruthy();
    // And it points at the route that does work today.
    expect(screen.getByText(/Conclude investigation/i)).toBeTruthy();
  });

  it('offers NO text box to a viewer with no authority', () => {
    renderEditor({
      session: createDraftSession({ caseId: CASE, baseVersion: 0, canSave: false, readOnlyReason: READ_ONLY_REASON.NO_AUTHORITY }),
    });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText(/assigned investigator, or HR under a documented exception/i)).toBeTruthy();
  });

  it('says the history could not be read rather than offering a save against an unknown base', () => {
    renderEditor({
      session: createDraftSession({ caseId: CASE, baseVersion: null, canSave: false, readOnlyReason: READ_ONLY_REASON.HISTORY_UNREADABLE }),
    });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText(/could not read this case’s report history/i)).toBeTruthy();
  });

  it('CONTROL — an activated, authorised session DOES offer the seven boxes', () => {
    renderEditor();
    // Seven sections, plus no HR reason field for an investigator.
    expect(screen.queryAllByRole('textbox')).toHaveLength(REPORT_SECTIONS.length);
    for (const s of REPORT_SECTIONS) {
      expect(screen.getByLabelText(s.label), s.id).toBeTruthy();
    }
  });
});

describe('B3.2-1 — text already written is never hidden', () => {
  it('shows the draft read-only, with a copy warning, when authority is lost mid-draft', () => {
    let s = editSections(open(), { assessment: 'Half a report I already wrote.' });
    s = { ...s, canSave: false, state: DRAFT_STATE.READ_ONLY, readOnlyReason: READ_ONLY_REASON.NO_AUTHORITY };
    renderEditor({ session: s });
    expect(screen.getByText(/Half a report I already wrote\./)).toBeTruthy();
    expect(screen.getByText(/copy anything you need/i)).toBeTruthy();
    // Shown, but not editable.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});

describe('B3.2-1 — the guided sections', () => {
  it('labels every section and explains what belongs in it', () => {
    renderEditor();
    for (const s of REPORT_SECTIONS) {
      expect(screen.getByText(s.label)).toBeTruthy();
      expect(screen.getByText(s.help)).toBeTruthy();
    }
  });

  it('names the three permitted positions without calling any of them misconduct', () => {
    renderEditor();
    const positions = REPORT_SECTIONS.find(s => s.id === 'positions');
    const help = screen.getByText(positions.help).textContent;
    expect(help).toMatch(/a case to answer/i);
    expect(help).toMatch(/no case to answer/i);
    expect(help).toMatch(/further investigation required/i);
    expect(help).toMatch(/not a finding of misconduct/i);
  });

  it('commits the live text on blur, carrying the case it belongs to', async () => {
    const user = userEvent.setup();
    const { onCommitLive } = renderEditor();
    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.click(box);
    await user.type(box, 'Two matters.');
    await user.tab();
    expect(onCommitLive).toHaveBeenCalledWith(CASE,
      expect.objectContaining({ sections: expect.objectContaining({ matters: 'Two matters.' }) }));
  });

  it('shows ONE raw box, and says why, for a report it did not write', () => {
    const legacy = 'INVESTIGATION REPORT\n\nWritten before Compass had sections.';
    renderEditor({ session: open({ body: legacy }) });
    const boxes = screen.queryAllByRole('textbox');
    expect(boxes).toHaveLength(1);
    expect(screen.getByLabelText('Report text').value).toBe(legacy);
    expect(screen.getByText(/showing it exactly as it stands rather than redistributing it/i)).toBeTruthy();
  });
});

describe('B3.2-1 — the save control tells the truth about what it will do', () => {
  it('is disabled with nothing written', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: /Save a version/i }).disabled).toBe(true);
  });

  it('enables on an incomplete draft — one section is enough', () => {
    renderEditor({ session: editSections(open(), { matters: 'Only the matters, so far.' }) });
    expect(screen.getByRole('button', { name: /Save a version/i }).disabled).toBe(false);
  });

  it('warns that nothing is stored until a save happens', () => {
    renderEditor({ session: editSections(open(), { matters: 'x' }) });
    expect(screen.getByText(/Nothing is stored until you save\./i)).toBeTruthy();
    // Said twice on purpose — once as a scannable pill, once in the status
    // line — so the query is exact rather than ambiguous.
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByText('Unsaved changes. Nothing is stored until you save a version.')).toBeTruthy();
  });

  it('states that saving does not adopt, submit or change the case', () => {
    renderEditor();
    const note = screen.getByText(/Saving stores an immutable version/i).textContent;
    expect(note).toMatch(/does not adopt/i);
    expect(note).toMatch(/submit it for HR review/i);
    expect(note).toMatch(/change the case\s*stage/i);
  });

  it('offers NO adoption or HR-review control anywhere', () => {
    renderEditor({ session: editSections(open(), { matters: 'x' }), versions: [version(1)] });
    for (const label of [/adopt/i, /submit to hr/i, /hr review/i, /conclude/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('confirms a save with its version number', () => {
    let s = editSections(open(), { matters: 'x' });
    s = applySaveResult(beginSave(s, { newRequestId: 'r1' }).session,
      { result: DRAFT_SAVE_RESULT.OK, version: { id: 'v1', versionNo: 1 } });
    renderEditor({ session: s });
    expect(screen.getByText('Saved as version 1.')).toBeTruthy();
    expect(screen.getByText(/^Saved$/)).toBeTruthy();
  });

  it('labels the button a retry, and promises no duplicate, on an uncertain outcome', () => {
    let s = editSections(open(), { matters: 'x' });
    s = applySaveResult(beginSave(s, { newRequestId: 'r1' }).session, { result: DRAFT_SAVE_RESULT.NETWORK });
    renderEditor({ session: s });
    expect(screen.getByRole('button', { name: /Try saving again/i })).toBeTruthy();
    expect(screen.getByText(/cannot create a duplicate version/i)).toBeTruthy();
  });
});

describe('B3.2-1 — a conflict is a choice, never a replacement', () => {
  const staleSession = () => {
    const s = editSections(open(), { assessment: 'My own words.' });
    return applySaveResult(beginSave(s, { newRequestId: 'r1' }).session, { result: DRAFT_SAVE_RESULT.STALE });
  };

  it('says what happened and that the text was not changed', () => {
    renderEditor({ session: staleSession(), versions: [version(1), version(2)] });
    expect(screen.getByText(/Version conflict/i)).toBeTruthy();
    expect(screen.getByText(/has not been changed/i)).toBeTruthy();
    expect(screen.getByLabelText('Investigator’s assessment and reasoning').value).toBe('My own words.');
  });

  it('offers NO confirmation while it is still finding out what was saved', () => {
    renderEditor({ session: staleSession(), versions: [version(1), version(2)] });
    // The status line says a check is under way; the review area says what it
    // is looking up. Queried distinctly so neither assertion is ambiguous.
    expect(screen.getByText(/Compass is checking what was saved/i)).toBeTruthy();
    expect(screen.getByText(/Looking up the newer version/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Keep my text and save it/i })).toBeNull();
  });

  it('offers the confirmation only once the newer version is identified', async () => {
    const user = userEvent.setup();
    const s = conflictLatestLoaded(staleSession(), {
      id: 'v2', versionNo: 2, createdAt: '2026-10-02T09:00:00Z', createdBy: 'user-2', authorKind: 'user',
    });
    const { onConfirmAndSave } = renderEditor({ session: s, versions: [version(1), version(2)] });
    // Who, which and when — before being asked to decide anything.
    expect(screen.getByText(/saved by UAT D4.3 \(test\) on 2026-10-02/)).toBeTruthy();
    expect(screen.getByText('Version 2', { selector: 'strong' })).toBeTruthy();
    const btn = screen.getByRole('button', { name: /Keep my text and save it as version 3/i });
    await user.click(btn);
    expect(onConfirmAndSave).toHaveBeenCalledWith(CASE, expect.objectContaining({ sections: expect.anything() }));
  });

  it('promises no merge and no replacement, and says both versions are kept', () => {
    const s = conflictLatestLoaded(staleSession(), { id: 'v2', versionNo: 2, createdAt: 'T', createdBy: 'user-2', authorKind: 'user' });
    renderEditor({ session: s, versions: [version(1), version(2)] });
    const note = screen.getByText(/will not merge the two reports/i).textContent;
    expect(note).toMatch(/will not replace either one/i);
    expect(note).toMatch(/Both are kept/i);
    expect(note).toMatch(/stays in the history exactly as it was saved/i);
  });

  it('says it revalidates at save time, so a competing save during the review is refused', () => {
    const s = conflictLatestLoaded(staleSession(), { id: 'v2', versionNo: 2, createdAt: 'T', createdBy: 'user-2', authorKind: 'user' });
    renderEditor({ session: s, versions: [version(2)] });
    expect(screen.getByText(/checks again as it saves/i).textContent)
      .toMatch(/refused rather than taking its place/i);
  });

  it('lets the investigator read the newer version before deciding', async () => {
    const user = userEvent.setup();
    const s = conflictLatestLoaded(staleSession(), { id: 'v2', versionNo: 2, createdAt: 'T', createdBy: 'user-2', authorKind: 'user' });
    const { onReviewLatestBody } = renderEditor({ session: s, versions: [version(2)] });
    await user.click(screen.getByRole('button', { name: /Read version 2/i }));
    expect(onReviewLatestBody).toHaveBeenCalled();

    const withBody = conflictBodyLoaded(s, 'The other investigator wrote this.');
    renderEditor({ session: withBody, versions: [version(2)] });
    expect(screen.getByText('The other investigator wrote this.')).toBeTruthy();
    expect(screen.getByText(/VERSION 2, AS SAVED — READ ONLY/i)).toBeTruthy();
  });

  it('FAILS CLOSED when the newer version cannot be retrieved', () => {
    renderEditor({ session: conflictUnavailable(staleSession()), versions: [] });
    expect(screen.queryByRole('button', { name: /Keep my text and save it/i })).toBeNull();
    expect(screen.getByText(/will not offer to save on top of something it cannot show you/i)).toBeTruthy();
    expect(screen.getByText(/Your text is untouched/i)).toBeTruthy();
    // And the draft is still in the boxes.
    expect(screen.getByLabelText('Investigator’s assessment and reasoning').value).toBe('My own words.');
  });

  it('says so when the newer version’s text cannot be opened, without losing the draft', () => {
    const s = conflictLatestLoaded(staleSession(), { id: 'v2', versionNo: 2, createdAt: 'T', createdBy: 'user-2', authorKind: 'user' });
    renderEditor({ session: conflictBodyUnavailable(s), versions: [version(2)] });
    expect(screen.getByText(/could not open that version’s text/i)).toBeTruthy();
    expect(screen.getByLabelText('Investigator’s assessment and reasoning').value).toBe('My own words.');
  });

  it('shows progress while the newer version is opening', () => {
    const s = conflictLatestLoaded(staleSession(), { id: 'v2', versionNo: 2, createdAt: 'T', createdBy: 'user-2', authorKind: 'user' });
    renderEditor({ session: conflictBodyLoading(s), versions: [version(2)] });
    expect(screen.getByText(/Opening version 2/i)).toBeTruthy();
  });
});

describe('B3.2-1 — the HR exception', () => {
  it('shows a reason field only when the viewer needs one', () => {
    renderEditor();
    expect(screen.queryByLabelText(/Reason for saving as HR/i)).toBeNull();

    renderEditor({ session: open({ requiresHrReason: true }) });
    expect(screen.getByLabelText(/Reason for saving as HR/i)).toBeTruthy();
    expect(screen.getByText(/RECORDED IN THE CASE AUDIT TRAIL/i)).toBeTruthy();
  });

  it('prompts rather than failing when the reason is missing', () => {
    let s = open({ requiresHrReason: true });
    s = beginSave(editSections(s, { matters: 'x' }), { newRequestId: 'r1' }).session;
    renderEditor({ session: s });
    expect(screen.getByText(/Reason needed/i)).toBeTruthy();
    expect(screen.getByText(/requires a written reason/i)).toBeTruthy();
  });

  it('carries the reason in the live content it commits and saves', async () => {
    const user = userEvent.setup();
    const { onCommitLive } = renderEditor({ session: open({ requiresHrReason: true }) });
    const box = screen.getByLabelText(/Reason for saving as HR/i);
    await user.click(box);
    await user.type(box, 'Investigator on leave');
    await user.tab();
    expect(onCommitLive).toHaveBeenCalledWith(CASE,
      expect.objectContaining({ hrReason: 'Investigator on leave' }));
  });
});

describe('B3.2-1 — the version history says who, when and which is latest', () => {
  it('shows version number, author and date on every row', () => {
    renderEditor({ versions: [version(1), version(2, { createdBy: 'user-2' })] });
    expect(screen.getByText('Version 1')).toBeTruthy();
    expect(screen.getByText('Version 2')).toBeTruthy();
    expect(screen.getByText(/E2E Investigator · 2026-10-01/)).toBeTruthy();
    expect(screen.getByText(/UAT D4.3 \(test\) · 2026-10-02/)).toBeTruthy();
  });

  it('marks exactly one row as latest, and puts it first', () => {
    renderEditor({ versions: [version(1), version(2), version(3)] });
    expect(screen.getAllByText('Latest')).toHaveLength(1);
    const headings = screen.getAllByText(/^Version \d$/).map(n => n.textContent);
    expect(headings).toEqual(['Version 3', 'Version 2', 'Version 1']);
  });

  it('names an unknown author rather than leaving the row anonymous', () => {
    renderEditor({ versions: [version(1, { createdBy: 'nobody-we-know' })] });
    expect(screen.getByText(/Unknown author/)).toBeTruthy();
  });

  it('attributes a system-authored version to the system, not to a person', () => {
    renderEditor({ versions: [version(1, { authorKind: 'system', createdBy: null })] });
    expect(screen.getByText(/^System · /)).toBeTruthy();
  });

  it('distinguishes could-not-read from an empty history', () => {
    renderEditor({ versionsUnreadable: true });
    expect(screen.getByText(/could not read the saved versions/i)).toBeTruthy();
    expect(screen.getByText(/not the same as there being none/i)).toBeTruthy();
    expect(screen.queryByText(/No versions have been saved/i)).toBeNull();
  });

  it('distinguishes still-loading from an empty history', () => {
    renderEditor({ versionsLoading: true });
    expect(screen.getByText(/Loading the report history/i)).toBeTruthy();
    expect(screen.queryByText(/No versions have been saved/i)).toBeNull();
  });

  it('says plainly when there are none', () => {
    renderEditor({ versions: [] });
    expect(screen.getByText(/No versions have been saved for this case yet\./i)).toBeTruthy();
  });

  it('offers "continue from" only when there is nothing unsaved to lose', async () => {
    const user = userEvent.setup();
    // Clean: the option is there.
    const clean = renderEditor({ versions: [version(1)] });
    expect(screen.getByRole('button', { name: /Continue from this version/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Continue from this version/i }));
    expect(clean.onContinueFrom).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }));
    clean.unmount();

    // Dirty: it is withheld, and the reason is given rather than left implicit.
    renderEditor({ session: editSections(open(), { matters: 'x' }), versions: [version(1)] });
    expect(screen.queryByRole('button', { name: /Continue from this version/i })).toBeNull();
    expect(screen.getByText(/opening an earlier version is unavailable/i)).toBeTruthy();
  });

  it('shows the adoption state of a version without offering to change it', () => {
    renderEditor({ versions: [version(1, { adoptedAt: 'T', isCurrent: true, adoptionBasis: 'hr_exception' })] });
    expect(screen.getByText(/Adopted · current/)).toBeTruthy();
    expect(screen.getByText(/Adopted under HR exception/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /adopt/i })).toBeNull();
  });
});

describe('B3.2-1 — surface rules', () => {
  it('renders nothing at all without a session, rather than an empty frame', () => {
    const { container } = render(<InvestigationReportEditor session={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('uses no emoji anywhere in its own source', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/components/caseTabs/InvestigationReportEditor.jsx', 'utf8');
    // eslint-disable-next-line no-misleading-character-class
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
  });

  it('uses no raw hex colour — every colour comes from the token scale', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('src/components/caseTabs/InvestigationReportEditor.jsx', 'utf8');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('shows the base version so the investigator knows what they are following', () => {
    renderEditor({ session: open({ baseVersion: 4 }), versions: [version(4)] });
    expect(screen.getByText(/Based on version 4/)).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B3.2-1 RELIABILITY PASS — THE THREE CORRECTIONS, ASSERTED.
//
// 1. Status moves on the keystroke, not on a blur.
// 2. Save captures what is visible, with no dependence on event ordering.
// 3. A conflict is reviewed before it can be acted on (above).
// ═══════════════════════════════════════════════════════════════════════════

describe('B3.2-1 — unsaved changes are reflected immediately', () => {
  it('marks the draft unsaved on the FIRST keystroke, with no blur', async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.getByText('No unsaved changes')).toBeTruthy();

    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.click(box);
    await user.type(box, 'T');
    // Still focused — nothing has blurred.
    expect(box).toHaveFocus();
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.getByText(/Nothing is stored until you save\./i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save a version/i }).disabled).toBe(false);
  });

  it('restores the clean status when the change is undone', async () => {
    const user = userEvent.setup();
    renderEditor();
    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.click(box);
    await user.type(box, 'abc');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await user.clear(box);
    expect(screen.getByText('No unsaved changes')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save a version/i }).disabled).toBe(true);
  });

  it('reopens a stored draft as unsaved, so returning to a case preserves it', () => {
    renderEditor({ session: editSections(open(), { assessment: 'Written earlier, never saved.' }) });
    expect(screen.getByLabelText('Investigator’s assessment and reasoning').value)
      .toBe('Written earlier, never saved.');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('commits the live text on UNMOUNT, so navigating away cannot discard it', async () => {
    const user = userEvent.setup();
    const { onCommitLive, unmount } = renderEditor();
    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.click(box);
    await user.type(box, 'Written then navigated away from');
    onCommitLive.mockClear();
    unmount();
    expect(onCommitLive).toHaveBeenCalledWith(CASE,
      expect.objectContaining({ sections: expect.objectContaining({ matters: 'Written then navigated away from' }) }));
  });

  it('commits under the case it belongs to, so text cannot cross between cases', async () => {
    const user = userEvent.setup();
    const { onCommitLive, unmount } = renderEditor({
      session: createDraftSession({ caseId: 'case-OTHER', baseVersion: 0, canSave: true }),
    });
    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.type(box, 'belongs to the other case');
    onCommitLive.mockClear();
    unmount();
    // Every call carries case-OTHER and never case-1.
    for (const call of onCommitLive.mock.calls) expect(call[0]).toBe('case-OTHER');
  });
});

describe('B3.2-1 — Save sends exactly what is visible', () => {
  const liveMatters = (fn) => fn.mock.calls.at(-1)[1].sections.matters;

  it('captures text typed immediately before the click, with the field still focused', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();
    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.click(box);
    await user.type(box, 'Typed and never blurred');
    await user.click(screen.getByRole('button', { name: /Save a version/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toBe(CASE);
    expect(liveMatters(onSave)).toBe('Typed and never blurred');
  });

  it('captures the same text when the button is activated by KEYBOARD', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();
    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.click(box);
    await user.type(box, 'Saved with the keyboard');
    const btn = screen.getByRole('button', { name: /Save a version/i });
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalled();
    expect(liveMatters(onSave)).toBe('Saved with the keyboard');

    onSave.mockClear();
    await user.keyboard(' ');
    expect(onSave).toHaveBeenCalled();
    expect(liveMatters(onSave)).toBe('Saved with the keyboard');
  });

  it('captures the newest keystroke even when several fields were edited', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor();
    await user.type(screen.getByLabelText(REPORT_SECTIONS[0].label), 'matters text');
    await user.type(screen.getByLabelText(REPORT_SECTIONS[6].label), 'summary text');
    await user.click(screen.getByRole('button', { name: /Save a version/i }));
    const live = onSave.mock.calls[0][1];
    expect(live.sections.matters).toBe('matters text');
    expect(live.sections.summary).toBe('summary text');
  });

  it('commits before it sends, so the session and the request agree', async () => {
    const user = userEvent.setup();
    const { onSave, onCommitLive } = renderEditor();
    await user.type(screen.getByLabelText(REPORT_SECTIONS[0].label), 'x');
    onCommitLive.mockClear();
    await user.click(screen.getByRole('button', { name: /Save a version/i }));
    expect(onCommitLive).toHaveBeenCalled();
    expect(onCommitLive.mock.calls.at(-1)[1]).toEqual(onSave.mock.calls[0][1]);
  });

  it('cannot start a second save while one is in flight', () => {
    const s = beginSave(editSections(open(), { matters: 'x' }), { newRequestId: 'r1' }).session;
    renderEditor({ session: s });
    const btn = screen.getByRole('button', { name: /Saving/i });
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('Saving')).toBeTruthy();
  });

  it('keeps editing possible while a save is in flight, and shows Saving not Unsaved', async () => {
    const user = userEvent.setup();
    const s = beginSave(editSections(open(), { matters: 'x' }), { newRequestId: 'r1' }).session;
    const { onCommitLive } = renderEditor({ session: s });
    const box = screen.getByLabelText(REPORT_SECTIONS[0].label);
    await user.click(box);
    await user.type(box, 'y');
    expect(box.value).toBe('xy');
    // The in-flight state outranks the dirty flag in the pill.
    expect(screen.getByText('Saving')).toBeTruthy();
    // And the extra keystroke is still committed on unmount.
    onCommitLive.mockClear();
    await user.tab();
    expect(onCommitLive.mock.calls.at(-1)[1].sections.matters).toBe('xy');
  });

  it('offers a retry that sends the unchanged text, after a failure', async () => {
    const user = userEvent.setup();
    let s = editSections(open(), { matters: 'unchanged text' });
    s = applySaveResult(beginSave(s, { newRequestId: 'r1' }).session, { result: DRAFT_SAVE_RESULT.NETWORK });
    const { onSave } = renderEditor({ session: s });
    await user.click(screen.getByRole('button', { name: /Try saving again/i }));
    expect(liveMatters(onSave)).toBe('unchanged text');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B3.2-1 — THE INACTIVE RELEASE, END TO END.
//
// Requirements 3 and 4 of the deployment brief, as one assertion chain rather
// than two separate beliefs: for each organisation that actually exists in
// production, run the REAL activation predicate, build the session the case
// workspace would build from its answer, render it, and assert there is
// nothing to type in and nothing that looks like a working Save.
//
// This is the test that would fail if someone added an id to the allow-list
// without meaning to ship an active editor.
// ═══════════════════════════════════════════════════════════════════════════

describe('B3.2-1 — no real organisation can reach an editable field', () => {
  const PRODUCTION_ORGS = [
    ['Compass LTD', 'dbe871c5-e6fe-45d8-8bc4-201e487579be'],
    ['E2E Test Org', 'f381bfa6-7b27-497f-9af7-46a82c8f8f4c'],
    ['E2E Test Org (large)', '7980b6a6-8575-4228-8f83-37e6dec6995b'],
    ['E2E Second Org', 'b9b36250-271f-4340-a3cf-5a64bf49ecac'],
  ];

  it.each(PRODUCTION_ORGS)('%s gets a read-only editor with no inputs', async (_name, orgId) => {
    const { isReportDraftSaveEnabled } = await import('../lib/reportDraftActivation.js');

    // The exact conjunction CaseViewScreen uses, with authority and a
    // readable history both TRUE — so the only thing withholding the editor
    // is activation.
    const activated = isReportDraftSaveEnabled(orgId);
    expect(activated, `${orgId} must not be activated`).toBe(false);

    const session = createDraftSession({
      caseId: CASE,
      baseVersion: 0,
      canSave: activated && true && true,
      readOnlyReason: !activated ? READ_ONLY_REASON.NOT_ACTIVATED : null,
      requiresHrReason: false,
    });
    expect(session.state).toBe(DRAFT_STATE.READ_ONLY);

    const { unmount } = render(
      <InvestigationReportEditor session={session} authorNameFor={authorNameFor} fmtDate={fmtDate} />,
    );
    // Nothing to type in, and no control that could be mistaken for a save.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/Save a version/i)).toBeNull();
    expect(screen.queryByText(/Try saving again/i)).toBeNull();
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull();
    // And it says why, pointing at the route that does work.
    expect(screen.getByText(/not yet switched on for your organisation/i)).toBeTruthy();
    unmount();
  });

  it('a save cannot even be ATTEMPTED on a read-only session', () => {
    const session = createDraftSession({
      caseId: CASE, baseVersion: 0, canSave: false,
      readOnlyReason: READ_ONLY_REASON.NOT_ACTIVATED,
    });
    // Edits are refused, so there is no text to send…
    const edited = editSections(session, { matters: 'trying anyway' });
    expect(edited).toBe(session);
    // …and beginSave produces no request even if one were forced.
    expect(beginSave(session, { newRequestId: 'r1' }).request).toBeNull();
  });
});
