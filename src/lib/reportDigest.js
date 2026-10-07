// ─────────────────────────────────────────────────────────────────────────
// WHAT WAS SUPERSEDED, WITHOUT STORING WHAT IT SAID.
//
// ┌─ THE DEFECT THIS CLOSES (IR-0.2a) ──────────────────────────────────────┐
// │ A deliberate replacement audited identically to a first generation:       │
// │                                                                         │
// │   audit("Investigation report generated", …)   // both cases             │
// │                                                                         │
// │ so two rows read the same and a reader could not tell that an earlier     │
// │ report had existed, still less that it had been destroyed. Compass does   │
// │ not yet keep report versions (that is IR-2), so the audit trail is the    │
// │ only place the supersession can be recorded at all.                      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// WHAT GOES IN THE AUDIT, AND WHAT MUST NOT.
//
// IN:   a cryptographic digest of the superseded text, its length, and the two
//       timestamps. Enough to prove "the document changed", to match a
//       downloaded copy against what the record says was replaced, and to show
//       the replacement was not a no-op.
// OUT:  the report text, any part of it, and any narrative about the employee.
//       An audit row is widely readable and is disclosable on a DSAR; putting
//       case narrative there to improve traceability would trade one integrity
//       problem for a worse privacy one. A digest proves identity and reveals
//       nothing.
//
// WHY SHA-256 VIA WebCrypto. The project has no JavaScript hashing convention —
// the only hashing in the codebase is server-side token crypto in api/. Rather
// than add a dependency or invent a non-cryptographic digest, this uses the
// platform's own SHA-256. It FAILS SOFT: if WebCrypto is unavailable the digest
// is null and the audit still records the replacement with its lengths and
// times. An audit entry must never be lost because a hash could not be taken.
// ─────────────────────────────────────────────────────────────────────────

/**
 * SHA-256 of `text`, hex, prefixed with the algorithm so the value is
 * self-describing in an audit row. Returns null rather than throwing.
 */
export async function reportDigest(text) {
  if (typeof text !== 'string' || text === '') return null;
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const bytes = new TextEncoder().encode(text);
    const hash = await subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `sha256:${hex}`;
  } catch {
    // A digest is evidence, not a precondition. Never block the audit.
    return null;
  }
}

/** The two audit actions. Distinct meanings, so neither can stand for the other. */
export const REPORT_AUDIT_ACTION = Object.freeze({
  GENERATED: 'Investigation report generated',
  REPLACED: 'Investigation report replaced',
});

/**
 * Which action this write is, decided from the PRE-WRITE state of the case.
 *
 * Not from the UI's consent flag and not from the dialog wording: the question
 * is whether a report existed in the state this write is based on. That state is
 * also what saveCaseToDB's conditional update on updated_at validates, so a
 * write that lands is a write whose pre-image was current.
 */
export function reportAuditAction(hadExistingReport) {
  return hadExistingReport ? REPORT_AUDIT_ACTION.REPLACED : REPORT_AUDIT_ACTION.GENERATED;
}

/**
 * The audit detail for a replacement: non-sensitive evidence only.
 *
 * Shape is deliberately terse and machine-greppable, because the thing a reader
 * needs later is "which document was replaced by which", not prose.
 */
export function describeReportReplacement({
  employeeName = null, supersededDigest = null, supersededLength = null,
  supersededAt = null, newDigest = null, newLength = null,
} = {}) {
  const parts = [];
  if (employeeName) parts.push(employeeName);
  parts.push('previous report superseded');
  parts.push(`was ${supersededDigest || 'digest unavailable'}`
    + (Number.isFinite(supersededLength) ? ` (${supersededLength} chars` : '')
    + (supersededAt ? `, drafted ${supersededAt})` : Number.isFinite(supersededLength) ? ')' : ''));
  parts.push(`now ${newDigest || 'digest unavailable'}`
    + (Number.isFinite(newLength) ? ` (${newLength} chars)` : ''));
  // Stated plainly, because it is the limitation a later reader most needs to
  // know and the product warned the user about it at the time.
  parts.push('the superseded text itself is not retained — Compass does not yet keep report versions');
  return parts.join(' — ');
}
