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

// Phase 6.5 hardening (P0, data-integrity review) — serialises writes for
// the same entity id so a later edit's save always executes strictly
// after an earlier one for that id has finished, reading whatever
// version/state that earlier save actually produced rather than a value
// captured before it ran. Without this, two saves fired close together
// for the same row (e.g. a fast edit followed immediately by another)
// can race over the network — the older request's response landing
// AFTER the newer one's — and silently overwrite the newer content or
// falsely reject it as a conflict. Different ids save independently;
// `queue` is a plain mutable object (a ref's .current, not the ref
// itself) keyed by id, extracted from saveAllegationToDB (Cluster 7) so
// any other per-row save path can use the exact same, tested guarantee.
// `fn` runs even if the previous save in the chain errored/rejected —
// one failure shouldn't wedge every later save for that same id.
export function enqueueSave(queue, id, fn) {
  const prevChain = queue[id] || Promise.resolve();
  const thisChain = prevChain.then(fn, fn);
  queue[id] = thisChain;
  return thisChain;
}

// Retries a conditionalUpdate-shaped {error, conflict} call once after a
// genuine transient failure (a network blip, a momentary 5xx) — never
// for a conflict, which won't resolve by simply trying again; the
// caller's own conflict handling (reload the real latest version) is the
// correct response to that instead. The user must never be left
// believing an edit saved when a transient failure silently dropped it
// with no retry at all.
export async function withTransientRetry(fn, { delayMs = 1500 } = {}) {
  let result = await fn();
  if (result.error && !result.conflict) {
    await new Promise(r => setTimeout(r, delayMs));
    result = await fn();
  }
  return result;
}
