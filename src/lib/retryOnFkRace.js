// A freshly created case's own Supabase write is fire-and-forget (see
// saveCaseToDB in App.jsx — it upserts without the caller awaiting it,
// then immediately navigates the user into the case). A write to a table
// that references that case's id via a hard foreign key (allegations,
// case_tasks, audit_log.case_id) can occasionally reach Postgres before
// the case row itself has committed, especially when several other
// writes are in flight at once. Postgres reports this as error code
// 23503 (foreign_key_violation). The same race can also surface as 42501
// (row-level security violation) on tables whose RLS policy itself checks
// case existence via a subquery to public.cases (allegations, case_tasks
// both do — see supabase/case_structure_2026-08-09.sql) — that subquery
// can't see the case row either until it's committed. One short retry
// covers that narrow window without making every case-scoped write block
// on the case's own save finishing first.
const FK_VIOLATION = "23503";
const RLS_VIOLATION = "42501";

export async function withFkRetry(insertFn, { delayMs = 1500 } = {}) {
  const { error } = await insertFn();
  if (error?.code === FK_VIOLATION || error?.code === RLS_VIOLATION) {
    await new Promise(r => setTimeout(r, delayMs));
    return insertFn();
  }
  return { error };
}
