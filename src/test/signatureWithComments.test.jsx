import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import { SignedRecordModal } from '../components/SignedRecordModal.jsx';
import {
  confirmationSemantics, confirmationSemanticsFor, provenanceLine,
  CONFIRMATION_SEMANTICS, PROVENANCE_KIND, TONE,
} from '../lib/confirmationSemantics.js';
import { fmtSignatureInstant, fmtMeetingTime } from '../lib/meetingTiming.js';
import { ESIGNATURE_STATUS, EXTERNAL_SIGNATURE_STATUS } from '../lib/eSignature.js';
import { participantResponsePatch } from '../lib/participantResponse.js';
import { PUBLIC_FIELDS } from '../lib/publicSigningView.js';

// ═══════════════════════════════════════════════════════════════════════════
// TRUST-SIG-02 — A SIGNATURE WITH A DISPUTE MUST NOT COLLAPSE TO "SIGNED".
//
// The real production signature from human UAT (sign_id 57a9f87f…):
//   status                 'signed'
//   signed_at              2026-10-06T21:04:03.484Z   ← server-derived
//   participant_comment_at 2026-10-06T21:04:03.484Z   ← THE SAME INSTANT
//   participant_comment    107 chars of disagreement
//   signature              31,298 chars (a real PNG data URL)
//
// Two defects: the manager row showed a plain green "Signed", and the signed
// copy rendered signed_at through fmtDate, dropping the time the employee's own
// confirmation page had shown.
// ═══════════════════════════════════════════════════════════════════════════

// The real instants, so the assertions are about real data.
const SIGNED_AT = '2026-10-06T21:04:03.484Z';
const COMMENT = 'I do not agree that i was responsible for the stock count. i had informed my manager that i was unavailable';
const SENT = { sendAttemptedAt: 'T', sendAcceptedAt: 'T' };
// Strips BOTH line comments and /* … */ blocks. These files deliberately
// document the defects they close — including, here, the names of the two maps
// that were removed — so a claim about code must not be decided by prose.
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

describe('A. signed with and without comments', () => {
  it('1. signed with NO comments is an ordinary signed state', () => {
    const s = confirmationSemanticsFor('signed', SENT);
    expect(s.badgeLabel).toBe('Signed');
    expect(s.stateLine).toBe('Signed');
    expect(s.tone).toBe(TONE.DONE);
    expect(s.participantResponded).toBe(false);
    expect(s.impliesAgreement).toBe(true);
  });

  it('2. signed WITH comments says so, in every piece of wording', () => {
    const s = confirmationSemanticsFor('signed', { ...SENT, participantComment: COMMENT });
    expect(s.badgeLabel).toBe('Signed with comments');
    expect(s.stateLine).toBe('Signed with comments');
    expect(s.heading).toBe('Signed copy — with employee comments');
    expect(s.participantResponded).toBe(true);
  });

  it('3. it reads as ATTENTION, never as a refusal — a comment is not a dispute', () => {
    const s = confirmationSemanticsFor('signed', { ...SENT, participantComment: COMMENT });
    expect(s.tone).toBe(TONE.ATTENTION);
    expect(s.tone).not.toBe(TONE.REFUSED);
    // The tone map in MeetingsTab keeps red for an actual refusal only.
    const tab = codeOnly(readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8'));
    expect(tab).toMatch(/\[TONE\.REFUSED\]:\s*\{ color: "#C84B2F"/);
    expect(tab).toMatch(/\[TONE\.ATTENTION\]:\s*\{ color: "#B87520"/);
  });

  it('4. it does NOT imply agreement, but the signature image is STILL shown', () => {
    const s = confirmationSemanticsFor('signed', { ...SENT, participantComment: COMMENT });
    expect(s.impliesAgreement).toBe(false);   // they said something
    expect(s.signatureCaptured).toBe(true);   // they really did sign
  });

  it('5. a comment is NOT a veto — progression is unchanged', () => {
    const withC = confirmationSemanticsFor('signed', { ...SENT, participantComment: COMMENT });
    expect(withC.settlesProgression).toBe(confirmationSemantics('signed').settlesProgression);
    expect(withC.settlesProgression).toBe(true);
  });

  it('6. acknowledged with comments is worded for acknowledgement, not signing', () => {
    const s = confirmationSemanticsFor('acknowledged', { ...SENT, participantComment: 'a note' });
    expect(s.badgeLabel).toBe('Acknowledged with comments');
    expect(s.signatureCaptured).toBe(false);   // an acknowledgement has no image
  });

  it('7. whitespace is not a response', () => {
    for (const c of ['', '   ', '\n\t', null, undefined]) {
      expect(confirmationSemanticsFor('signed', { ...SENT, participantComment: c }).badgeLabel, String(c)).toBe('Signed');
    }
  });

  it('8. already-explicit states are NOT re-annotated', () => {
    // `disputed` already says "Responded with comments"; `declined` carries its
    // own reason. Appending again would be noise.
    expect(confirmationSemanticsFor('disputed', { ...SENT, participantComment: 'x' }).badgeLabel)
      .toBe('Responded with comments');
    expect(confirmationSemanticsFor('declined', { ...SENT, participantComment: 'x' }).badgeLabel).toBe('Declined');
  });

  it('9. an UNENGAGED state is never annotated — nobody responded', () => {
    for (const st of ['sent', 'opened', 'expired', 'proceeded']) {
      const s = confirmationSemanticsFor(st, { ...SENT, participantComment: 'x' });
      expect(s.participantResponded, st).toBe(false);
    }
  });

  it('10. reads the snake_case request row as well as the camelCase mirror', () => {
    expect(confirmationSemanticsFor('signed', { ...SENT, participant_comment: COMMENT }).badgeLabel)
      .toBe('Signed with comments');
  });
});

describe('B. the precise signature timestamp', () => {
  it('11. the canonical instant keeps the TIME — fmtDate dropped it', () => {
    const out = fmtSignatureInstant(SIGNED_AT);
    expect(out).toMatch(/October 2026/);
    expect(out).toMatch(/\bat \d{2}:\d{2}$/);
    // The old rendering, for contrast: date only.
    expect(new Date(SIGNED_AT).toLocaleDateString('en-GB')).not.toMatch(/\d{2}:\d{2}/);
  });

  it('12. it is the viewer-local rendering of the stored UTC instant', () => {
    // 21:04:03.484Z. Compass has NO organisation timezone setting; every instant
    // is rendered in the viewer's own zone via toLocaleString, which is why the
    // employee in BST saw 22:04. Asserted against the Date API rather than a
    // hard-coded hour, so this passes wherever it runs.
    const d = new Date(SIGNED_AT);
    const expected = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    expect(fmtSignatureInstant(SIGNED_AT).endsWith(`at ${expected}`)).toBe(true);
  });

  it('13. malformed and empty instants produce nothing, never "Invalid Date"', () => {
    for (const v of [null, undefined, '', 'not-a-date', {}]) {
      expect(fmtSignatureInstant(v), String(v)).toBe('');
    }
  });

  it('14. public/sign.html formats the SAME field the same way', () => {
    const page = readFileSync('public/sign.html', 'utf8');
    expect(page).toContain("toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})");
    expect(page).toContain("toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})");
    expect(page).toContain("' at '");
    expect(page).toContain('data.signed_at');
    const lib = readFileSync('src/lib/meetingTiming.js', 'utf8');
    expect(lib).toContain('{ day: "numeric", month: "long", year: "numeric" }');
    expect(lib).toContain('{ hour: "2-digit", minute: "2-digit" }');
  });

  it('15. provenanceLine uses the instant when given one, and falls back safely', () => {
    const withTime = provenanceLine('signed', { name: 'Sam', at: SIGNED_AT, fmtInstant: fmtSignatureInstant });
    expect(withTime).toMatch(/^Signed by Sam on .*at \d{2}:\d{2}$/);
    // Existing callers that pass only fmtDate are unaffected.
    expect(provenanceLine('signed', { name: 'Sam', at: SIGNED_AT, fmtDate: () => '06/10/2026' }))
      .toBe('Signed by Sam on 06/10/2026');
    expect(provenanceLine('signed', { name: 'Sam' })).toBe('Signed by Sam');
  });

  it('16. the timestamp is SERVER-derived and cannot be client-spoofed', () => {
    const p = participantResponsePatch('signed', { signature: 'img', signedAt: '1999-01-01T00:00:00.000Z' });
    expect(p.signed_at).not.toBe('1999-01-01T00:00:00.000Z');
    expect(new Date(p.signed_at).getFullYear()).toBeGreaterThan(2020);
    const api = readFileSync('api/signing.js', 'utf8');
    const destructure = api.split('\n').find(l => l.includes('const {') && l.includes('req.body'));
    expect(destructure).not.toMatch(/\bsignedAt\b/);
  });
});

describe('C. the signed copy, rendered', () => {
  const meeting = (over = {}) => ({
    id: 'm1', type: 'Investigation', date: '2026-10-05', signId: 's1',
    signStatus: 'signed', signerName: 'ZZ UAT Trust Slice — Sam Testcase',
    signedAt: SIGNED_AT, record: 'THE RECORD', ...SENT, ...over,
  });
  const snapshot = (over = {}) => ({
    document: 'THE RECORD', employee_name: 'ZZ UAT Trust Slice — Sam Testcase',
    signed_at: SIGNED_AT, signature: 'data:image/png;base64,AAA', status: 'signed', ...over,
  });
  const show = (m, snap) => {
    const loadSignedSnapshot = vi.fn().mockResolvedValue(snap);
    render(<SignedRecordModal meeting={m} fmtDate={d => d} onClose={() => {}} loadSignedSnapshot={loadSignedSnapshot} />);
  };

  it('17. the precise instant appears in the canonical signed copy', async () => {
    show(meeting(), snapshot());
    await waitFor(() => expect(screen.getByText(/Signed by/)).toBeInTheDocument());
    const line = screen.getByText(/Signed by/).textContent;
    expect(line).toMatch(/ZZ UAT Trust Slice — Sam Testcase/);
    expect(line).toMatch(/October 2026 at \d{2}:\d{2}/);
    expect(line).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);   // not the date-only form
  });

  it('18. comment and signature in ONE submission are not shown as two events', async () => {
    show(meeting(), snapshot({ participant_comment: COMMENT, participant_comment_at: SIGNED_AT }));
    await waitFor(() => expect(screen.getByText(/Signed by/)).toBeInTheDocument());
    const line = screen.getByText(/Signed by/).textContent;
    expect(line).toMatch(/submitted with comments/);
    expect(line).not.toMatch(/they responded on/);
  });

  it('19. a genuinely LATER comment is still shown as its own event', async () => {
    const later = '2026-10-07T09:00:00.000Z';
    show(meeting(), snapshot({ participant_comment: COMMENT, participant_comment_at: later }));
    await waitFor(() => expect(screen.getByText(/Signed by/)).toBeInTheDocument());
    expect(screen.getByText(/Signed by/).textContent).toMatch(/comments recorded .*October 2026 at/);
  });

  it('20. the heading says comments exist', async () => {
    show(meeting(), snapshot({ participant_comment: COMMENT, participant_comment_at: SIGNED_AT }));
    await waitFor(() => expect(screen.getByText('Signed copy — with employee comments')).toBeInTheDocument());
  });

  it('21. the employee response stays SEPARATE from the employer record', async () => {
    show(meeting(), snapshot({ participant_comment: COMMENT, participant_comment_at: SIGNED_AT }));
    await waitFor(() => expect(screen.getByText(COMMENT)).toBeInTheDocument());
    // The record itself is unchanged by the comment.
    expect(screen.getByText(/THE RECORD/)).toBeInTheDocument();
    const commentEl = screen.getByText(COMMENT);
    const recordEl = screen.getByText(/THE RECORD/);
    expect(commentEl).not.toBe(recordEl);
    expect(commentEl.contains(recordEl)).toBe(false);
    expect(recordEl.contains(commentEl)).toBe(false);
  });

  it('22. the signature image is shown even though comments exist', async () => {
    show(meeting(), snapshot({ participant_comment: COMMENT, participant_comment_at: SIGNED_AT }));
    await waitFor(() => expect(screen.getByText(/Signed by/)).toBeInTheDocument());
    const img = document.querySelector('img[src^="data:image/png"]');
    expect(img).toBeTruthy();
  });

  it('23. an EXTERNAL signature shows no image, because Compass holds none', async () => {
    show(meeting({ signStatus: EXTERNAL_SIGNATURE_STATUS }), snapshot({ status: 'sent' }));
    await waitFor(() => expect(screen.getByText('Signed outside Compass')).toBeInTheDocument());
    expect(document.querySelector('img[src^="data:image/png"]')).toBeNull();
  });
});

describe('D. nothing established was regressed', () => {
  it('24. the signed artefact is still the immutable snapshot, not current data', () => {
    const modal = codeOnly(readFileSync('src/components/SignedRecordModal.jsx', 'utf8'));
    // Provenance and content come from the snapshot; the mirror is only a fallback.
    expect(modal).toContain('snapshot?.signed_at || meeting.signedAt');
    expect(modal).toContain('snapshot?.participant_comment');
    // And no PATCH of the artefact from here.
    for (const f of ['supabase', 'PATCH', 'saveCases']) expect(modal, f).not.toContain(f);
  });

  it('25. comments are not in the participant-facing allow-list', () => {
    expect(PUBLIC_FIELDS).not.toContain('participant_comment');
    expect(PUBLIC_FIELDS).not.toContain('participant_comment_at');
  });

  it('26. only `signed` carries signature provenance; only it captures an image', () => {
    const signedKinds = Object.entries(CONFIRMATION_SEMANTICS)
      .filter(([, v]) => v.provenanceKind === PROVENANCE_KIND.SIGNED).map(([k]) => k);
    expect(signedKinds).toEqual([ESIGNATURE_STATUS.SIGNED]);
    const captured = Object.entries(CONFIRMATION_SEMANTICS)
      .filter(([, v]) => v.signatureCaptured).map(([k]) => k);
    expect(captured).toEqual([ESIGNATURE_STATUS.SIGNED]);
  });

  it('27. every entry has a badgeLabel and a tone — no state can render blank', () => {
    for (const [status, v] of Object.entries(CONFIRMATION_SEMANTICS)) {
      expect(v.badgeLabel, status).toBeTruthy();
      expect(Object.values(TONE), status).toContain(v.tone);
    }
  });

  it('28. the badge no longer depends on a partial status-keyed style map', () => {
    const tab = codeOnly(readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8'));
    expect(tab).toContain('export function MeetingsTab');   // strip was not total
    expect(tab).not.toContain('SIGN_STATUS_STYLE');
    expect(tab).not.toContain('signatureStatusLabel');
    expect(tab).toContain('TONE_STYLE[sem.tone]');
  });

  it('29. communication truth still wins on the badge', () => {
    // A record Compass cannot confirm it sent must not be badged as awaiting one.
    expect(confirmationSemanticsFor('sent', { signStatus: 'sent' }).badgeLabel).toBe('Issued');
    expect(confirmationSemanticsFor('sent', { sendAttemptedAt: 'T', sendError: 'x' }).badgeLabel).toBe('Not emailed');
    expect(confirmationSemanticsFor('sent', SENT).badgeLabel).toBe('Awaiting signature');
  });

  it('30. fmtMeetingTime is untouched — other surfaces keep their format', () => {
    expect(fmtMeetingTime(SIGNED_AT)).toMatch(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  });
});
