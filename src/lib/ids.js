// Phase 6.5 hardening (structural remediation, Prompt 12 — Task/Entity
// Identity invariant). An independent audit found several places across
// the app minting ids as `"<prefix>_" + Date.now()`, sometimes with a
// `Math.random()` suffix, sometimes without. Date.now() has millisecond
// resolution — anything that creates more than one item in the same
// synchronous pass (a batch-add loop, two list items rendered/saved in
// the same tick) mints IDENTICAL ids, and the Math.random() suffix some
// call sites added is not actually collision-proof, just lower-probability.
// One shared helper, used everywhere an id is invented client-side,
// closes the whole class at once rather than patching call sites one at
// a time — crypto.randomUUID() is already the established pattern this
// app uses server-side (api/signing.js's own sign_id) and for React keys
// elsewhere; this just makes it the one way ids get minted client-side too.
export function newId(prefix) {
  return prefix ? `${prefix}_${crypto.randomUUID()}` : crypto.randomUUID();
}
