// AI-drafted letters (outcome/invite/appeal, etc. — see App.jsx's
// LETTER_INSTRUCTIONS) carry real legal and financial consequences once
// they reach an employee, so sending one requires an explicit human
// approval step, not just "HR looked at the screen." Approval is tied to
// the exact letter text via a snapshot rather than a bare boolean flag —
// editing or regenerating the letter after approving it must silently
// invalidate the approval, since what gets sent must be exactly what was
// reviewed.

export function isLetterApproved(letterOutput, approval) {
  return !!(letterOutput && approval && approval.snapshot === letterOutput);
}

export function createLetterApproval(letterOutput, { by, type }) {
  return {
    snapshot: letterOutput,
    by: by || "HR Manager",
    type: type || null,
    at: new Date().toISOString(),
  };
}
