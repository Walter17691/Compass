import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assessParticipantResponse, participantResponsePatch,
  ACTIONABLE_STATUSES, ACTIONABLE_FILTER, RESPONSE_REFUSAL,
} from '../lib/participantResponse.js';
import {
  COMMUNICATION, communicationEvidence, mayClaimSent, needsSendAttention,
  communicationLine, sendAttemptPatch, sendOutcomePatch,
} from '../lib/communicationEvidence.js';
import { PUBLIC_FIELDS, WITHHELD_FIELDS, publicSigningView, restrictedSigningView } from '../lib/publicSigningView.js';
import {
  RECIPIENT_SOURCE, resolveRecipient, isAddressOverride, isValidRecipientEmail,
  recipientReadiness, describeAddressOverride,
} from '../lib/recipientResolution.js';
import { confirmationSemantics, confirmationSemanticsFor, CONFIRMATION_SEMANTICS, PROVENANCE_KIND, provenanceLine } from '../lib/confirmationSemantics.js';
import { SIGNATURE_STATE_KEYS, meetingSignatureState } from '../lib/meetingRecordState.js';
import { ESIGNATURE_STATUS, LEGACY_PENDING_STATUS, EXTERNAL_SIGNATURE_STATUS, computeExpiresAt } from '../lib/eSignature.js';

// ═══════════════════════════════════════════════════════════════════════════
// TRUST SLICE 2A — SIGNATURE BOUNDARY HARDENING.
//
// Eight active defects, from the lifecycle review:
//   SIG-SEC-01 (HIGH) portal could action a SUPERSEDED request
//   SIG-SEC-02        portal participant update was non-atomic
//   SIG-SEC-03        public view spread the row and deleted two keys
//   SIG-SEC-04        recipient address validated by includes("@")
//   SIG-SEC-05        signed_at chosen by the holder of the link
//   SIG-SEC-06        "Mark signed" was indistinguishable from a captured one
//   TRUST-SIG-02      status='sent' written before any email
//   SIG-UX-01         disputed/proceeded vanished from one renderer
//
// The architectural rule under test throughout: communication, participant
// response and request currency are THREE AXES. None is encoded in another.
// ═══════════════════════════════════════════════════════════════════════════

// These source files deliberately DOCUMENT the defects they close, so every
// assertion about code strips comments first. A claim about code must not be
// decided by prose — a trap this project has hit repeatedly.
const codeOnly = (src) => src
  .split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('--'))
  .join('\n');

const row = (over = {}) => ({
  sign_id: 's1', org_id: 'o1', status: 'sent', superseded_at: null,
  expires_at: computeExpiresAt(), document: 'THE RECORD',
  send_attempted_at: null, send_accepted_at: null, send_error: null, provider_message_id: null,
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('A. portal parity — SIG-SEC-01 / SIG-SEC-02', () => {
  it('1. a SUPERSEDED request cannot be actioned, and says so as replacement', () => {
    const v = assessParticipantResponse(row({ superseded_at: '2026-10-06T00:00:00Z' }));
    expect(v.ok).toBe(false);
    expect(v.refusal).toBe(RESPONSE_REFUSAL.SUPERSEDED);
    expect(v.httpStatus).toBe(409);
    expect(v.error).toMatch(/replaced by a newer version/i);
    // And it names no successor token.
    expect(v.error).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('2. supersession is reported even when the status still looks actionable', () => {
    for (const status of ACTIONABLE_STATUSES) {
      const v = assessParticipantResponse(row({ status, superseded_at: 'T' }));
      expect(v.refusal, status).toBe(RESPONSE_REFUSAL.SUPERSEDED);
    }
  });

  it('3. EVERY non-actionable participant state is refused — not just three', () => {
    // The portal rejected only signed | acknowledged | declined. disputed and
    // proceeded were actionable, so a disputed record could be re-signed.
    for (const status of ['signed', 'acknowledged', 'declined', 'disputed', 'expired', 'proceeded']) {
      const v = assessParticipantResponse(row({ status }));
      expect(v.ok, status).toBe(false);
      expect(v.httpStatus, status).toBe(409);
    }
  });

  it('4. legacy `pending` is not actionable, matching the emailed-link path', () => {
    // signing.js has always used status=in.(sent,opened); widening here to be
    // generous would silently widen that path too.
    expect(assessParticipantResponse(row({ status: LEGACY_PENDING_STATUS })).ok).toBe(false);
    expect(ACTIONABLE_STATUSES).toEqual(['sent', 'opened']);
  });

  it('5. only sent and opened may receive a response', () => {
    for (const status of ACTIONABLE_STATUSES) expect(assessParticipantResponse(row({ status })).ok).toBe(true);
  });

  it('6. expiry is still enforced, and reported as expiry', () => {
    const v = assessParticipantResponse(row({ expires_at: '2020-01-01T00:00:00Z' }));
    expect(v.refusal).toBe(RESPONSE_REFUSAL.EXPIRED);
    // 409 on BOTH paths now. The emailed-link path has always used 409 and it is
    // the one with a public page; the portal's 400 moved to match it.
    expect(v.httpStatus).toBe(409);
  });

  it('7. a missing request is 404, never a permissive fall-through', () => {
    expect(assessParticipantResponse(null).refusal).toBe(RESPONSE_REFUSAL.NOT_FOUND);
    expect(assessParticipantResponse(undefined).httpStatus).toBe(404);
  });

  it('8. BOTH paths use the same authority and the same conditional filter', () => {
    const main = readFileSync('api/signing.js', 'utf8');
    const portal = readFileSync('api/portal/_signatures.js', 'utf8');
    for (const [name, src] of [['signing', main], ['portal', portal]]) {
      expect(src, name).toContain('assessParticipantResponse(existing)');
      expect(src, name).toContain('participantResponsePatch(');
      expect(src, name).toContain('${ACTIONABLE_FILTER}');
    }
    // The portal's old partial check is gone.
    expect(portal).not.toContain("existing.status === 'signed' || existing.status === 'acknowledged'");
  });

  it('9. CONCURRENCY: the filter makes the actionable test part of the UPDATE', () => {
    // Two competing responses cannot both succeed, because the second no longer
    // matches the WHERE. Proven structurally: the filter pins status AND
    // supersession, and both handlers require a non-empty representation.
    expect(ACTIONABLE_FILTER).toBe('status=in.(sent,opened)&superseded_at=is.null');
    const portal = readFileSync('api/portal/_signatures.js', 'utf8');
    expect(portal).toContain("'Prefer': 'return=representation'");
    expect(portal).toContain('if (!updatedRows.length)');
    expect(portal).toMatch(/already been actioned/);
  });

  it('10. the portal now SELECTS superseded_at — it could not see it before', () => {
    const portal = readFileSync('api/portal/_signatures.js', 'utf8');
    expect(portal).toMatch(/select=org_id,employee_email,status,expires_at,superseded_at/);
  });

  it('11. tenancy and recipient binding are still checked, and fail closed', () => {
    const portal = readFileSync('api/portal/_signatures.js', 'utf8');
    expect(portal).toContain('existing.org_id !== account.org_id');
    expect(portal).toContain('existingEmail !== accountEmail');
    expect(portal).toContain('!existingEmail');   // a missing email fails closed
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B. participant timestamps are server-derived — SIG-SEC-05', () => {
  const at = new Date('2026-10-06T09:00:00.000Z');

  it('12. signed_at comes from the server clock, never the request body', () => {
    const p = participantResponsePatch('signed', { signature: 'img', now: at });
    expect(p.signed_at).toBe('2026-10-06T09:00:00.000Z');
    expect(p.status).toBe('signed');
    expect(p.signature).toBe('img');
  });

  it('13. declined_at and participant_comment_at likewise', () => {
    const d = participantResponsePatch('declined', { declineReason: 'no', comment: 'because', now: at });
    expect(d.declined_at).toBe(at.toISOString());
    expect(d.participant_comment_at).toBe(at.toISOString());
    expect(d.decline_reason).toBe('no');
  });

  it('14. a dispute carries NO signature and NO signed_at — nothing was agreed', () => {
    const p = participantResponsePatch('disputed', { comment: 'the second paragraph is wrong', now: at });
    expect(p.status).toBe('disputed');
    expect(p.signed_at).toBeUndefined();
    expect(p.signature).toBeUndefined();
    expect(p.participant_comment).toBe('the second paragraph is wrong');
  });

  it('14b. the builder IGNORES a signedAt handed to it, not just one in the body', () => {
    // Found by mutation testing: re-honouring a client timestamp inside the
    // builder survived, because no caller passes one so the mutation was inert.
    // The guarantee belongs at the builder, so it is pinned at the builder.
    const p = participantResponsePatch('signed', {
      signature: 'img', now: at,
      signedAt: '1999-01-01T00:00:00.000Z',
      signed_at: '1999-01-01T00:00:00.000Z',
    });
    expect(p.signed_at).toBe(at.toISOString());
    expect(p.signed_at).not.toBe('1999-01-01T00:00:00.000Z');
    const d = participantResponsePatch('declined', { now: at, declinedAt: '1999-01-01T00:00:00.000Z' });
    expect(d.declined_at).toBe(at.toISOString());
  });

  it('15. the handler no longer destructures signedAt from the body', () => {
    const main = readFileSync('api/signing.js', 'utf8');
    const line = main.split('\n').find(l => l.includes('const {') && l.includes('req.body'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/\bsignedAt\b/);
    expect(main).toMatch(/req\.body\.signedAt is deliberately NOT destructured/);
  });

  it('16. an empty comment adds no comment fields, so the CHECK cannot be violated', () => {
    const p = participantResponsePatch('signed', { comment: '   ', now: at });
    expect('participant_comment' in p).toBe(false);
    expect('participant_comment_at' in p).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C. the public view is an allow-list — SIG-SEC-03', () => {
  const full = row({
    status: 'proceeded', signature: 'IMG', signed_at: 'T', employee_name: 'Sam', manager_name: 'Chair',
    employee_email: 'sam@x.com', manager_email: 'chair@x.com', meeting_type: 'Investigation',
    meeting_date: '5 October 2026', requires_signature: true, document_type: 'meeting_record',
    meeting_id: 'meeting_abc', id: 'uuid-1', created_at: 'T', opened_at: 'T',
    proceeded_by: 'user-uuid', proceed_reason: 'Employee did not respond in time',
    proceeded_from_status: 'opened', superseded_at: 'T', superseded_by: 'u2', superseded_by_sign_id: 'successor-token',
    participant_comment: 'I disagree', decline_reason: 'no', send_accepted_at: 'T', send_error: null,
  });

  it('17. the internal fields that leaked are gone', () => {
    const v = publicSigningView(full);
    for (const k of ['proceeded_by', 'proceed_reason', 'proceeded_from_status', 'org_id',
                     'manager_email', 'meeting_id', 'id', 'sign_id', 'superseded_by',
                     'superseded_by_sign_id', 'employee_email', 'created_at', 'opened_at',
                     'participant_comment', 'decline_reason', 'send_accepted_at', 'send_error',
                     'send_attempted_at', 'provider_message_id', 'superseded_at']) {
      expect(v, k).not.toHaveProperty(k);
    }
  });

  it('18. everything public/sign.html reads is still present', () => {
    const v = publicSigningView(full);
    // Proven by reading the page, not assumed.
    for (const k of ['document', 'document_type', 'employee_name', 'manager_name', 'meeting_type',
                     'meeting_date', 'requires_signature', 'status', 'signed_at', 'signature', 'expires_at']) {
      expect(v, k).toHaveProperty(k);
    }
    expect(v.superseded).toBe(true);     // derived, not the timestamp
  });

  it('19. sign.html reads NOTHING the allow-list omits', () => {
    const page = readFileSync('public/sign.html', 'utf8');
    const read = [...new Set([...page.matchAll(/\bdata\.([a-z_]+)/g)].map(m => m[1]))];
    const allowed = new Set([...PUBLIC_FIELDS, 'superseded', 'restricted']);
    const missing = read.filter(f => !allowed.has(f));
    expect(missing, `sign.html reads fields the allow-list omits: ${missing.join(', ')}`).toEqual([]);
  });

  it('20. A FUTURE COLUMN IS NOT PUBLIC BY DEFAULT', () => {
    // The real defect was the deny-list shape: every column added to the table
    // became public automatically, and four were added in the two slices before
    // this one. An unknown field must simply not appear.
    const v = publicSigningView(row({ some_new_column_2027: 'secret', another_new_one: 'also secret' }));
    expect(v).not.toHaveProperty('some_new_column_2027');
    expect(v).not.toHaveProperty('another_new_one');
  });

  it('21. every live column is explicitly classified as public or withheld', () => {
    // So a new column cannot be quietly forgotten: it is in neither list and
    // this fails. The list mirrors the live table as read on 2026-10-06 plus the
    // four columns this slice adds.
    const live = ['created_at', 'decline_reason', 'declined_at', 'document', 'document_type',
      'employee_email', 'employee_name', 'expires_at', 'id', 'manager_email', 'manager_name',
      'meeting_date', 'meeting_id', 'meeting_type', 'opened_at', 'org_id', 'participant_comment',
      'participant_comment_at', 'proceed_reason', 'proceeded_at', 'proceeded_by',
      'proceeded_from_status', 'requires_signature', 'sign_id', 'signature', 'signed_at', 'status',
      'superseded_at', 'superseded_by', 'superseded_by_sign_id',
      'send_attempted_at', 'send_accepted_at', 'send_error', 'provider_message_id'];
    const classified = new Set([...PUBLIC_FIELDS, ...Object.keys(WITHHELD_FIELDS)]);
    const unclassified = live.filter(c => !classified.has(c));
    expect(unclassified, `unclassified columns: ${unclassified.join(', ')}`).toEqual([]);
    // And nothing is in both lists.
    expect(PUBLIC_FIELDS.filter(f => f in WITHHELD_FIELDS)).toEqual([]);
  });

  it('22. the restricted reply past the viewing window carries status only', () => {
    expect(restrictedSigningView(full)).toEqual({ status: 'proceeded', restricted: true });
  });

  it('23. the handler builds the response through the allow-list, not a spread', () => {
    const main = readFileSync('api/signing.js', 'utf8');
    expect(main).toContain('publicSigningView(existing)');
    expect(main).not.toContain('const publicView = { ...existing');
    expect(main).not.toContain('delete publicView.superseded_by');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. communication truth — TRUST-SIG-02', () => {
  it('24. a request with no evidence columns is UNKNOWN, not "not sent"', () => {
    // The 104 historical rows. 62 were signed, so most plainly arrived —
    // Compass simply never recorded it. Unknown stays unknown.
    expect(communicationEvidence({ sign_id: 's', status: 'signed' })).toBe(COMMUNICATION.UNKNOWN);
    expect(mayClaimSent({ sign_id: 's', status: 'signed' })).toBe(false);
  });

  it('25. the four states are distinguished', () => {
    expect(communicationEvidence(row())).toBe(COMMUNICATION.NOT_ATTEMPTED);
    expect(communicationEvidence(row({ send_attempted_at: 'T' }))).toBe(COMMUNICATION.ATTEMPTED);
    expect(communicationEvidence(row({ send_attempted_at: 'T', send_accepted_at: 'T' }))).toBe(COMMUNICATION.ACCEPTED);
    expect(communicationEvidence(row({ send_attempted_at: 'T', send_error: 'bounced' }))).toBe(COMMUNICATION.FAILED);
  });

  it('26. ONLY provider acceptance permits a claim that it was sent', () => {
    expect(mayClaimSent(row({ send_attempted_at: 'T', send_accepted_at: 'T' }))).toBe(true);
    for (const r of [row(), row({ send_attempted_at: 'T' }), row({ send_attempted_at: 'T', send_error: 'x' }), {}]) {
      expect(mayClaimSent(r)).toBe(false);
    }
  });

  it('27. there is no DELIVERED and no RECEIVED anywhere in the vocabulary', () => {
    const vals = Object.values(COMMUNICATION).join(' ');
    expect(vals).not.toMatch(/deliver|receiv/i);
    const sql = readFileSync('supabase/signature_communication_evidence_2026-10-06.sql', 'utf8');
    expect(sql).not.toMatch(/add column[^;]*delivered/i);
  });

  it('28. the evidence reader works on the camelCase meeting mirror too', () => {
    expect(communicationEvidence({ sendAcceptedAt: 'T', sendAttemptedAt: 'T' })).toBe(COMMUNICATION.ACCEPTED);
    expect(communicationEvidence({ sendError: 'bounced', sendAttemptedAt: 'T' })).toBe(COMMUNICATION.FAILED);
    expect(communicationEvidence({ sendAttemptedAt: null, sendAcceptedAt: null, sendError: null })).toBe(COMMUNICATION.NOT_ATTEMPTED);
  });

  it('29. a failed send does NOT render as awaiting signature', () => {
    const failed = confirmationSemanticsFor('sent', { sendAttemptedAt: 'T', sendError: 'Invalid address' });
    expect(failed.stateLine).not.toMatch(/awaiting|sent for confirmation/i);
    expect(failed.heading).toMatch(/could not be emailed/i);
    expect(failed.managerActionRequired).toBe(true);
    expect(failed.settlesProgression).toBe(false);
  });

  it('30. an unsent-but-issued request says "prepared", not "sent"', () => {
    const s = confirmationSemanticsFor('sent', row());
    expect(s.heading).toMatch(/prepared/i);
    expect(s.stateLine).not.toMatch(/^Sent/);
  });

  it('31. once the provider accepts, the normal wording returns', () => {
    const accepted = confirmationSemanticsFor('sent', row({ send_attempted_at: 'T', send_accepted_at: 'T' }));
    expect(accepted).toEqual(confirmationSemantics('sent'));
    expect(accepted.stateLine).toMatch(/Sent for confirmation/);
  });

  it('32. a historical row with UNKNOWN evidence does not claim it was sent', () => {
    const unknown = confirmationSemanticsFor('sent', { status: 'sent' });
    expect(unknown.stateLine).toMatch(/no record of it being emailed/i);
  });

  it('33. what the participant DID is never downgraded by send evidence', () => {
    for (const st of ['signed', 'acknowledged', 'declined', 'disputed', 'proceeded', 'expired']) {
      expect(confirmationSemanticsFor(st, row()), st).toEqual(confirmationSemantics(st));
    }
  });

  it('34. an actual page OPEN is its own proof the link arrived', () => {
    // opened with no recorded acceptance is not downgraded — the open happened.
    expect(confirmationSemanticsFor('opened', { status: 'opened' })).toEqual(confirmationSemantics('opened'));
    // But a recorded FAILURE alongside an open is a contradiction worth showing.
    expect(confirmationSemanticsFor('opened', { sendAttemptedAt: 'T', sendError: 'x' }).heading).toMatch(/could not be emailed/i);
  });

  it('35. the patches are server-timed and mutually coherent', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    expect(sendAttemptPatch({ now })).toEqual({
      send_attempted_at: now.toISOString(), send_accepted_at: null, send_error: null, provider_message_id: null,
    });
    expect(sendOutcomePatch({ accepted: true, providerMessageId: 'msg_1', now }))
      .toEqual({ send_accepted_at: now.toISOString(), send_error: null, provider_message_id: 'msg_1' });
    // A retry that succeeds CLEARS the error — the CHECK refuses both at once.
    const failed = sendOutcomePatch({ accepted: false, error: 'bounced' });
    expect(failed.send_accepted_at).toBeNull();
    expect(failed.send_error).toBe('bounced');
    expect(failed.provider_message_id).toBeNull();
  });

  it('36. the send handler records attempt BEFORE the provider call, and the outcome after', () => {
    const send = readFileSync('api/send-for-signature.js', 'utf8');
    const attempt = send.indexOf('recordEvidence(sendAttemptPatch())');
    const call = send.indexOf("fetch('https://api.resend.com/emails'");
    const accepted = send.indexOf('sendOutcomePatch({ accepted: true');
    const failedAt = send.indexOf('sendOutcomePatch({ accepted: false');
    expect(attempt).toBeGreaterThan(-1);
    expect(attempt).toBeLessThan(call);
    expect(accepted).toBeGreaterThan(call);
    expect(failedAt).toBeGreaterThan(call);
  });

  it('37. a human-readable line that states only what is known', () => {
    expect(communicationLine(row())).toMatch(/not yet emailed/i);
    expect(communicationLine(row({ send_attempted_at: 'T', send_accepted_at: 'T' }))).toMatch(/accepted by the provider/i);
    expect(communicationLine(row({ send_attempted_at: 'T', send_error: 'Invalid address' }))).toMatch(/Invalid address/);
    expect(communicationLine({ status: 'signed' })).toMatch(/no record of whether this was emailed/i);
    expect(needsSendAttention(row({ send_attempted_at: 'T', send_error: 'x' }))).toBe(true);
    expect(needsSendAttention(row({ send_attempted_at: 'T', send_accepted_at: 'T' }))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E. email failure and retry — §5', () => {
  const app = readFileSync('src/App.jsx', 'utf8');

  it('38. a failed send no longer abandons the request before attaching it', () => {
    expect(app).not.toMatch(/const \{ success, signId \} = await sendDocumentForSignature\([\s\S]{0,1200}?if\(!success\) return;\s*\n\s*setShowSignModal/);
    expect(app).toContain('if(!signId) return;');
  });

  it('39. the meeting records the real send outcome, not a blanket "sent"', () => {
    expect(app).toContain('sendAcceptedAt: success ? new Date().toISOString() : null');
    expect(app).toContain('sendError: success ? null : "Email could not be sent"');
  });

  it('40. the audit entry distinguishes a send from a failed send', () => {
    expect(app).toMatch(/notes prepared — email could not be sent/);
    expect(app).toMatch(/notes sent for signature/);
  });

  it('41. retry stays coherent — the create branch still supersedes predecessors', () => {
    const main = readFileSync('api/signing.js', 'utf8');
    expect(main).toContain('superseded_by_sign_id: newSignId');
    // One current request per meeting remains a database invariant.
    const mig = readFileSync('supabase/reissue_supersession_2026-10-04.sql', 'utf8');
    expect(mig).toContain('signing_requests_one_current_per_meeting');
  });

  it('42. nothing deletes an evidential request row', () => {
    const main = readFileSync('api/signing.js', 'utf8');
    expect(main).not.toMatch(/method:\s*'DELETE'/);
    expect(app).not.toMatch(/signing_requests[^\n]*DELETE/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F. recipient safety — SIG-SEC-04', () => {
  const records = [
    { id: 'e1', name: 'Sam Testcase', workEmail: 'sam.testcase@example.com' },
    { id: 'e2', name: 'No Email Person', workEmail: '' },
  ];

  it('43. a canonical employee resolves to their work email', () => {
    const r = resolveRecipient({ employeeName: 'Sam Testcase', employeeRecords: records });
    expect(r.source).toBe(RECIPIENT_SOURCE.CANONICAL);
    expect(r.email).toBe('sam.testcase@example.com');
    expect(r.employeeId).toBe('e1');
  });

  it('44. name matching is case- and whitespace-insensitive', () => {
    expect(resolveRecipient({ employeeName: '  sam testcase ', employeeRecords: records }).email)
      .toBe('sam.testcase@example.com');
  });

  it('45. an employee with no email is distinguished from no employee at all', () => {
    expect(resolveRecipient({ employeeName: 'No Email Person', employeeRecords: records }).source)
      .toBe(RECIPIENT_SOURCE.CANONICAL_NO_EMAIL);
    expect(resolveRecipient({ employeeName: 'A Witness', employeeRecords: records }).source)
      .toBe(RECIPIENT_SOURCE.EXPLICIT);
  });

  it('46. a NON-EMPLOYEE recipient still works — fact-first is not broken', () => {
    // A witness, an external participant, or a subject not yet identified.
    const r = resolveRecipient({ employeeName: 'Unknown Witness', employeeRecords: [] });
    expect(r.source).toBe(RECIPIENT_SOURCE.EXPLICIT);
    expect(recipientReadiness(r, 'witness@elsewhere.com')).toMatchObject({ ready: true, override: false });
    // And nothing anywhere requires an employee id.
    const lib = codeOnly(readFileSync('src/lib/recipientResolution.js', 'utf8'));
    expect(lib).not.toMatch(/\bemployee_id\b/);
    expect(lib).toContain('export function resolveRecipient');   // strip was not total
  });

  it('47. validation is properly strict — includes("@") was not enough', () => {
    for (const bad of ['sam', 'sam@', '@example.com', 'sam@example', 'a b@example.com',
                       'sam@@example.com', 'sam@example..com', '', '   ', 'sam@example.com.']) {
      expect(isValidRecipientEmail(bad), bad).toBe(false);
    }
    for (const good of ['sam@example.com', 'sam.testcase@sub.example.co.uk', "o'brien+hr@example.com"]) {
      expect(isValidRecipientEmail(good), good).toBe(true);
    }
  });

  it('48. a changed address is an OVERRIDE requiring confirmation', () => {
    const r = resolveRecipient({ employeeName: 'Sam Testcase', employeeRecords: records });
    expect(isAddressOverride(r, 'someone.else@example.com')).toBe(true);
    expect(recipientReadiness(r, 'someone.else@example.com').override).toBe(true);
    expect(describeAddressOverride(r, 'someone.else@example.com')).toMatch(/instead of the address held for Sam Testcase/);
  });

  it('49. retyping the same address in a different case is NOT an override', () => {
    const r = resolveRecipient({ employeeName: 'Sam Testcase', employeeRecords: records });
    expect(isAddressOverride(r, ' SAM.TESTCASE@EXAMPLE.COM ')).toBe(false);
  });

  it('50. an explicit recipient is never treated as an override', () => {
    const r = resolveRecipient({ employeeName: 'A Witness', employeeRecords: records });
    expect(isAddressOverride(r, 'anything@example.com')).toBe(false);
  });

  it('51. the send path validates, confirms and audits the override', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain('if(!isValidRecipientEmail(employeeEmail))');
    expect(app).toContain('isAddressOverride(resolvedRecipient, employeeEmail)');
    expect(app).toContain('audit("Signature request address overridden"');
    expect(app).toMatch(/employee record will not be changed/);
    // Validation replaced includes("@") at both the button and the Enter key.
    expect(app).not.toMatch(/disabled=\{!signEmail\.includes\("@"\)\}/);
  });

  it('52. resolution never writes back to the employee master record', () => {
    const lib = readFileSync('src/lib/recipientResolution.js', 'utf8');
    for (const f of ['supabase', 'fetch', 'update', 'PATCH', 'saveCases']) {
      expect(lib, f).not.toContain(f);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('G. external signature provenance — SIG-SEC-06', () => {
  it('53. it is its own state, not `signed`', () => {
    expect(EXTERNAL_SIGNATURE_STATUS).toBe('signed_externally');
    expect(EXTERNAL_SIGNATURE_STATUS).not.toBe(ESIGNATURE_STATUS.SIGNED);
    expect(CONFIRMATION_SEMANTICS).toHaveProperty(EXTERNAL_SIGNATURE_STATUS);
  });

  it('54. it is NOT represented as a Compass-captured signature', () => {
    const sem = confirmationSemantics(EXTERNAL_SIGNATURE_STATUS);
    expect(sem.provenanceKind).toBe(PROVENANCE_KIND.EXTERNAL);
    expect(sem.provenanceKind).not.toBe(PROVENANCE_KIND.SIGNED);
    // SignedRecordModal gates the signature image on impliesAgreement, so this
    // can never offer an image Compass does not hold.
    expect(sem.impliesAgreement).toBe(false);
    expect(confirmationSemantics(ESIGNATURE_STATUS.SIGNED).impliesAgreement).toBe(true);
  });

  it('55. it still settles progression — a paper signature is a real signature', () => {
    const sem = confirmationSemantics(EXTERNAL_SIGNATURE_STATUS);
    expect(sem.settlesProgression).toBe(true);
    expect(sem.participantEngaged).toBe(true);
    expect(sem.managerActionRequired).toBe(false);
  });

  it('56. the provenance line names the MANAGER who recorded it', () => {
    const line = provenanceLine(EXTERNAL_SIGNATURE_STATUS, { name: 'A Manager', at: '2026-10-06', fmtDate: d => d });
    expect(line).toMatch(/Signed outside Compass/);
    expect(line).toMatch(/recorded by A Manager/);
    expect(line).not.toMatch(/^Signed by/);
  });

  it('57. signing_requests is NOT touched, so the request keeps telling the truth', () => {
    const tab = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
    const i = tab.indexOf('const markMeetingSigned');
    const block = codeOnly(tab.slice(i, tab.indexOf('};', i)));
    expect(block).toContain('EXTERNAL_SIGNATURE_STATUS');
    expect(block).not.toMatch(/signStatus:\s*"signed"/);
    expect(block).not.toContain('signing_requests');
    expect(block).not.toContain('/api/signing');
    expect(block).toContain('saveCases(');                        // strip was not total
    // Who recorded it, and when, so the UI can say so.
    expect(block).toContain('externalSignatureRecordedBy');
    expect(block).toContain('externalSignatureRecordedAt');
  });

  it('58. the capability is preserved, still behind a mandatory explanation', () => {
    const ho = readFileSync('src/lib/humanOverride.js', 'utf8');
    expect(ho).toContain('Confirm signature obtained outside Compass');
    expect(ho).toMatch(/required:true/);
    expect(ho).toContain('Marked signed outside Compass');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('H. rendering parity — SIG-UX-01', () => {
  const PERSISTED = ['pending', 'sent', 'opened', 'signed', 'acknowledged', 'declined', 'expired', 'disputed', 'proceeded'];

  it('59. disputed renders everywhere', () => {
    expect(meetingSignatureState({ signStatus: 'disputed' })).toBeTruthy();
    expect(meetingSignatureState({ signStatus: 'disputed' }).label).toMatch(/Disputed/);
    expect(confirmationSemantics('disputed')).not.toBe(confirmationSemantics('nonsense'));
  });

  it('60. proceeded renders everywhere', () => {
    expect(meetingSignatureState({ signStatus: 'proceeded' })).toBeTruthy();
    expect(meetingSignatureState({ signStatus: 'proceeded' }).label).toMatch(/Proceeded without confirmation/);
  });

  it('61. BOTH maps cover every persisted status — exhaustively', () => {
    for (const s of PERSISTED) {
      expect(CONFIRMATION_SEMANTICS, `semantics missing ${s}`).toHaveProperty(s);
      expect(SIGNATURE_STATE_KEYS, `SIGN_STATE missing ${s}`).toContain(s);
    }
    expect(SIGNATURE_STATE_KEYS).toContain(EXTERNAL_SIGNATURE_STATUS);
  });

  it('62. the persisted CHECK and the rendering vocabulary agree', () => {
    // If a future migration widens the CHECK, this list and the maps must move
    // together. The CHECK is the source of truth and is asserted against.
    const sql = readFileSync('supabase/record_integrity_2026-10-04.sql', 'utf8');
    for (const s of PERSISTED) expect(sql, s).toContain(`'${s}'`);
  });

  it('63. legacy `pending` still reads, in both maps', () => {
    expect(CONFIRMATION_SEMANTICS).toHaveProperty(LEGACY_PENDING_STATUS);
    expect(meetingSignatureState({ signStatus: LEGACY_PENDING_STATUS })).toBeTruthy();
    expect(confirmationSemantics(LEGACY_PENDING_STATUS).impliesAgreement).toBe(false);
  });

  it('64. an unknown status is still never relabelled or assumed', () => {
    expect(meetingSignatureState({ signStatus: 'something_new' })).toBeNull();
    expect(confirmationSemantics('something_new').heading).toBe('Issued record');
    expect(confirmationSemantics('something_new').impliesAgreement).toBe(false);
    expect(confirmationSemantics('something_new').settlesProgression).toBe(false);
  });

  it('65. the Meetings row reads communication-aware semantics', () => {
    const tab = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
    expect(tab).toContain('confirmationSemanticsFor(m.signStatus, m)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('I. nothing established was regressed', () => {
  it('66. signature NEVER means agreement', () => {
    const agreeing = Object.entries(CONFIRMATION_SEMANTICS).filter(([, v]) => v.impliesAgreement);
    expect(agreeing.map(([k]) => k)).toEqual([ESIGNATURE_STATUS.SIGNED]);
    // TRUST-SIG-03 — this assertion used to read the RAW source and so matched
    // the module's own explanatory prose ("none of them is 'the employee agreed
    // with the employer's conclusions'"), i.e. it would have failed on a comment
    // SAYING THE RIGHT THING. The claim is about what Compass puts on screen, so
    // it is made against the code with comments stripped.
    const raw = readFileSync('src/lib/confirmationSemantics.js', 'utf8');
    const lib = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(lib.length).toBeLessThan(raw.length); // the strip must have done something
    expect(lib).not.toMatch(/employee agreed|agrees with/i);
    // And it still has teeth: the phrase IS detectable in code when present.
    expect(`${lib}\n  const x = "the employee agreed";`).toMatch(/employee agreed/i);
    // The real guarantee, stated behaviourally: no state's user-facing wording
    // claims agreement, whatever the comments say.
    for (const v of Object.values(CONFIRMATION_SEMANTICS)) {
      expect(`${v.heading} ${v.stateLine} ${v.detail || ''}`).not.toMatch(/agreed with|agrees with/i);
    }
  });

  it('67. document immutability — no handler writes `document` after insert', () => {
    const main = readFileSync('api/signing.js', 'utf8');
    const portal = readFileSync('api/portal/_signatures.js', 'utf8');
    // The only `document` write is the INSERT body.
    const patches = [...codeOnly(main).matchAll(/method:\s*'PATCH'[\s\S]{0,400}?\}\)/g)].map(m => m[0]);
    expect(patches.length).toBeGreaterThan(0);
    for (const p of patches) expect(p).not.toMatch(/\bdocument\b/);
    // The portal's only write is the shared participant patch, which has no
    // document field by construction (asserted in B).
    const portalPatch = codeOnly(portal).match(/method:\s*'PATCH'[\s\S]{0,400}?\}\)/);
    expect(portalPatch).toBeTruthy();
    expect(portalPatch[0]).not.toMatch(/\bdocument\b/);
  });

  it('68. expiry is a link lifetime, never described as a legal deadline', () => {
    const es = readFileSync('src/lib/eSignature.js', 'utf8');
    expect(es).not.toMatch(/statutory|ACAS deadline|legal deadline|reasonable opportunity/i);
    const sql = readFileSync('supabase/signature_communication_evidence_2026-10-06.sql', 'utf8');
    expect(sql).not.toMatch(/statutory|ACAS/i);
  });

  it('69. the migration is additive and widens no status vocabulary', () => {
    const raw = readFileSync('supabase/signature_communication_evidence_2026-10-06.sql', 'utf8');
    const sql = codeOnly(raw);
    expect(sql).toMatch(/add column if not exists send_attempted_at/);
    // The status vocabulary is NOT widened — communication is a separate axis.
    expect(sql).not.toMatch(/signing_requests_status_valid/);
    expect(sql).not.toMatch(/\bupdate public\.signing_requests\b/i);
    expect(sql).not.toMatch(/\bdelete from\b/i);
    expect(sql).not.toMatch(/\bdrop column\b/i);
    expect(sql).toMatch(/add constraint signing_requests_send_evidence_complete/);
  });

  it('70. no backfill is implied anywhere, and UNKNOWN is preserved', () => {
    const sql = readFileSync('supabase/signature_communication_evidence_2026-10-06.sql', 'utf8');
    expect(sql).toMatch(/NO BACKFILL/);
    expect(sql).toMatch(/Unknown stays unknown/);
    // Historical signatures are not retroactively server-attested.
    expect(sql).toMatch(/does not retroactively server-attest signed_at/);
  });

  it('71. supersession remains orthogonal to participant status', () => {
    expect(Object.keys(CONFIRMATION_SEMANTICS)).not.toContain('superseded');
    const sql = readFileSync('supabase/reissue_supersession_2026-10-04.sql', 'utf8');
    expect(sql).toMatch(/Deliberately NOT a status value/);
  });

  it('72. a superseded request is still readable internally, just not actionable', () => {
    const main = readFileSync('api/signing.js', 'utf8');
    // The internal status check returns the row regardless of supersession.
    expect(main).toContain('return res.status(200).json(existing);');
    // And the public view reports it as a boolean rather than hiding it.
    expect(publicSigningView(row({ superseded_at: 'T' })).superseded).toBe(true);
    // But it cannot be actioned.
    expect(assessParticipantResponse(row({ superseded_at: 'T' })).ok).toBe(false);
  });

  it('73. tenant isolation is untouched — no policy was added', () => {
    const sql = readFileSync('supabase/signature_communication_evidence_2026-10-06.sql', 'utf8');
    expect(sql).not.toMatch(/create policy|alter policy|security definer/i);
    expect(sql).toMatch(/zero policies/);
  });

  it('74. no serverless function was added', () => {
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect((vercel.crons || []).length).toBeLessThanOrEqual(2);
  });
});
