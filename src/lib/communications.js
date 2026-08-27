// Integrations & Workflow Automation (Phase 5, IP31, §28) — a unified
// per-case view of every email, letter, and meeting invitation,
// enriched with e-signature/acknowledgement status where one exists.
// Technically independent of the automation engine, but most valuable
// once Tracks B/C/E's email/letter/meeting/signing flows are all live —
// pure read-aggregation reusing caseTimeline.js's own event merge
// rather than re-deriving a second approximation of the same case
// history: filters its output to the correspondence-shaped entry types
// and adds the one thing those generic entries don't carry, signature
// status, by resolving each entry's linkTo back to the real meeting or
// evidence object.

import { buildCaseTimeline } from './caseTimeline.js';
import { effectiveStatus, signatureStatusLabel } from './eSignature.js';

const COMMUNICATION_TYPES = ["email", "letter", "meeting"];

function resolveSource(cs, entry) {
  if (!entry.linkTo) return null;
  if (entry.linkTo.kind === "meeting") return (cs.meetings || []).find(m => m.id === entry.linkTo.id) || null;
  // Phase 6.5 hardening (Prompt 14, Section 6 — closes independent audit
  // finding 3.4's Communications-view half) — was bracket-indexing
  // `cs.evidence[entry.linkTo.id]`, treating the stable string id
  // caseTimeline.js's own linkTo carries (ev.id, e.g. "ev_xyz") as an
  // array position. Array bracket access with a non-numeric string key
  // never matches anything, so this silently returned undefined for
  // every evidence-sourced entry — the signature-status badge for every
  // emailed/sent-letter row in the Communications tab was permanently
  // blank, never a stale-but-wrong id (no reordering/deletion needed to
  // trigger it, it was broken from the start). `ev.id ?? i` mirrors
  // exactly how caseTimeline.js builds this same linkTo.id in the first
  // place — real ids resolve directly; only pre-ensureEvidenceIds legacy
  // rows without a real id fall back to (best-effort, order-dependent)
  // position, same caveat that fallback already carries at its source.
  if (entry.linkTo.kind === "evidence") return (cs.evidence || []).find((ev, i) => (ev.id ?? i) === entry.linkTo.id) || null;
  return null;
}

// Meetings and sent-letter evidence items carry signId/signStatus
// directly (the same locally-synced fields every signature badge
// elsewhere in the app already reads — see App.jsx's own signature-sync
// polling effect) — no separate signing_requests fetch here.
function resolveSignatureStatus(source) {
  if (!source?.signId) return null;
  return effectiveStatus({ status: source.signStatus });
}

export function buildCommunicationsView(cs, allegations, auditLog) {
  const timeline = buildCaseTimeline(cs, allegations, auditLog);
  return timeline
    .filter(entry => COMMUNICATION_TYPES.includes(entry.type))
    .map(entry => {
      const source = resolveSource(cs, entry);
      const status = resolveSignatureStatus(source);
      return {
        ...entry,
        signatureStatus: status,
        signatureStatusLabel: status ? signatureStatusLabel(status) : null,
      };
    });
}
