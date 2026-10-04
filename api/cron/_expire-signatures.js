import { supabaseRequest } from './_supabase.js';

// ─────────────────────────────────────────────────────────────────────────
// THE EXPIRY SWEEP.
//
// Until now `expired` was only ever written as a SIDE EFFECT OF SOMEBODY
// READING THE ROW: api/signing.js's GET flips an opened request to expired, and
// a never-opened request flips only when the signer themselves opens the link —
// which, by definition, a participant who is ignoring it never does. So a sent
// request that nobody touched sat at `sent` indefinitely.
//
// That was not a cosmetic database inaccuracy. The client mirrors only
// `signStatus` onto the meeting — never `expires_at` — so effectiveStatus() had
// nothing to compute expiry from, and the case showed "awaiting signature"
// forever while the link in the employee's inbox had been dead for weeks. The
// manager was being told to wait for something that could no longer happen.
//
// ┌─ WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────┐
// │ It does not touch the 27 legacy `pending` rows. They predate the expiry  │
// │ feature and carry no expires_at at all, so there is nothing to compare   │
// │ against; inventing an expiry for them would be fabricating a fact about  │
// │ a real request. They are left exactly as they are.                       │
// │                                                                         │
// │ It does not send anything. No reminder, no notification, no email. An    │
// │ expiry is a fact about elapsed time, not an event worth mailing about,   │
// │ and a sweep that emails is a sweep that can spam.                        │
// │                                                                         │
// │ It does not fabricate engagement. opened_at is never written here —      │
// │ expiring a request says nothing about whether anyone ever looked at it.  │
// └─────────────────────────────────────────────────────────────────────────┘
//
// expires_at is TEXT holding an ISO string on this table, so the comparison is
// done with an explicit cast rather than by altering a live column. The partial
// index signing_requests_open_by_expiry covers exactly this predicate.
// ─────────────────────────────────────────────────────────────────────────

export async function expireSignatures({ now = new Date() } = {}) {
  const nowIso = now.toISOString();

  // Only the two genuinely open states, and only rows whose own expiry has
  // actually passed. `proceeded`, `disputed` and every agreed state are terminal
  // and must never be reopened or relabelled by a sweep.
  const filter = `status=in.(sent,opened)`
    + `&expires_at=not.is.null`
    + `&expires_at=lt.${encodeURIComponent(nowIso)}`;

  const r = await supabaseRequest(`signing_requests?${filter}`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ status: 'expired' }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`expire-signatures PATCH failed: ${text}`);
  }

  const rows = await r.json();
  return {
    ok: true,
    sweptAt: nowIso,
    expired: Array.isArray(rows) ? rows.length : 0,
    // Returned so an operator can see WHICH requests moved without this
    // endpoint ever returning document text, a signature image, or a name.
    signIds: Array.isArray(rows) ? rows.map(x => x.sign_id) : [],
  };
}
