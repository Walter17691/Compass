import { supabaseRequest } from './_supabase.js';

// Integrations & Workflow Automation (Phase 5, IP4, §30) — one shared
// logger every OAuth-based integration handler calls into (graph-mail's
// Outlook/Gmail flows, calendar's Google/MS365 flows and the real
// create/update/delete-event primitive) rather than each writing its own
// insert. Best-effort: a logging failure is caught and console.error'd,
// never allowed to turn a successful integration action into a failed
// API response, or mask the real error from a failed one.
export async function logIntegrationEvent({ orgId, userId, provider, eventType, status, detail }) {
  try {
    await supabaseRequest('integration_events', {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId, user_id: userId || null, provider, event_type: eventType, status, detail: detail || null }),
    });
  } catch (e) {
    console.error('logIntegrationEvent failed (non-fatal):', e.message);
  }
}
