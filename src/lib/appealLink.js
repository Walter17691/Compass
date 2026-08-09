// Cases eligible to receive a detected appeal meeting — scoped to the
// same employee the meeting is already for (caseInfo.employee), not
// every case in the org. Showing every case here would make it easy to
// misfile an appeal against the wrong employee entirely.
export function appealLinkCandidates(cases, employeeName) {
  const name = (employeeName || "").trim().toLowerCase();
  if (!name) return cases;
  return cases.filter(cs => (cs.employeeName || "").trim().toLowerCase() === name);
}
