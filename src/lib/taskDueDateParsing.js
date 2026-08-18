// Integrations & Workflow Automation (Phase 5, IP24, §20) — real due-date
// parsing for a commitment phrase like "review after six weeks" or
// "follow up in 10 days", plus an owner suggestion resolved from the
// case's own existing owner/manager fields (never invented). General-
// purpose so every existing "propose a task from a finding" flow can
// consume it directly rather than duplicating date logic: Phase 7's
// acceptDocumentFinding (the "action" finding type) and IP23's
// acceptOhFinding (adjustment/restriction/further_information).

const WORD_TO_NUM = { a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12 };
const UNIT_TO_DAYS = { day:1, week:7, fortnight:14, month:30 };
const COMMITMENT_PATTERN = /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(day|week|fortnight|month)s?\b/i;

// Returns a YYYY-MM-DD due date parsed from the first day/week/fortnight/
// month commitment found in the text, or null if none is found — never
// guesses a date the text doesn't actually support.
export function parseCommitmentDueDate(text, fromDate = new Date()) {
  const match = COMMITMENT_PATTERN.exec(text || "");
  if (!match) return null;
  const rawValue = match[1].toLowerCase();
  const value = WORD_TO_NUM[rawValue] ?? Number(rawValue);
  if (!value) return null;
  const days = value * (UNIT_TO_DAYS[match[2].toLowerCase()] || 1);
  const due = new Date(fromDate.getTime());
  due.setDate(due.getDate() + days);
  return due.toISOString().split("T")[0];
}

// Only ever a real, already-known name on the case — cs.ownerId resolved
// against orgMembers, falling back to the case's own manager/
// investigating-manager fields. Never a guess, and "" (no suggestion) is
// a fully valid result, same as suggestAttendees (meetingScheduling.js).
export function suggestTaskOwner(cs, orgMembers) {
  if (cs?.ownerId) {
    const member = (orgMembers || []).find(m => m.id === cs.ownerId);
    if (member?.name) return member.name;
  }
  return cs?.manager || cs?.investigatingManager || "";
}
