// Integrations & Workflow Automation (Phase 5, IP4, §30) — turns the raw
// integration_events rows (loaded newest-first, see loadIntegrationEvents
// in App.jsx) into a per-provider health summary for the Integration
// Health settings section.
//
// Assumes `events` is already sorted newest-first, matching the
// `.order('created_at', {ascending:false})` the loader queries with —
// this function never re-sorts, so a caller passing unsorted events will
// get a summary that silently answers the wrong question.
export function summarizeIntegrationHealth(events) {
  const byProvider = {};

  for (const event of events || []) {
    if (!byProvider[event.provider]) {
      byProvider[event.provider] = {
        lastSuccessAt: null,
        lastErrorAt: null,
        lastErrorDetail: null,
        recentFailureCount: 0,
        sawSuccess: false,
      };
    }
    const summary = byProvider[event.provider];

    if (event.status === 'success') {
      if (!summary.lastSuccessAt) summary.lastSuccessAt = event.created_at;
      summary.sawSuccess = true;
    } else if (event.status === 'error') {
      if (!summary.lastErrorAt) {
        summary.lastErrorAt = event.created_at;
        summary.lastErrorDetail = event.detail || null;
      }
      // Only counts errors newer than the most recent success — an old
      // failure that's since been superseded by a successful sync isn't
      // "recent" anymore.
      if (!summary.sawSuccess) summary.recentFailureCount += 1;
    }
  }

  return Object.fromEntries(
    Object.entries(byProvider).map(([provider, s]) => [
      provider,
      {
        lastSuccessAt: s.lastSuccessAt,
        lastErrorAt: s.lastErrorAt,
        lastErrorDetail: s.lastErrorDetail,
        recentFailureCount: s.recentFailureCount,
      },
    ])
  );
}
