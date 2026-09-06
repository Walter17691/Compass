// No free plan — every org must have an active Stripe subscription to use
// Compass at all (enforced in main.jsx, above the App component; see
// isSubscribed). Priced per active location, volume-tiered: the whole
// subscription is billed at the rate of whichever band the total location
// count falls into (e.g. 3 locations = 3 x the "2-5" rate, not a mix).
//
// This tier table is a *display* mirror, not the source of truth for
// billing — the actual charge is computed by the Stripe Price object
// (STRIPE_PRICE_ID), which must be configured in the Stripe dashboard with
// matching "volume" tiered pricing. Keep the two in sync by hand; nothing
// checks that they match.
export const LOCATION_PRICE_TIERS = [
  { maxLocations: 1, pricePerLocation: 279, label: '1 location' },
  { maxLocations: 5, pricePerLocation: 119, label: '2–5 locations' },
  { maxLocations: 15, pricePerLocation: 95, label: '6–15 locations' },
  { maxLocations: 50, pricePerLocation: 75, label: '16–50 locations' },
];

export function pricePerLocationFor(locationCount) {
  const n = Math.max(1, locationCount);
  const tier = LOCATION_PRICE_TIERS.find(t => n <= t.maxLocations);
  return tier ? tier.pricePerLocation : null; // null = 51+, custom/Enterprise pricing
}

export function estimateMonthlyPrice(locationCount) {
  const n = Math.max(1, locationCount);
  const rate = pricePerLocationFor(n);
  return rate === null ? null : n * rate;
}

export function isPro(org) {
  return org?.plan === 'pro';
}

export function isSubscribed(org) {
  return org?.plan === 'pro' && org?.stripe_subscription_status === 'active';
}

// Platform Admin Foundation — the provider-neutral replacement for
// isSubscribed() as the app-access gate (main.jsx). Compass's Release 1.0
// commercial model is negotiated B2B: THE COMPASS CONSULTANCY WC LTD
// invoices customers directly, and Stripe self-service is not how a
// customer is expected to activate. The gate this function answers is
// "is this organisation entitled to use Compass" — not "does Stripe say
// so" — so a negotiated/invoiced customer no longer needs to be
// misrepresented as a fake Stripe subscriber (plan='pro' +
// stripe_subscription_status='active' set directly via SQL) just to pass
// the gate.
//
// organisations.access_status is the new, provider-neutral signal,
// defaulting to 'pending' (fail-closed for a brand-new org, matching the
// existing fail-closed default of plan='free'). A real, currently-active
// Stripe subscription remains sufficient on its own for an org whose
// access_status is still 'pending' (the default every existing row gets
// from the migration) — checked exactly as isSubscribed() already does —
// so an existing or future Stripe subscriber is never unexpectedly locked
// out by this change; Stripe is additive backward compatibility here, not
// removed.
//
// 'suspended' is checked FIRST and is authoritative: it blocks access
// unconditionally, even if a stale/legacy Stripe field is still 'active'
// underneath. Without this ordering, suspending a negotiated customer who
// once also had Stripe fields set (or an operator suspending a Stripe
// subscriber without separately cancelling Stripe) could silently fail to
// actually block them — exactly the fail-open bug this function exists to
// avoid. Caught and fixed by this function's own test suite before this
// ever shipped.
export function isEntitled(org) {
  if (!org) return false;
  if (org.access_status === 'suspended') return false;
  if (org.access_status === 'active') return true;
  return isSubscribed(org);
}
