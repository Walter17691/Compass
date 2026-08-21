// Organisational ER Intelligence (Phase 6, OP15, §11) — organisational
// change correlation. Pure formatting over org_event_correlation()'s
// (OP15's RPC) raw before/after counts. Never claims causation — the
// spec's own required framing: "There is a temporal correlation worth
// reviewing," not "the change caused the increase."

import { computePctChange } from './trendDetection';

export const ORG_EVENT_TYPES = [
  { id: "restructure", label: "Management restructure" },
  { id: "new_rota_system", label: "New rota system" },
  { id: "new_policy", label: "New policy" },
  { id: "site_opening", label: "Site opening" },
  { id: "site_closure", label: "Site closure" },
  { id: "leadership_change", label: "Leadership change" },
  { id: "pay_review", label: "Pay review" },
  { id: "new_operating_model", label: "New operating model" },
  { id: "other", label: "Other" },
];

export function orgEventTypeLabel(type) {
  return ORG_EVENT_TYPES.find(t => t.id === type)?.label || type;
}

export function describeEventCorrelation(data) {
  const before = data?.before_count ?? 0;
  const after = data?.after_count ?? 0;
  if (before === 0 && after === 0) {
    return "No cases recorded in the windows before or after this event.";
  }
  const pct = computePctChange(after, before);
  if (pct === null) {
    return `No cases were recorded in the period before this event, and ${after} in the period after. There is a temporal correlation worth reviewing.`;
  }
  if (pct === 0) {
    return `Case volume was unchanged (${before} before, ${after} after this event).`;
  }
  const direction = pct > 0 ? "increased" : "decreased";
  return `Case volume ${direction} ${Math.abs(pct)}% around this event (${before} before, ${after} after). There is a temporal correlation worth reviewing.`;
}
