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
