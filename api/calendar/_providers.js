// Integrations & Workflow Automation (Phase 5, IP3) — a small adapter so
// _create-event.js/_update-event.js/_delete-event.js don't each need
// their own "if google... else if microsoft..." branch. Each entry's
// shape (getValidAccessToken/request/buildEvent/eventsPath) mirrors the
// same three functions _google.js and _microsoft.js already export —
// this module doesn't reimplement any provider logic, it just picks
// between the two.
import { supabaseRequest } from './_supabase.js';
import { getValidAccessToken as getGoogleToken, googleCalendarRequest, buildGoogleEvent } from './_google.js';
import { getValidAccessToken as getMicrosoftToken, graphCalendarRequest, buildMicrosoftEvent } from './_microsoft.js';

const ADAPTERS = {
  google: { getValidAccessToken: getGoogleToken, request: googleCalendarRequest, buildEvent: buildGoogleEvent, eventsPath: 'events', updateMethod: 'PUT' },
  microsoft: { getValidAccessToken: getMicrosoftToken, request: graphCalendarRequest, buildEvent: buildMicrosoftEvent, eventsPath: 'events', updateMethod: 'PATCH' },
};

export function providerAdapter(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new Error(`Unknown calendar provider: ${provider}`);
  return adapter;
}

// calendar_connections.provider ('google'/'microsoft') vs.
// integration_events.provider ('google_calendar'/'ms365_calendar') are
// deliberately different vocabularies — the former is this table's own
// long-standing column, the latter matches the Integration Centre's
// catalog ids (src/lib/integrations.js) so events line up with the rows
// they're reported against.
export const INTEGRATION_EVENT_PROVIDER = { google: 'google_calendar', microsoft: 'ms365_calendar' };

// Refreshes a connection's access token if needed and persists the
// refresh (and rotated refresh token, when the provider issues one),
// returning just the token — every create/update/delete handler needs
// this same step regardless of which provider it's talking to.
export async function freshAccessToken(connection) {
  const adapter = providerAdapter(connection.provider);
  const { accessToken, newExpiresAt, newRefreshToken } = await adapter.getValidAccessToken(connection);
  if (newExpiresAt) {
    await supabaseRequest(`calendar_connections?id=eq.${connection.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        access_token: accessToken,
        expires_at: newExpiresAt,
        ...(newRefreshToken ? { refresh_token: newRefreshToken } : {}),
        updated_at: new Date().toISOString(),
      }),
    });
  }
  return accessToken;
}

// Integrations & Workflow Automation (Phase 5, IP16, §10) — availability
// checks. Same "pick between the two providers" reasoning as the rest of
// this file: Google's events.list (with a time window) and Microsoft
// Graph's calendarView return differently-shaped JSON for "what's on my
// calendar in this range" — this is the one place that difference is
// resolved, so _check-availability.js reads one normalized shape
// regardless of provider.
export function availabilityPath(provider, startISO, endISO) {
  if (provider === 'google') {
    return `events?timeMin=${encodeURIComponent(startISO)}&timeMax=${encodeURIComponent(endISO)}&singleEvents=true`;
  }
  if (provider === 'microsoft') {
    return `calendarView?startDateTime=${encodeURIComponent(startISO)}&endDateTime=${encodeURIComponent(endISO)}`;
  }
  throw new Error(`Unknown calendar provider: ${provider}`);
}

// Only used for the Microsoft request — asks Graph to return
// calendarView's start/end already normalized to UTC (its default is the
// user's own mailbox timezone), matching how every other time this app
// handles Microsoft calendar events (see _microsoft.js's own comment).
export function availabilityRequestOptions(provider) {
  return provider === 'microsoft' ? { headers: { Prefer: 'outlook.timezone="UTC"' } } : {};
}

export function normalizeAvailabilityEvents(provider, json) {
  if (provider === 'google') {
    return (json?.items || []).map(e => ({ title: e.summary || 'Busy', start: e.start?.dateTime || e.start?.date || null, end: e.end?.dateTime || e.end?.date || null }));
  }
  if (provider === 'microsoft') {
    return (json?.value || []).map(e => ({ title: e.subject || 'Busy', start: e.start?.dateTime ? e.start.dateTime + 'Z' : null, end: e.end?.dateTime ? e.end.dateTime + 'Z' : null }));
  }
  return [];
}
