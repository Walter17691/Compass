// free = 1 active case at a time, no Portal/Calendar/DSAR/compliance-
// digest access. pro = unlimited cases + full feature set. This is a UX
// gate on paid features, not a security boundary — enforced here and at
// the Supabase RLS layer nowhere, since there's nothing sensitive being
// protected, just an upsell nudge.
const PRO_FEATURES = new Set(['portal', 'calendar', 'dsar', 'digest']);

export function isPro(org) {
  return org?.plan === 'pro';
}

export function canUseFeature(org, feature) {
  if (isPro(org)) return true;
  return !PRO_FEATURES.has(feature);
}

export function canCreateCase(org, activeCaseCount) {
  if (isPro(org)) return true;
  return activeCaseCount < 1;
}
