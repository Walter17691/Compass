import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import {
  RESPONSE_TYPE, RESPONSE_TYPES, RESOLUTION, RESOLUTIONS,
  isClassified, responseTypeOf, challengesAccuracy, confirmsAccuracy,
  resolutionNeedsReason, resolutionCarriesAddendum, isResolved, awaitsEmployerReview,
  resolutionLabel, validateEmployeeResponse, validateResolution, resolutionPatch,
} from '../lib/employeeResponse.js';
import { participantResponsePatch } from '../lib/participantResponse.js';
import { confirmationSemanticsFor, TONE } from '../lib/confirmationSemantics.js';
import { publicSigningView, WITHHELD_FIELDS } from '../lib/publicSigningView.js';
import { computeInvestigationQualityGaps } from '../lib/investigationQuality.js';
import { SignedRecordModal } from '../components/SignedRecordModal.jsx';
import { ResponseReviewForm } from '../components/ResponseReviewForm.jsx';

// ─────────────────────────────────────────────────────────────────────────
// TRUST-SIG-03 — EMPLOYEE RESPONSE, DISPUTED NOTES, CONTROLLED CORRECTION.
//
// ┌─ WHAT THIS SLICE EXISTS TO MAKE IMPOSSIBLE ─────────────────────────────┐
// │ A meeting record must never become a false binary of                     │
// │   SIGNED   = AGREED                                                     │
// │   COMMENT  = DISPUTED                                                   │
// │                                                                         │
// │ Three distinct things an employee can say were previously all funnelled   │
// │ through one optional free-text box:                                     │
// │   A  this is an accurate record                                         │
// │   B  broadly accurate, but I want to add something                       │
// │   C  something in it is inaccurate or missing                           │
// │                                                                         │
// │ And C was not even representable ALONGSIDE a signature: status           │
// │ 'disputed' writes no signature at all, so "I received this AND I think   │
// │ it is wrong" had no shape in the data.                                  │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THE ASSERTIONS BELOW ARE BEHAVIOURAL WHERE BEHAVIOUR IS THE CLAIM. Where a
// claim is genuinely about source text (an allow-list's contents, a submit path
// being gated), comments are STRIPPED FIRST — this file documents the defects it
// closes, and every previous slice found at least one assertion that was really
// matching its own prose.
// ─────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

/**
 * Source with comments removed, so no assertion can pass on prose.
 *
 * This helper exists because every slice before this one shipped at least one
 * assertion that was really matching its own explanatory comment. It asserts the
 * strip DID something, so "nothing to strip" can never be mistaken for proof.
 */
function codeOnly(text) {
  const out = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');   // SQL files comment with --, not //
  expect(out.length).toBeLessThan(text.length);
  return out;
}

const signedRow = (over = {}) => ({
  sign_id: 'sg-1', org_id: 'org-1', status: 'signed',
  document: '# Meeting record\n\nThe employee said the delivery was late.',
  signature: 'data:image/png;base64,AAA', signed_at: '2026-10-06T22:04:10.000Z',
  employee_name: 'ZZ Test Employee', employee_email: 'zz@example.test',
  superseded_at: null, expires_at: '2026-11-06T00:00:00.000Z',
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the three answers are three different facts', () => {
  it('A, B and C are distinct classifications, and none of them is a status', () => {
    expect(RESPONSE_TYPES).toEqual(['accurate', 'comment', 'disputed']);
    expect(new Set(RESPONSE_TYPES).size).toBe(3);
    // The participant-status vocabulary is NOT widened by this slice. If it ever
    // is, every reader's status map silently falls out of date.
    const sql = read('supabase/employee_response_classification_2026-10-07.sql');
    expect(codeOnly(sql)).not.toMatch(/signing_requests_status_valid/);
  });

  it('"broadly accurate, but…" is NOT a dispute', () => {
    const row = signedRow({ response_type: RESPONSE_TYPE.COMMENT, participant_comment: 'I would add that I offered to stay late.' });
    expect(challengesAccuracy(row)).toBe(false);
    expect(awaitsEmployerReview(row)).toBe(false);
    expect(confirmationSemanticsFor('signed', row).stateLine).toBe('Signed with comments');
  });

  it('confirming accuracy is recorded, and does NOT become agreement with the findings', () => {
    const row = signedRow({ response_type: RESPONSE_TYPE.ACCURATE });
    expect(confirmsAccuracy(row)).toBe(true);
    const sem = confirmationSemanticsFor('signed', row);
    // The brief: do not overstate this as agreement with findings, allegations or
    // decisions. So the claim tested is about WORDING. `impliesAgreement` is
    // deliberately NOT asserted here — despite its name it only selects a heading
    // colour (SignedRecordModal) and is true for plain `signed` by established,
    // UAT-passed behaviour this slice does not touch.
    expect(sem.stateLine).toBe('Signed');
    const wording = `${sem.heading} ${sem.stateLine} ${sem.badgeLabel} ${sem.detail || ''}`;
    expect(wording).not.toMatch(/agree|accept|finding|allegation|guilt/i);
    // A is NOT escalated: nothing to review, nothing for the manager to do.
    expect(awaitsEmployerReview(row)).toBe(false);
    expect(sem.managerActionRequired).toBe(false);
  });

  it('a signature and a dispute coexist — the defect this slice closes', () => {
    const row = signedRow({
      response_type: RESPONSE_TYPE.DISPUTED,
      participant_comment: 'I never said the delivery was late.',
      proposed_correction: 'I said the delivery was booked for the Friday.',
    });
    // Both facts survive, on their own axes.
    expect(row.status).toBe('signed');
    expect(row.signature).toBeTruthy();
    expect(challengesAccuracy(row)).toBe(true);
    const sem = confirmationSemanticsFor('signed', row);
    expect(sem.signatureCaptured).toBe(true);     // receipt was captured
    expect(sem.impliesAgreement).toBe(false);     // and means only receipt
    expect(sem.stateLine).toBe('Signed — notes disputed');
  });

  it('signing never converts a disputed record into an accepted one', () => {
    const row = signedRow({ response_type: RESPONSE_TYPE.DISPUTED, participant_comment: 'x', proposed_correction: 'y' });
    const sem = confirmationSemanticsFor('signed', row);
    expect(sem.impliesAgreement).toBe(false);
    expect(sem.managerActionRequired).toBe(true);
    expect(sem.responseAwaitsReview).toBe(true);
  });

  it('the word "Rejected" is not used for any of this', () => {
    for (const t of RESPONSE_TYPES) {
      for (const st of ['signed', 'acknowledged', 'disputed']) {
        const sem = confirmationSemanticsFor(st, signedRow({ status: st, response_type: t, participant_comment: 'c', proposed_correction: 'p' }));
        expect(`${sem.heading} ${sem.stateLine} ${sem.badgeLabel}`.toLowerCase()).not.toMatch(/reject/);
      }
    }
    for (const r of RESOLUTIONS) expect(resolutionLabel(r).toLowerCase()).not.toMatch(/reject/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('no historical reinterpretation', () => {
  it('a pre-TRUST-SIG-03 comment is not a dispute, however it reads', () => {
    // The real shape of the production Sam Testcase row: a comment, no
    // classification, because none existed when it was written.
    const legacy = signedRow({ participant_comment: 'This is completely wrong and I disagree with all of it.' });
    expect(isClassified(legacy)).toBe(false);
    expect(responseTypeOf(legacy)).toBe(null);
    expect(challengesAccuracy(legacy)).toBe(false);
    expect(awaitsEmployerReview(legacy)).toBe(false);
    expect(confirmationSemanticsFor('signed', legacy).stateLine).toBe('Signed with comments');
  });

  it('the migration backfills nothing and infers nothing from comment text', () => {
    const sql = codeOnly(read('supabase/employee_response_classification_2026-10-07.sql'));
    expect(sql).not.toMatch(/\bupdate\s+public\.signing_requests/i);
    expect(sql).not.toMatch(/participant_comment\s*(ilike|~|like)/i);
    // Additive DDL only.
    expect(sql).toMatch(/add column if not exists\s+response_type/i);
  });

  it('an unclassified row is left alone by the investigation quality check', () => {
    const cs = { id: 'c1', meetings: [{ id: 'm1', type: 'Investigation', date: '02/10/2026', participant_comment: 'I disagree' }] };
    const gaps = computeInvestigationQualityGaps(cs, [], []);
    expect(gaps.join(' ')).not.toMatch(/inaccurate or incomplete/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('what the employee must supply', () => {
  it('A needs nothing more; B needs words; C needs words AND a proposed correction', () => {
    expect(validateEmployeeResponse({ responseType: RESPONSE_TYPE.ACCURATE }).ok).toBe(true);

    expect(validateEmployeeResponse({ responseType: RESPONSE_TYPE.COMMENT, comment: '   ' }).ok).toBe(false);
    expect(validateEmployeeResponse({ responseType: RESPONSE_TYPE.COMMENT, comment: 'Please add that I asked for a break.' }).ok).toBe(true);

    expect(validateEmployeeResponse({ responseType: RESPONSE_TYPE.DISPUTED, comment: '' }).ok).toBe(false);
    expect(validateEmployeeResponse({ responseType: RESPONSE_TYPE.DISPUTED, comment: 'Paragraph two is wrong.' }).ok).toBe(false);
    expect(validateEmployeeResponse({
      responseType: RESPONSE_TYPE.DISPUTED, comment: 'Paragraph two is wrong.', proposedCorrection: 'It should say I reported it the same day.',
    }).ok).toBe(true);
  });

  it('an unclassified submission is still accepted — a signature is never lost to a new field', () => {
    for (const v of [undefined, null, '']) {
      expect(validateEmployeeResponse({ responseType: v, comment: '' })).toEqual({ ok: true, responseType: null });
    }
    expect(validateEmployeeResponse({ responseType: 'something_else' }).ok).toBe(false);
  });

  it('the employee is never asked to identify a field, paragraph number or record id', () => {
    const page = codeOnly(read('public/sign.html'));
    const prompts = page.match(/>[^<>]{12,160}</g) || [];
    const visible = prompts.join(' ').toLowerCase();
    expect(visible).toMatch(/is this an accurate record of the meeting\?/);
    expect(visible).not.toMatch(/paragraph number|field name|record id|sign_id|database/);
  });

  it('the page asks the accuracy question instead of "Anything you want to add?"', () => {
    const page = read('public/sign.html');
    expect(page).toMatch(/Is this an accurate record of the meeting\?/);
    expect(page).not.toMatch(/Anything you want to add\?/);
    for (const label of [
      'Yes, this is an accurate record',
      'It is broadly accurate, but I want to add something',
      'I believe something is inaccurate or missing',
    ]) expect(page).toContain(label);
  });

  it('every submit path on the public page is gated on the answer', () => {
    const page = codeOnly(read('public/sign.html'));
    for (const fn of ['submitSignature', 'submitAcknowledgement', 'submitDispute']) {
      const from = page.indexOf(`function ${fn}()`);
      expect(from).toBeGreaterThan(-1);
      const body = page.slice(from, page.indexOf('\n    }', from));
      expect(body).toMatch(/if \(!accuracyReady\(\)\) return;/);
      expect(body).toMatch(/responseType: accuracyChoice\(\)/);
    }
  });

  it('the signature still means receipt, never agreement', () => {
    const page = read('public/sign.html');
    expect(page).toMatch(/I confirm I have read and received this record/);
    expect(page).not.toMatch(/I agree with everything/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the response patch writes facts and nothing else', () => {
  const at = new Date('2026-10-06T22:04:10.000Z');

  it('a disputed classification can ride along with a real signature', () => {
    const patch = participantResponsePatch('signed', {
      signature: 'data:image/png;base64,ZZZ', comment: 'Paragraph two is wrong.',
      responseType: RESPONSE_TYPE.DISPUTED, proposedCorrection: 'It should say I reported it the same day.', now: at,
    });
    expect(patch.status).toBe('signed');
    expect(patch.signature).toBe('data:image/png;base64,ZZZ');
    expect(patch.signed_at).toBe('2026-10-06T22:04:10.000Z');
    expect(patch.response_type).toBe('disputed');
    expect(patch.proposed_correction).toBe('It should say I reported it the same day.');
    // It must NOT touch the record, nor pre-empt the employer's conclusion.
    expect(patch).not.toHaveProperty('document');
    expect(patch).not.toHaveProperty('response_resolution');
    expect(patch).not.toHaveProperty('response_addendum');
  });

  it('a proposed correction is only stored against an actual challenge', () => {
    const patch = participantResponsePatch('signed', {
      signature: 's', comment: 'Add this please', responseType: RESPONSE_TYPE.COMMENT,
      proposedCorrection: 'smuggled rewrite', now: at,
    });
    expect(patch.response_type).toBe('comment');
    expect(patch).not.toHaveProperty('proposed_correction');
  });

  it('timestamps are the server clock, never a body value', () => {
    const patch = participantResponsePatch('signed', { signature: 's', comment: 'c', signedAt: '1999-01-01T00:00:00.000Z', now: at });
    expect(patch.signed_at).toBe('2026-10-06T22:04:10.000Z');
    expect(patch.participant_comment_at).toBe('2026-10-06T22:04:10.000Z');
  });

  it('an unclassified submission writes no classification at all', () => {
    const patch = participantResponsePatch('signed', { signature: 's', now: at });
    expect(patch).not.toHaveProperty('response_type');
    expect(patch).not.toHaveProperty('proposed_correction');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the employer resolution', () => {
  it('offers exactly four conclusions, and no "dismiss"', () => {
    expect(RESOLUTIONS).toEqual(['correction_accepted', 'partially_accepted', 'original_retained', 'addendum_added']);
    const joined = RESOLUTIONS.map(resolutionLabel).join(' ').toLowerCase();
    expect(joined).not.toMatch(/dismiss|ignore|delete|reject/);
  });

  it('requires a reason for everything except a straightforward full acceptance', () => {
    expect(resolutionNeedsReason(RESOLUTION.CORRECTION_ACCEPTED)).toBe(false);
    expect(resolutionNeedsReason(RESOLUTION.PARTIALLY_ACCEPTED)).toBe(true);
    expect(resolutionNeedsReason(RESOLUTION.ORIGINAL_RETAINED)).toBe(true);
    expect(resolutionNeedsReason(RESOLUTION.ADDENDUM_ADDED)).toBe(true);

    expect(validateResolution({ resolution: RESOLUTION.ORIGINAL_RETAINED, reason: '  ' }).ok).toBe(false);
    expect(validateResolution({ resolution: RESOLUTION.ORIGINAL_RETAINED, reason: 'The audio recording supports the record as written.' }).ok).toBe(true);
    expect(validateResolution({ resolution: RESOLUTION.CORRECTION_ACCEPTED }).ok).toBe(true);
    expect(validateResolution({ resolution: RESOLUTION.ADDENDUM_ADDED, reason: 'r', addendum: '' }).ok).toBe(false);
    expect(validateResolution({ resolution: 'made_it_go_away' }).ok).toBe(false);
  });

  it('records actor and time on every conclusion, and never touches the record or the employee’s words', () => {
    for (const resolution of RESOLUTIONS) {
      const patch = resolutionPatch({
        resolution, reason: 'because', addendum: 'added text',
        actorId: 'user-uuid', now: new Date('2026-10-06T22:30:00.000Z'),
      });
      expect(patch.response_resolved_by).toBe('user-uuid');
      expect(patch.response_resolved_at).toBe('2026-10-06T22:30:00.000Z');
      expect(patch.response_resolution).toBe(resolution);
      for (const forbidden of ['document', 'participant_comment', 'proposed_correction', 'signature', 'signed_at', 'status']) {
        expect(patch).not.toHaveProperty(forbidden);
      }
    }
  });

  it('only resolutions that carry employer text can store an addendum', () => {
    expect(resolutionCarriesAddendum(RESOLUTION.ORIGINAL_RETAINED)).toBe(false);
    expect(resolutionPatch({ resolution: RESOLUTION.ORIGINAL_RETAINED, reason: 'r', addendum: 'sneaky', actorId: 'u' }).response_addendum).toBe(null);
    expect(resolutionPatch({ resolution: RESOLUTION.ADDENDUM_ADDED, reason: 'r', addendum: 'a clarification', actorId: 'u' }).response_addendum).toBe('a clarification');
  });

  it('a resolved challenge stops awaiting review and reads as reviewed', () => {
    const row = signedRow({
      response_type: RESPONSE_TYPE.DISPUTED, participant_comment: 'wrong', proposed_correction: 'right',
      response_resolution: RESOLUTION.ORIGINAL_RETAINED, response_resolution_reason: 'The record stands.',
      response_resolved_at: '2026-10-06T22:30:00.000Z',
    });
    expect(isResolved(row)).toBe(true);
    expect(awaitsEmployerReview(row)).toBe(false);
    const sem = confirmationSemanticsFor('signed', row);
    expect(sem.stateLine).toBe('Signed — response reviewed');
    expect(sem.managerActionRequired).toBe(false);
    expect(sem.heading.toLowerCase()).toMatch(/reviewed/);
    expect(sem.impliesAgreement).toBe(false);
  });

  it('an unresolved challenge is an attention state, not an alarm state', () => {
    const sem = confirmationSemanticsFor('signed', signedRow({ response_type: RESPONSE_TYPE.DISPUTED, participant_comment: 'c', proposed_correction: 'p' }));
    expect(sem.tone).toBe(TONE.ATTENTION);
    expect(sem.tone).not.toBe(TONE.REFUSED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the API boundary', () => {
  const api = codeOnly(read('api/signing.js'));

  it('resolving a response requires an authenticated org member', () => {
    const from = api.indexOf('if (resolveResponse)');
    expect(from).toBeGreaterThan(-1);
    const block = api.slice(from, from + 2600);
    expect(block).toMatch(/requireOrgMembership\(req, res, resolveOrgId\)/);
    expect(block).toMatch(/row\.org_id !== resolveOrgId/);
    // Actor from the verified session, never the body.
    expect(block).toMatch(/actorId: resolveAuth\.user\.id/);
    expect(block).not.toMatch(/actorId:\s*req\.body/);
  });

  it('resolution is applied only while still unresolved, so a replay cannot overwrite it', () => {
    const from = api.indexOf('if (resolveResponse)');
    const block = api.slice(from, from + 2600);
    expect(block).toMatch(/response_resolution=is\.null/);
    expect(block).toMatch(/alreadyResolved: true/);
  });

  it('there is nothing to resolve unless the employee actually challenged accuracy', () => {
    const from = api.indexOf('if (resolveResponse)');
    const block = api.slice(from, from + 2600);
    expect(block).toMatch(/!challengesAccuracy\(row\)/);
  });

  it('resolving adds no serverless function — it is an action on the existing handler', () => {
    // Compass is at 12/12 on the Hobby plan, so a 13th route does not deploy at
    // all. Counted the way Vercel counts: every non-underscore, non-test .js
    // under api/, recursively, including [...action].js catch-alls.
    const root = path.resolve(__dirname, '..', '..', 'api');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      if (!e.name.endsWith('.js') || e.name.startsWith('_') || e.name.endsWith('.test.js')) return [];
      return [path.relative(root, full)];
    });
    const routes = walk(root);
    // Exactly at the cap, not merely under it: if this ever reads 11, something
    // was deleted, and if it reads 13 the deploy is already broken.
    expect(routes.length).toBe(12);
    expect(routes).toContain('signing.js');
    expect(routes.some((r) => /resolve/i.test(r))).toBe(false);
  });

  it('the public link holder is told none of the review machinery', () => {
    const row = signedRow({
      response_type: RESPONSE_TYPE.DISPUTED, proposed_correction: 'their wording',
      response_resolution: RESOLUTION.ORIGINAL_RETAINED, response_resolution_reason: 'internal reasoning',
      response_resolved_by: 'auth-user-uuid', response_resolved_at: '2026-10-06T22:30:00.000Z',
      response_addendum: 'employer text',
    });
    const view = publicSigningView(row);
    for (const field of [
      'response_type', 'proposed_correction', 'response_resolution', 'response_resolution_reason',
      'response_resolved_by', 'response_resolved_at', 'response_addendum',
    ]) {
      expect(view).not.toHaveProperty(field);
      expect(Object.keys(WITHHELD_FIELDS)).toContain(field);
    }
    expect(JSON.stringify(view)).not.toMatch(/auth-user-uuid|internal reasoning/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the signed copy shows the whole chain, separately', () => {
  const meetingFor = (over = {}) => ({
    id: 'm1', type: 'Investigation', date: '02/10/2026', signId: 'sg-1',
    signStatus: 'signed', signerName: 'ZZ Test Employee', record: '# Working copy — edited since', ...over,
  });

  const disputedRow = (over = {}) => signedRow({
    response_type: RESPONSE_TYPE.DISPUTED,
    participant_comment: 'I never said the delivery was late.',
    proposed_correction: 'It should say the delivery was booked for the Friday.',
    ...over,
  });

  it('separates the record, the response, the proposed correction and the signature', async () => {
    render(<SignedRecordModal meeting={meetingFor()} fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={async () => disputedRow()} />);
    expect(await screen.findByText(/The employee said the delivery was late/)).toBeTruthy();
    expect(screen.getByText(/I never said the delivery was late/)).toBeTruthy();
    expect(screen.getByText(/booked for the Friday/)).toBeTruthy();
    expect(screen.getByText(/what ZZ Test Employee says the record should say instead/i)).toBeTruthy();
    // The working copy is never shown in place of what was issued.
    expect(screen.queryByText(/Working copy/)).toBeNull();
  });

  it('heads the copy "requires review" before, and "reviewed" after', async () => {
    const { unmount } = render(<SignedRecordModal meeting={meetingFor()} fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={async () => disputedRow()} />);
    expect(await screen.findByText(/employee response requires review/i)).toBeTruthy();
    unmount();

    render(<SignedRecordModal meeting={meetingFor()} fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={async () => disputedRow({
        response_resolution: RESOLUTION.PARTIALLY_ACCEPTED,
        response_resolution_reason: 'The date is corrected; the rest stands.',
        response_resolved_at: '2026-10-06T22:30:00.000Z',
        response_addendum: 'The delivery was booked for the Friday.',
      })} />);
    expect(await screen.findByText(/employee response reviewed/i)).toBeTruthy();
    expect(screen.getByText(/Partially accepted/)).toBeTruthy();
    expect(screen.getByText(/The date is corrected; the rest stands/)).toBeTruthy();
    expect(screen.getByText(/Addendum to the record/i)).toBeTruthy();
  });

  it('never merges the employee’s wording into the record it shows', async () => {
    render(<SignedRecordModal meeting={meetingFor()} fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={async () => disputedRow()} />);
    const recordText = await screen.findByText(/The employee said the delivery was late/);
    // The document panel holds the issued text and nothing the employee wrote.
    expect(recordText.closest('div').textContent).not.toMatch(/booked for the Friday/);
  });

  it('offers no review action where no handler is passed, even on a live dispute', async () => {
    render(<SignedRecordModal meeting={meetingFor()} fmtDate={d => d} onClose={() => {}}
      loadSignedSnapshot={async () => disputedRow()} />);
    await screen.findByText(/I never said the delivery was late/);
    expect(screen.queryByText(/Record this conclusion/)).toBeNull();
  });

  it('offers no review action on a plain comment — there is nothing to adjudicate', async () => {
    render(<SignedRecordModal meeting={meetingFor()} fmtDate={d => d} onClose={() => {}}
      onResolveResponse={async () => ({ ok: true })}
      loadSignedSnapshot={async () => signedRow({ response_type: RESPONSE_TYPE.COMMENT, participant_comment: 'Please add that I offered to stay late.' })} />);
    await screen.findByText(/offered to stay late/);
    expect(screen.queryByText(/Record this conclusion/)).toBeNull();
  });

  it('records a conclusion through the handler and shows the outcome', async () => {
    const onResolveResponse = vi.fn(async () => ({
      ok: true,
      request: {
        response_resolution: RESOLUTION.ORIGINAL_RETAINED,
        response_resolution_reason: 'The contemporaneous note supports the record.',
        response_addendum: null,
        response_resolved_at: '2026-10-06T22:30:00.000Z',
      },
    }));
    render(<SignedRecordModal meeting={meetingFor()} fmtDate={d => d} onClose={() => {}}
      onResolveResponse={onResolveResponse} loadSignedSnapshot={async () => disputedRow()} />);

    fireEvent.click(await screen.findByLabelText(/Original record retained/));
    fireEvent.change(screen.getByLabelText(/Why have you reached this conclusion\?/), {
      target: { value: 'The contemporaneous note supports the record.' },
    });
    fireEvent.click(screen.getByText('Record this conclusion'));

    await waitFor(() => expect(onResolveResponse).toHaveBeenCalledTimes(1));
    expect(onResolveResponse.mock.calls[0][0]).toMatchObject({
      signId: 'sg-1', resolution: RESOLUTION.ORIGINAL_RETAINED,
      reason: 'The contemporaneous note supports the record.', addendum: '',
    });
    // And the modal now reads as reviewed, with the employee's words still there.
    expect(await screen.findByText(/employee response reviewed/i)).toBeTruthy();
    expect(screen.getByText(/I never said the delivery was late/)).toBeTruthy();
    expect(screen.queryByText(/Record this conclusion/)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the review form', () => {
  it('will not submit without a conclusion', () => {
    const onSubmit = vi.fn();
    render(<ResponseReviewForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Record this conclusion'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Choose how this response is resolved/);
  });

  it('will not retain the original record without saying why', () => {
    const onSubmit = vi.fn();
    render(<ResponseReviewForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText(/Original record retained/));
    fireEvent.click(screen.getByText('Record this conclusion'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/Record why you have reached this conclusion/);
  });

  it('accepts a correction in full with no reason, because none is owed', () => {
    const onSubmit = vi.fn();
    render(<ResponseReviewForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText(/Correction accepted/));
    fireEvent.click(screen.getByText('Record this conclusion'));
    expect(onSubmit).toHaveBeenCalledWith({ resolution: RESOLUTION.CORRECTION_ACCEPTED, reason: '', addendum: '' });
  });

  it('asks for the addendum text only where one is being written', () => {
    render(<ResponseReviewForm onSubmit={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Original record retained/));
    expect(screen.queryByLabelText(/clarification to add/i)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Clarification added/));
    expect(screen.getByLabelText(/clarification to add/i)).toBeTruthy();
  });

  it('offers no way to dismiss or delete the response', () => {
    render(<ResponseReviewForm onSubmit={() => {}} />);
    const text = document.body.textContent.toLowerCase();
    for (const word of ['dismiss', 'delete', 'remove', 'reject', 'discard']) expect(text).not.toMatch(word);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('process gating is a warning, not a wall', () => {
  const disputedMeeting = {
    id: 'm1', type: 'Investigation', date: '02/10/2026',
    responseType: RESPONSE_TYPE.DISPUTED, participantComment: 'wrong', proposedCorrection: 'right',
  };

  it('an unresolved challenge is surfaced before the investigation is submitted', () => {
    const gaps = computeInvestigationQualityGaps({ id: 'c1', meetings: [disputedMeeting] }, [], []);
    expect(gaps.join(' ')).toMatch(/inaccurate or incomplete/);
    expect(gaps.join(' ')).toMatch(/has not been reviewed/);
  });

  it('it is a GAP, which Compass already lets a manager proceed past with a recorded reason', () => {
    // The mechanism matters: gaps go to the quality-check modal, whose proceed
    // path requires an override reason. Nothing here blocks permanently.
    const app = codeOnly(read('src/App.jsx'));
    const from = app.indexOf('const proceedPastInvestigationQualityCheck');
    expect(from).toBeGreaterThan(-1);
    expect(app.slice(from, from + 600)).toMatch(/requestOverrideReason\(investigationQualityGaps/);
  });

  it('a reviewed challenge is no longer a gap', () => {
    const gaps = computeInvestigationQualityGaps({
      id: 'c1',
      meetings: [{ ...disputedMeeting, responseResolution: RESOLUTION.ORIGINAL_RETAINED }],
    }, [], []);
    expect(gaps.join(' ')).not.toMatch(/inaccurate or incomplete/);
  });

  it('Compass does not claim the law requires meeting notes to be signed', () => {
    for (const f of ['public/sign.html', 'src/components/SignedRecordModal.jsx', 'src/components/ResponseReviewForm.jsx', 'src/lib/employeeResponse.js']) {
      const text = codeOnly(read(f)).toLowerCase();
      expect(text).not.toMatch(/acas requires|law requires|legally required to sign|required by law/);
    }
  });
});
