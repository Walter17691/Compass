// Phase 6.5 hardening (P0, Cluster 6) — the optimistic-concurrency guard
// saveCaseToDB (App.jsx) already has (conditional update on updated_at,
// falling back to a plain upsert only for a row's very first save),
// extracted so allegations can use the exact same pattern instead of a
// second, drifting reimplementation. Not yet applied to the other tables
// Cluster 6 names (case_tasks, case_signals, org_events,
// improvement_initiatives, wellbeing_notes, concern_referrals, starter/
// leaver_instances) — those are P2 ("stale-closure races"), out of scope
// for this P0 (per-keystroke allegation data loss); this helper exists so
// they can adopt it later without a second implementation to keep in sync.
//
// Returns {error, conflict}: conflict=true means the row's updated_at no
// longer matched what the caller last saw — someone else saved first, and
// this write was NOT applied. error is only set for a genuine Supabase/
// network failure, distinct from a conflict.
export async function conditionalUpdate(supabase, table, id, updatedAt, payload) {
  if (!updatedAt) {
    const { error } = await supabase.from(table).upsert({ id, ...payload }).select();
    return { error, conflict: false };
  }
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).eq('updated_at', updatedAt).select();
  if (error) return { error, conflict: false };
  if (!data || data.length === 0) return { error: null, conflict: true };
  return { error: null, conflict: false };
}
