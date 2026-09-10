import { supabaseRequest } from './_supabase.js';
import { getValidAccessToken, googleCalendarRequest, deadlineToGoogleEvent } from './_google.js';
import { requireOrgMembership } from '../_auth.js';
import { logIntegrationEvent } from '../_integration_events.js';

// Defect #1 remediation — Google OAuth error codes that mean the stored
// credential itself is invalid/revoked and reconnecting is the only way
// forward. invalid_grant is the actual production repro (a revoked/
// expired refresh token); invalid_client/unauthorized_client are the
// same "this credential/config can't work as stored" family in Google's
// own OAuth error vocabulary. Deliberately NOT included: anything that
// could describe a transient condition (rate limits, 5xx, network
// errors) — those must never be classified as reconnect-required (see
// this file's own catch block below).
const CREDENTIAL_INVALID_CODES = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client']);

// Phase 6.5 hardening (closes Prompt 16 audit finding C3, CRITICAL) —
// looked the connection up by user_id alone, with no orgId in the
// request at all. A multi-org user's sync while working in Org A could
// silently use whichever org's connection happened to have been
// connected/overwritten most recently (see _oauth-callback.js's own
// comment on the underlying upsert bug this is the read-side half of),
// pushing Org A's confidential deadline titles onto a calendar logged
// under a different org entirely.
export async function sync(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { deadlines, orgId } = req.body;
  const auth = await requireOrgMembership(req, res, orgId);
  if (!auth) return;
  const userId = auth.caller.id;

  if (!Array.isArray(deadlines)) {
    return res.status(400).json({ error: 'deadlines[] is required' });
  }

  // Declared here (rather than inside the try block) so the catch block
  // below can still log against the right org if a connection was found
  // before something later in the sync failed.
  let connection = null;
  try {
    const connRes = await supabaseRequest(`calendar_connections?user_id=eq.${userId}&org_id=eq.${orgId}&provider=eq.google&select=*`);
    const connections = await connRes.json();
    connection = connections[0];
    if (!connection) return res.status(404).json({ error: 'No Google Calendar connection for this user' });

    const { accessToken, newExpiresAt } = await getValidAccessToken(connection);
    if (newExpiresAt) {
      await supabaseRequest(`calendar_connections?id=eq.${connection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ access_token: accessToken, expires_at: newExpiresAt, updated_at: new Date().toISOString() }),
      });
    }

    const existingRes = await supabaseRequest(`calendar_synced_events?connection_id=eq.${connection.id}&select=*`);
    const existing = await existingRes.json();
    const existingByKey = new Map(existing.map(e => [e.deadline_key, e]));
    const incomingKeys = new Set(deadlines.filter(d => d.key).map(d => d.key));

    let created = 0, updated = 0, deleted = 0;

    // Create or update every incoming deadline.
    for (const deadline of deadlines) {
      if (!deadline.key) continue; // skip anything without a stable key — nothing to diff against
      const event = deadlineToGoogleEvent(deadline);
      const existingEvent = existingByKey.get(deadline.key);

      if (existingEvent) {
        const putRes = await googleCalendarRequest(accessToken, `events/${existingEvent.calendar_event_id}`, {
          method: 'PUT',
          body: JSON.stringify(event),
        });
        if (putRes.ok) updated++;
      } else {
        const postRes = await googleCalendarRequest(accessToken, 'events', {
          method: 'POST',
          body: JSON.stringify(event),
        });
        if (postRes.ok) {
          const created_event = await postRes.json();
          await supabaseRequest('calendar_synced_events', {
            method: 'POST',
            body: JSON.stringify({
              connection_id: connection.id,
              deadline_key: deadline.key,
              calendar_event_id: created_event.id,
            }),
          });
          created++;
        }
      }
    }

    // Delete synced events for deadlines that no longer appear (resolved/closed).
    for (const e of existing) {
      if (!incomingKeys.has(e.deadline_key)) {
        await googleCalendarRequest(accessToken, `events/${e.calendar_event_id}`, { method: 'DELETE' });
        await supabaseRequest(`calendar_synced_events?id=eq.${e.id}`, { method: 'DELETE' });
        deleted++;
      }
    }

    await logIntegrationEvent({ orgId: connection.org_id, userId, provider: 'google_calendar', eventType: 'sync', status: 'success', detail: `${created} created, ${updated} updated, ${deleted} deleted` });
    res.status(200).json({ success: true, created, updated, deleted });
  } catch (e) {
    // Defect #1 remediation — a raw provider error (e.message could
    // contain Google's own wording, which varies release to release and
    // is meaningless to an HR user) must never reach the client or a log
    // line verbatim; only a stable, sanitized code/message pair, matching
    // api/chat.js's own AI_UNAVAILABLE contract (Defect #5) for the exact
    // same reason. reconnectRequired is the one case this function
    // classifies specially — see CREDENTIAL_INVALID_CODES above — every
    // other failure (network error, malformed response, Google 429/5xx,
    // an unexpected Supabase error) is treated as temporary: it must not
    // mark the connection as needing reconnection, so a real outage
    // doesn't get permanently misclassified as a revoked credential.
    const reconnectRequired = CREDENTIAL_INVALID_CODES.has(e.providerErrorCode);
    console.error('[calendar] sync failed', reconnectRequired ? 'reconnect_required' : 'provider_error', e.providerErrorCode || e.message);
    if (connection) {
      await logIntegrationEvent({
        orgId: connection.org_id, userId, provider: 'google_calendar', eventType: 'sync', status: 'error',
        detail: reconnectRequired ? 'CALENDAR_RECONNECT_REQUIRED' : 'Sync failed — provider error',
      });
    }
    if (reconnectRequired) {
      return res.status(409).json({ ok: false, error: { code: 'CALENDAR_RECONNECT_REQUIRED', message: 'Google Calendar needs to be reconnected.' } });
    }
    res.status(502).json({ ok: false, error: { code: 'CALENDAR_SYNC_UNAVAILABLE', message: 'Google Calendar sync is temporarily unavailable. Please try again shortly.' } });
  }
}
