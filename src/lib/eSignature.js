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
