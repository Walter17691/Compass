import { ESIGNATURE_STATUS, LEGACY_PENDING_STATUS, EXTERNAL_SIGNATURE_STATUS } from './eSignature';
import { communicationEvidence, COMMUNICATION } from './communicationEvidence';
import { challengesAccuracy, confirmsAccuracy, isResolved } from './employeeResponse';

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

// How a state should READ at a glance. The colour itself stays in the component;
// what belongs here is the judgement about which states are settled, which need
// attention, and which are neither.
export const TONE = Object.freeze({
  DONE: 'done',            // settled, nothing outstanding
  ATTENTION: 'attention',  // settled or not, but a human must look
  PENDING: 'pending',      // waiting on someone else
  REFUSED: 'refused',      // the participant declined
  MUTED: 'muted',          // nothing happened
});

// Defaults applied to every entry, so a new field cannot be silently missing
// from one of them. `signatureCaptured` exists because impliesAgreement was
// doing THREE jobs at once — gating the signature image, colouring the modal,
// and colouring the row — and a signature WITH comments needs the image shown
// while not reading as unqualified agreement. Those are different questions.
const entry = (o) => Object.freeze({
  signatureCaptured: false,
  participantResponded: false,
  responseAwaitsReview: false,
  tone: TONE.MUTED,
  ...o,
});

export const CONFIRMATION_SEMANTICS = Object.freeze({
  [ESIGNATURE_STATUS.SIGNED]: entry({
    heading: 'Signed copy',
    viewLabel: 'View signed copy',
    stateLine: 'Signed',
    badgeLabel: 'Signed',
    provenanceKind: PROVENANCE_KIND.SIGNED,
    participantEngaged: true,
    impliesAgreement: true,
    // The ONLY state where Compass holds a signature image of its own.
    signatureCaptured: true,
    tone: TONE.DONE,
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
    badgeLabel: 'Signed outside Compass',
    tone: TONE.DONE,
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
    badgeLabel: 'Acknowledged',
    tone: TONE.DONE,
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
    badgeLabel: 'Declined',
    tone: TONE.REFUSED,
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
    badgeLabel: 'Responded with comments',
    tone: TONE.ATTENTION,
    participantResponded: true,
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
    badgeLabel: 'Expired',
    tone: TONE.ATTENTION,
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
    badgeLabel: 'Proceeded without confirmation',
    tone: TONE.ATTENTION,
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
    badgeLabel: 'Awaiting signature',
    tone: TONE.PENDING,
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
    badgeLabel: 'Opened — awaiting signature',
    tone: TONE.PENDING,
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
    badgeLabel: 'Awaiting signature',
    tone: TONE.PENDING,
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
  badgeLabel: 'Issued',
  tone: TONE.ATTENTION,
  signatureCaptured: false,
  participantResponded: false,
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
// ─────────────────────────────────────────────────────────────────────────
// A SIGNATURE WITH A RESPONSE IS NOT A PLAIN SIGNATURE (TRUST-SIG-02)
//
// ┌─ THE DEFECT THIS CLOSES ────────────────────────────────────────────────┐
// │ Human UAT: the employee signed AND wrote "I do not agree that i was      │
// │ responsible for the stock count. i had informed my manager that i was     │
// │ unavailable" — and the manager's meeting row showed a plain green        │
// │ "Signed".                                                               │
// │                                                                         │
// │ The cause is structural: `status` is 'signed' and the response lives in   │
// │ a SEPARATE column (participant_comment), so every status-keyed map —      │
// │ ESIGNATURE_STATUS_LABEL, SIGN_STATUS_STYLE, SIGN_STATE — was blind to it. │
// │ The signature means the employee RECEIVED AND REVIEWED the record. It has │
// │ never meant they agreed with its contents, and the external page says so. │
// │ A row that reads as unqualified agreement contradicts the page they       │
// │ signed on.                                                              │
// └─────────────────────────────────────────────────────────────────────────┘
//
// DERIVED, NOT A NEW STATUS. The comment is already persisted; nothing needs a
// new value, a new column or a migration. `status` keeps meaning what the
// participant DID, and the presence of a response is a second fact read
// alongside it — the same separation of axes as communication evidence.
//
// NOT CLASSIFIED AS DISAGREEMENT. A comment may be a correction, context, a
// clarification, a disagreement or an observation, and Compass holds no reliable
// signal for which. So the wording says a response EXISTS and leaves reading it
// to the human — and the tone is ATTENTION, never the red of a refusal.
/**
 * Annotate a settled participant state with the fact that a response exists.
 *
 * Only applied where the status does NOT already say so: `disputed` is already
 * "Responded with comments", and `declined` already carries its own reason, so
 * neither is re-annotated.
 *
 * impliesAgreement drops to false — they signed, but not without saying
 * something — while signatureCaptured is PRESERVED, because the signature image
 * is real and the manager must still be able to see it. Those two questions used
 * to share one flag, which is why this needed decoupling first.
 *
 * settlesProgression is deliberately UNCHANGED. A comment is not a veto: the
 * employee cannot stall an investigation by disagreeing, and Compass must not
 * make their response disappear because it continues. Visibility is the fix,
 * not a block.
 */
function withResponse(base, status, request) {
  // ── TRUST-SIG-03 — WHAT THEY SAID ABOUT ACCURACY ────────────────────────
  //
  // An EXPLICIT classification outweighs the mere presence of words, because it
  // is the thing the employee actually chose. Three outcomes, and none of them
  // is "the employee agreed with the employer's conclusions":
  //
  //   accurate  they confirm the notes read correctly   -> ordinary Signed
  //   comment   broadly accurate, plus something        -> Signed with comments
  //   disputed  something is inaccurate or missing      -> Signed — notes disputed
  //
  // Signing never converts a disputed record into an accepted one: the dispute
  // is carried in the wording, before AND after review.
  if (base.participantEngaged && challengesAccuracy(request)) {
    const reviewed = isResolved(request);
    return Object.freeze({
      ...base,
      heading: reviewed
        ? `${base.heading} — employee response reviewed`
        : `${base.heading} — employee response requires review`,
      stateLine: reviewed ? 'Signed — response reviewed' : 'Signed — notes disputed',
      badgeLabel: reviewed ? 'Signed — response reviewed' : 'Signed — notes disputed',
      tone: TONE.ATTENTION,
      // They signed for receipt; they did not agree the notes are right.
      impliesAgreement: false,
      participantResponded: true,
      // Surfaced, never a block: a dispute must not give the employee a veto,
      // so settlesProgression is inherited unchanged. managerActionRequired is
      // what makes it impossible to overlook before review.
      managerActionRequired: !reviewed,
      responseAwaitsReview: !reviewed,
    });
  }

  // An explicit "this is accurate" is an ordinary signature, and must not be
  // dressed up as agreement with findings, allegations or decisions.
  if (confirmsAccuracy(request) && !hasParticipantResponse(request)) return base;

  if (!hasParticipantResponse(request)) return base;
  if (status === ESIGNATURE_STATUS.DISPUTED || status === ESIGNATURE_STATUS.DECLINED) return base;
  if (!base.participantEngaged) return base;
  const noun = base.provenanceKind === PROVENANCE_KIND.RECEIPT ? 'Acknowledged' : 'Signed';
  return Object.freeze({
    ...base,
    heading: `${base.heading} — with employee comments`,
    stateLine: `${noun} with comments`,
    badgeLabel: `${noun} with comments`,
    tone: TONE.ATTENTION,
    impliesAgreement: false,
    participantResponded: true,
  });
}

const hasParticipantResponse = (r) => {
  if (!r) return false;
  const c = r.participant_comment !== undefined ? r.participant_comment : r.participantComment;
  return typeof c === 'string' && c.trim().length > 0;
};

export function confirmationSemanticsFor(status, request) {
  const base = withResponse(confirmationSemantics(status), status, request);
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
      badgeLabel: 'Not emailed',
      tone: TONE.REFUSED,
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
    // The badge must not say "Awaiting signature" for something Compass cannot
    // confirm it ever sent.
    badgeLabel: evidence === COMMUNICATION.UNKNOWN ? 'Issued' : 'Prepared — not sent',
    tone: TONE.ATTENTION,
    managerActionRequired: true,
    settlesProgression: false,
  });
}

/**
 * The provenance sentence. The ONLY path to signature wording is
 * PROVENANCE_KIND.SIGNED, which only `signed` carries.
 */
export function provenanceLine(status, { name, at, fmtDate, fmtInstant } = {}) {
  const s = confirmationSemantics(status);
  const who = name ? ` ${name}` : '';
  // fmtInstant wins where supplied: a signature's evidential value is the
  // precise instant, and fmtDate drops the time. fmtDate remains the fallback so
  // every existing caller keeps working unchanged.
  const stamp = at ? (fmtInstant ? fmtInstant(at) : fmtDate ? fmtDate(at) : at) : '';
  const when = stamp ? ` on ${stamp}` : '';
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
