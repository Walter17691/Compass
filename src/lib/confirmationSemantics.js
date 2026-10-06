import { ESIGNATURE_STATUS, LEGACY_PENDING_STATUS, EXTERNAL_SIGNATURE_STATUS } from './eSignature';
import { communicationEvidence, COMMUNICATION } from './communicationEvidence';

// ─────────────────────────────────────────────────────────────────────────
// WHAT EACH CONFIRMATION STATE MEANS TO A HUMAN — ONE EXHAUSTIVE MAP.
//
// ┌─ WHY THIS FILE EXISTS ──────────────────────────────────────────────────┐
// │ The trust slice fixed the CONTENT path thoroughly and then reintroduced   │
// │ the same defect in the LABEL path. SignedRecordModal's heading was        │
// │                                                                         │
// │     disputed ? '…' : acknowledged ? 'Acknowledged copy' : 'Signed copy'  │
// │                                                                         │
// │ so `expired` and `proceeded` — two states in which nobody signed          │
// │ anything — fell through to "Signed copy", with a provenance line reading  │
// │ "Signed by <name>". Silence rendered as agreement. That is the exact      │
// │ class of defect the slice was commissioned to close.                     │
// │                                                                         │
// │ The cause was a fall-through default on a vocabulary that had grown from  │
// │ six values to eight. So there is now no default that implies agreement,   │
// │ and no ternary chain: one map, keyed by status, and an unknown status     │
// │ fails NEUTRAL.                                                           │
// └─────────────────────────────────────────────────────────────────────────┘
//
// EVERY consumer of confirmation wording reads this map. A new status that is
// added to ESIGNATURE_STATUS and not added here is caught by a structural test
// rather than silently inheriting someone else's meaning.
// ─────────────────────────────────────────────────────────────────────────

// How the provenance line is phrased. `signed` is the ONLY value that may
// produce signature wording; `receipt` confirms receipt and not agreement;
// `issued` says the document went to them and nothing more; `decision` describes
// something the ORGANISATION did, not the participant.
export const PROVENANCE_KIND = Object.freeze({
  SIGNED: 'signed',
  RECEIPT: 'receipt',
  ISSUED: 'issued',
  DECISION: 'decision',
  // SIG-SEC-06. A genuine signature that Compass did not capture — a signed
  // paper copy, recorded by a named manager with an explanation. It confirms
  // the same thing a captured signature confirms, but Compass holds no
  // signature image and must never render one, so it cannot share SIGNED.
  EXTERNAL: 'external',
});

const entry = (o) => Object.freeze(o);

export const CONFIRMATION_SEMANTICS = Object.freeze({
  [ESIGNATURE_STATUS.SIGNED]: entry({
    heading: 'Signed copy',
    viewLabel: 'View signed copy',
    stateLine: 'Signed',
    provenanceKind: PROVENANCE_KIND.SIGNED,
    participantEngaged: true,
    impliesAgreement: true,
    settlesProgression: true,
    managerActionRequired: false,
  }),
  // ── SIGNED OUTSIDE COMPASS ───────────────────────────────────────────
  //
  // Human UAT review (SIG-SEC-06): "Mark signed" wrote signStatus:'signed' into
  // cases.meetings[] while signing_requests stayed untouched, so a manually
  // recorded paper signature became INDISTINGUISHABLE from one Compass
  // captured — and, because `signed` carries provenanceKind SIGNED, the UI
  // offered to show a signature image that does not exist.
  //
  // The capability is right and stays: people do sign paper. What was wrong was
  // claiming Compass's own evidence for it. This is a separate, honest state
  // with the same PROGRESS consequences and none of the same evidence claims.
  [EXTERNAL_SIGNATURE_STATUS]: entry({
    heading: 'Signed outside Compass',
    viewLabel: 'View issued record',
    stateLine: 'Signed outside Compass',
    provenanceKind: PROVENANCE_KIND.EXTERNAL,
    participantEngaged: true,
    impliesAgreement: false,
    settlesProgression: true,
    managerActionRequired: false,
  }),
  [ESIGNATURE_STATUS.ACKNOWLEDGED]: entry({
    heading: 'Acknowledged copy',
    viewLabel: 'View acknowledged copy',
    // Receipt, explicitly. An acknowledgement is not agreement and the wording
    // must not let a reader infer one.
    stateLine: 'Acknowledged receipt',
    provenanceKind: PROVENANCE_KIND.RECEIPT,
    participantEngaged: true,
    impliesAgreement: false,
    settlesProgression: true,
    managerActionRequired: false,
  }),
  [ESIGNATURE_STATUS.DECLINED]: entry({
    heading: 'Record as issued — signature declined',
    viewLabel: 'View issued record',
    stateLine: 'Declined to sign',
    provenanceKind: PROVENANCE_KIND.ISSUED,
    participantEngaged: true,
    impliesAgreement: false,
    settlesProgression: true,
    managerActionRequired: false,
  }),
  [ESIGNATURE_STATUS.DISPUTED]: entry({
    heading: 'Record as issued — participant responded with comments',
    viewLabel: 'View issued record & comments',
    stateLine: 'Responded with comments',
    provenanceKind: PROVENANCE_KIND.ISSUED,
    participantEngaged: true,
    impliesAgreement: false,
    settlesProgression: true,
    managerActionRequired: false,
  }),
  [ESIGNATURE_STATUS.EXPIRED]: entry({
    heading: 'Record as issued — no response',
    viewLabel: 'View issued record',
    stateLine: 'No response before the link expired',
    // "Issued to X", never "Signed by X". THE BLOCKER.
    provenanceKind: PROVENANCE_KIND.ISSUED,
    participantEngaged: false,
    impliesAgreement: false,
    // Silence is not an answer: the process waits for a human decision.
    settlesProgression: false,
    managerActionRequired: true,
  }),
  [ESIGNATURE_STATUS.PROCEEDED]: entry({
    heading: 'Record as issued — proceeded without confirmation',
    viewLabel: 'View issued record',
    // Describes what the ORGANISATION did. The participant's own state is shown
    // separately, from proceeded_from_status.
    stateLine: 'Proceeded without confirmation',
    provenanceKind: PROVENANCE_KIND.DECISION,
    participantEngaged: false,
    impliesAgreement: false,
    settlesProgression: true,
    managerActionRequired: false,
  }),
  [ESIGNATURE_STATUS.SENT]: entry({
    heading: 'Record as issued — awaiting response',
    viewLabel: 'View issued record',
    stateLine: 'Sent for confirmation — no response yet',
    provenanceKind: PROVENANCE_KIND.ISSUED,
    participantEngaged: false,
    impliesAgreement: false,
    settlesProgression: false,
    managerActionRequired: true,
  }),
  [ESIGNATURE_STATUS.OPENED]: entry({
    heading: 'Record as issued — opened, awaiting response',
    viewLabel: 'View issued record',
    stateLine: 'Opened — no response yet',
    provenanceKind: PROVENANCE_KIND.ISSUED,
    participantEngaged: false,   // opening is not responding
    impliesAgreement: false,
    settlesProgression: false,
    managerActionRequired: true,
  }),
  // Legacy: 27 production rows predate this vocabulary. Treated as issued and
  // unanswered, which is the safe reading, and labelled rather than left to
  // render as a raw string.
  [LEGACY_PENDING_STATUS]: entry({
    heading: 'Record as issued — awaiting response',
    viewLabel: 'View issued record',
    stateLine: 'Awaiting signature',
    provenanceKind: PROVENANCE_KIND.ISSUED,
    participantEngaged: false,
    impliesAgreement: false,
    settlesProgression: false,
    managerActionRequired: true,
  }),
});

// Unknown, absent, or a status added to the vocabulary and not mapped here.
// FAILS NEUTRAL: it states that a record was issued and claims nothing about
// what anybody did with it.
export const NEUTRAL_SEMANTICS = Object.freeze({
  heading: 'Issued record',
  viewLabel: 'View issued record',
  stateLine: 'Issued',
  provenanceKind: PROVENANCE_KIND.ISSUED,
  participantEngaged: false,
  impliesAgreement: false,
  // Fail closed: an unrecognised state must not unblock a process.
  settlesProgression: false,
  managerActionRequired: true,
});

export function confirmationSemantics(status) {
  return CONFIRMATION_SEMANTICS[status] || NEUTRAL_SEMANTICS;
}

/**
 * The same semantics, but refusing to claim a record reached the participant
 * when Compass has no evidence that it did (TRUST-SIG-02).
 *
 * Only the two AWAITING states are affected — `sent` and `opened` are the only
 * ones whose wording asserts a successful send. `opened` is left alone when
 * evidence is UNKNOWN, because an actual page open is its own proof that the
 * link arrived; it is only downgraded on a recorded FAILURE, which would mean
 * the row contradicts itself.
 *
 * Everything the participant actually DID keeps its own wording. A signature is
 * a signature however the link got there.
 */
export function confirmationSemanticsFor(status, request) {
  const base = confirmationSemantics(status);
  if (base.provenanceKind !== PROVENANCE_KIND.ISSUED) return base;
  if (status !== ESIGNATURE_STATUS.SENT && status !== ESIGNATURE_STATUS.OPENED) return base;
  const evidence = communicationEvidence(request);
  if (evidence === COMMUNICATION.ACCEPTED) return base;
  if (status === ESIGNATURE_STATUS.OPENED && evidence !== COMMUNICATION.FAILED) return base;
  if (evidence === COMMUNICATION.FAILED) {
    return Object.freeze({
      ...base,
      heading: 'Record prepared — could not be emailed',
      stateLine: 'Could not be emailed',
      managerActionRequired: true,
      settlesProgression: false,
    });
  }
  // NOT_ATTEMPTED, ATTEMPTED, or UNKNOWN: issued, but Compass cannot say it
  // arrived. "Prepared" is the honest word.
  return Object.freeze({
    ...base,
    heading: 'Record prepared — not confirmed as sent',
    stateLine: evidence === COMMUNICATION.UNKNOWN
      ? 'Issued — Compass has no record of it being emailed'
      : 'Prepared — not yet confirmed as emailed',
    managerActionRequired: true,
    settlesProgression: false,
  });
}

/**
 * The provenance sentence. The ONLY path to signature wording is
 * PROVENANCE_KIND.SIGNED, which only `signed` carries.
 */
export function provenanceLine(status, { name, at, fmtDate } = {}) {
  const s = confirmationSemantics(status);
  const who = name ? ` ${name}` : '';
  const when = at ? ` on ${fmtDate ? fmtDate(at) : at}` : '';
  switch (s.provenanceKind) {
    case PROVENANCE_KIND.SIGNED:
      return `Signed by${who || ' the participant'}${when}`;
    case PROVENANCE_KIND.RECEIPT:
      return `Acknowledged receipt by${who || ' the participant'}${when}`;
    case PROVENANCE_KIND.EXTERNAL:
      // Names the MANAGER who recorded it, never the participant, and never
      // the word "signature image" — Compass has none.
      return `Signed outside Compass — recorded by${who || ' a manager'}${when}`;
    case PROVENANCE_KIND.DECISION:
      // Deliberately says nothing about the participant. The manager's decision
      // is rendered separately by the caller, from proceed_* provenance.
      return 'Proceeded without participant confirmation';
    default:
      return `Issued to${who || ' the participant'}${when}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// HAS A SPECIFIC VERSION BEEN PUT IN FRONT OF THE PARTICIPANT?
//
// The amendment rule is about ISSUANCE, not about settlement. A request that
// expired unanswered was still issued: the participant holds that document, and
// a later change to the working record must still be attributable.
//
// Every recognised status qualifies, because in this architecture a
// signing_requests row is only ever created by the send flow — there is no
// "drafted but never issued" request state. The predicate is therefore
// equivalent today to "a request exists", and is written as a named concept
// anyway so that a future never-issued state has an obvious home.
// ─────────────────────────────────────────────────────────────────────────
export function hasBeenIssued(status) {
  return Object.prototype.hasOwnProperty.call(CONFIRMATION_SEMANTICS, status);
}
