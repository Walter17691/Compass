// Weighted selection-criteria scoring for redundancy pools. Pure — no
// React, no I/O — so it's testable in isolation from the case state it's
// normally called against. Getting this wrong has real discrimination-risk
// consequences (UK redundancy selection must be objective and defensible),
// so the weighting math deserves direct coverage rather than only being
// exercised indirectly through the UI.
//
// Each criterion carries a `weight` (expected to be a percentage, with all
// criteria in a pool summing to 100 so the result reads naturally against
// a "/5.0" style scale when scores run 0-5) and each employee's raw score
// per criterion is weighted by weight/100 and summed.
export function computeSelectionScore(existingScores, criterionId, score, selectionCriteria) {
  const scores = { ...(existingScores || {}), [criterionId]: score };
  // Sum score*weight as integers and divide by 100 only once at the end —
  // dividing per-criterion first (the original approach) accumulates
  // binary floating-point error, e.g. 4*0.30 + 3*0.25 = 1.9499999999999999
  // in IEEE 754, which .toFixed(1) then rounds DOWN to "1.9" instead of
  // the mathematically correct "2.0". Math.round on a *10 value sidesteps
  // this since halves like 19.5 are exactly representable in binary.
  const weightedSum = selectionCriteria.reduce((total, c) => total + (scores[c.id] || 0) * c.weight, 0);
  const totalScore = (Math.round(weightedSum / 10) / 10).toFixed(1);
  return { scores, totalScore };
}
