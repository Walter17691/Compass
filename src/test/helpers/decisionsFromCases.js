// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.3 — a test fixture that mirrors the production cutover.
//
// Before D4.3, Current Warnings read cases.outcome / warningExpiresAt directly,
// so a test could express "this employee has a live first written warning" by
// putting those fields on a case and nothing else. After the cutover the
// authority is the case_decisions head and cases.* is a transactionally
// maintained projection of it.
//
// That left six test files whose fixtures described the old shape. The honest
// repair is NOT to loosen the assertions — it is to give the fixture the same
// shape production now has. This derives one `original` decision per
// outcome-bearing case, which is exactly what the D4.2 backfill did to the 137
// real rows and exactly what record_case_decision now writes alongside the
// projection. So every existing fixture keeps its meaning, while the assertion
// exercises the path the product actually takes.
//
// decidedAt comes from outcomeIssuedAt and is NOT invented when absent: a
// decision with no decided_at is deliberately not a live warning (135 of the 137
// backfilled rows have none), and a fixture that fabricated one would hide that.
//
// Tests that need a CHAIN — supersession, an appeal that varied or overturned a
// sanction, legacy_unmapped — must pass explicit decisions instead. A derived
// single original cannot express those, and pretending otherwise is how a
// supersession bug survives a green suite.
// ─────────────────────────────────────────────────────────────────────────
export function decisionsFromCases(cases) {
  return (cases || [])
    .filter(cs => cs && cs.outcome)
    .map(cs => ({
      id: `d-${cs.id}`,
      caseId: cs.id,
      decisionType: 'original',
      outcome: cs.outcome,
      outcomeNotes: cs.outcomeNotes || null,
      warningDurationMonths: cs.warningDurationMonths || null,
      warningExpiresAt: cs.warningExpiresAt || null,
      decidedAt: cs.outcomeIssuedAt || null,
      appealEffect: null,
      supersedesDecisionId: null,
    }));
}
