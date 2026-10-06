// ─────────────────────────────────────────────────────────────────────────
// WHO IS ABOUT TO RECEIVE A MEETING RECORD?
//
// ┌─ THE DEFECT THIS CLOSES (SIG-SEC-04) ───────────────────────────────────┐
// │ The address was free-typed into a modal and validated by                  │
// │ signEmail.includes("@"). Nothing resolved the employee, nothing showed    │
// │ the manager who would receive it, and a typo emailed a full ER meeting    │
// │ record — allegations, witness accounts, the lot — to a stranger. For a    │
// │ confidentiality boundary that is not enough.                             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// NOT EMPLOYEE-ONLY, BY DESIGN. A recipient may legitimately have no canonical
// employee record: a witness, an external participant, or the subject of a
// fact-first investigation who has not been identified yet. Requiring
// employee_id would break the fact-first operating model, so this resolves a
// canonical address WHERE ONE EXISTS and otherwise accepts an explicit one —
// while making the manager look at it either way.
//
// NOT A CONTACTS SYSTEM. It reads employee_records.work_email (mapped client-side
// as workEmail) and writes nothing back: changing the address here is an
// override for this one request, never an edit to the employee master record.
// ─────────────────────────────────────────────────────────────────────────

export const RECIPIENT_SOURCE = Object.freeze({
  /** Matched a canonical employee record that carries a work email. */
  CANONICAL: 'canonical',
  /** A canonical employee exists but has no email on file. */
  CANONICAL_NO_EMAIL: 'canonical_no_email',
  /** No canonical employee — a witness, external participant, or fact-first. */
  EXPLICIT: 'explicit',
});

// Deliberately stricter than includes("@") and deliberately NOT an attempt at
// RFC 5322: it rejects the shapes that actually cause misdelivery — no domain,
// no TLD, spaces, two @, a trailing dot — and accepts everything a real work
// address looks like. A validator that rejects valid addresses is its own defect.
const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

export function isValidRecipientEmail(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || v.length > 254) return false;
  return EMAIL.test(v);
}

const norm = s => (typeof s === 'string' ? s.trim().toLowerCase() : '');

/**
 * Resolve the intended recipient for a meeting record.
 *
 * Matching is by NAME, because that is the only link a meeting carries — there
 * is no employee_id on cases.meetings[]. A name match is therefore a suggestion
 * to be confirmed by a human, which is exactly how the UI must present it, and
 * why nothing here sends anything on its own.
 */
export function resolveRecipient({ employeeName, employeeRecords = [] } = {}) {
  const wanted = norm(employeeName);
  const record = wanted
    ? (Array.isArray(employeeRecords) ? employeeRecords : []).find(r => r && norm(r.name) === wanted)
    : null;
  const canonicalEmail = record && typeof record.workEmail === 'string' ? record.workEmail.trim() : '';
  if (record && canonicalEmail) {
    return { source: RECIPIENT_SOURCE.CANONICAL, name: record.name, email: canonicalEmail, employeeId: record.id || null };
  }
  if (record) {
    return { source: RECIPIENT_SOURCE.CANONICAL_NO_EMAIL, name: record.name, email: '', employeeId: record.id || null };
  }
  return { source: RECIPIENT_SOURCE.EXPLICIT, name: employeeName || '', email: '', employeeId: null };
}

/**
 * Is the address about to be used different from the canonical one?
 *
 * Case- and whitespace-insensitive, because re-typing the same address in a
 * different case is not an override and must not demand a confirmation.
 */
export function isAddressOverride(resolved, typedEmail) {
  if (!resolved || resolved.source !== RECIPIENT_SOURCE.CANONICAL) return false;
  const typed = norm(typedEmail);
  if (!typed) return false;
  return typed !== norm(resolved.email);
}

/** May this send proceed? Explicit outcomes only — nothing is assumed valid. */
export function recipientReadiness(resolved, typedEmail) {
  const email = typeof typedEmail === 'string' ? typedEmail.trim() : '';
  if (!email) return { ready: false, reason: 'no_address' };
  if (!isValidRecipientEmail(email)) return { ready: false, reason: 'invalid_address' };
  return {
    ready: true,
    override: isAddressOverride(resolved, email),
    source: resolved?.source || RECIPIENT_SOURCE.EXPLICIT,
  };
}

/** The audit detail for an address that differs from the employee record. */
export function describeAddressOverride(resolved, typedEmail) {
  return `Record sent to ${typedEmail} instead of the address held for ${resolved?.name || 'this employee'}`;
}
