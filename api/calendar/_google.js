// Converts the app's "DD/MM/YYYY" date strings into Google Calendar's
// all-day-event date format. Deadlines have no time-of-day (see plan doc),
// so every synced event is an all-day event. Google's all-day `end.date`
// is exclusive, so a single-day event needs end = start + 1 day.
function ddmmyyyyToIso(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function nextDayIso(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function deadlineToGoogleEvent(deadline) {
  const startIso = ddmmyyyyToIso(deadline.deadlineDate);
  return {
    summary: `[Compass] ${deadline.label} — ${deadline.employeeName}`,
    description: `Category: ${deadline.category}\nSynced automatically from Compass HR. Editing this event won't change the deadline in Compass.`,
    start: { date: startIso },
    end: { date: nextDayIso(startIso) },
  };
}

// Refreshes the access token if it's expired (or about to, within 60s),
// returning { accessToken, newExpiresAt } — newExpiresAt is null if no
// refresh was needed, so callers know whether to persist an update.
export async function getValidAccessToken(connection) {
  const expiresAt = new Date(connection.expires_at).getTime();
  if (expiresAt - Date.now() > 60 * 1000) {
    return { accessToken: connection.access_token, newExpiresAt: null };
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Failed to refresh Google access token: ' + JSON.stringify(data));
  return {
    accessToken: data.access_token,
    newExpiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export async function googleCalendarRequest(accessToken, path, options = {}) {
  return fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}
