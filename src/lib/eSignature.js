// Integrations & Workflow Automation (Phase 5, IP27, §21) — extends the
// existing signing_requests lifecycle from pending/signed only to a real
// vocabulary: Sent -> Opened -> Signed/Acknowledged/Declined, or Expired.
// A decline is recorded as a plain fact for HR to follow up on — never
// treated as evidence the document's content was wrong, and nothing here
// auto-triggers off one besides the existing manager-notification email.

export const ESIGNATURE_STATUS = {
  SENT: "sent",
  OPENED: "opened",
  SIGNED: "signed",
  ACKNOWLEDGED: "acknowledged",
  DECLINED: "declined",
  EXPIRED: "expired",
};

const TERMINAL_STATUSES = [ESIGNATURE_STATUS.SIGNED, ESIGNATURE_STATUS.ACKNOWLEDGED, ESIGNATURE_STATUS.DECLINED, ESIGNATURE_STATUS.EXPIRED];

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

const DEFAULT_EXPIRY_DAYS = 7;

export function computeExpiresAt(fromDate = new Date(), days = DEFAULT_EXPIRY_DAYS) {
  const due = new Date(fromDate.getTime());
  due.setDate(due.getDate() + days);
  return due.toISOString();
}

export function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  return now.getTime() > new Date(expiresAt).getTime();
}

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.10, MEDIUM) — the
// public signing link's unguessable sign_id was the only access control on
// GET, with no time bound: a forwarded or leaked email link kept disclosing
// the full document text and a captured signature image forever. This is
// the terminal-state timestamp a public-view window gets measured from —
// the moment the document actually stopped being actionable, not whatever
// the row happened to be last touched.
export function terminalAt(request) {
  if (!request) return null;
  if (request.status === ESIGNATURE_STATUS.SIGNED || request.status === ESIGNATURE_STATUS.ACKNOWLEDGED) return request.signed_at;
  if (request.status === ESIGNATURE_STATUS.DECLINED) return request.declined_at;
  if (request.status === ESIGNATURE_STATUS.EXPIRED) return request.expires_at;
  return null;
}

const PUBLIC_VIEW_WINDOW_DAYS = 30;

// Generous enough for a signer to come back and download their own copy,
// short enough that a stale link sitting in an old inbox or browser
// history doesn't stay a live disclosure risk indefinitely.
export function isPastPublicViewWindow(request, now = new Date()) {
  const at = terminalAt(request);
  if (!at) return false;
  const cutoffMs = new Date(at).getTime() + PUBLIC_VIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() > cutoffMs;
}

// The status a signing_request should read as right now, accounting for
// expiry even if the stored row hasn't been written back yet (the GET
// handler in api/signing.js does that write, but this stays pure/testable
// on its own, and the signing page itself can compute this defensively
// too).
export function effectiveStatus(request, now = new Date()) {
  if (!request) return null;
  if (isTerminalStatus(request.status)) return request.status;
  if (isExpired(request.expires_at, now)) return ESIGNATURE_STATUS.EXPIRED;
  return request.status || ESIGNATURE_STATUS.SENT;
}

export const ESIGNATURE_STATUS_LABEL = {
  [ESIGNATURE_STATUS.SENT]: "Sent",
  [ESIGNATURE_STATUS.OPENED]: "Opened",
  [ESIGNATURE_STATUS.SIGNED]: "Signed",
  [ESIGNATURE_STATUS.ACKNOWLEDGED]: "Acknowledged",
  [ESIGNATURE_STATUS.DECLINED]: "Declined",
  [ESIGNATURE_STATUS.EXPIRED]: "Expired",
};

export function signatureStatusLabel(status) {
  return ESIGNATURE_STATUS_LABEL[status] || status;
}

export const DOCUMENT_TYPE_LABEL = {
  meeting_record: "Meeting record",
  outcome_letter: "Outcome letter",
  adjustment_record: "Agreed adjustments",
  consultation_record: "Consultation record",
};

export function documentTypeLabel(type) {
  return DOCUMENT_TYPE_LABEL[type] || "Document";
}
