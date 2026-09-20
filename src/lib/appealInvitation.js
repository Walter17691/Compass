import { isAppealMeeting } from './meetingTypeMatch.js';
import { isLetterOnlyRecord } from './caseStage.js';

// Appeal hearing sequencing P1 (Human UAT, 2026-09-20) — the saved appeal
// invitation is the deterministic source for BOTH "an invitation exists" and
// "when/where the hearing is scheduled". Both facts were already persisted
// and simply never read: the invitation record carries hearingDate,
// hearingTime and hearingLocationOrMethod (written by saveMeetingToCaseImpl),
// yet Start appeal hearing defaulted the date to today and offered no time or
// method field at all.
//
// Structured fields only. Never the invitation's own `date` (that is the SAVE
// date — the source of the wrong 20/09 default), never the current date when
// real logistics exist, never AI extraction, never parsing the letter prose.

// A record counts as a valid saved appeal invitation when it is an
// appeal-type entry that is letter-shaped (no hearing content of its own),
// is specifically an invitation, and actually carries a saved letter. The
// letterOutput requirement matches hasLetterType's own convention and stops
// a placeholder/aborted record qualifying.
export function isValidAppealInvitation(meeting) {
  if (!meeting) return false;
  if (!isAppealMeeting(meeting.type || "")) return false;
  if (meeting.letterType !== "invite") return false;
  if (!meeting.letterOutput) return false;
  return isLetterOnlyRecord(meeting);
}

// Deterministic selection when more than one invitation has been saved (a
// redraft, or an appeal invited twice after a rearrangement): the most
// recently SAVED one wins, using savedAt — the stable timestamp
// saveMeetingToCaseImpl already stamps on every record. Entries with no
// savedAt (legacy, predating that field) never displace one that has it, and
// among themselves fall back to stored array order, which is append order.
// Ties resolve to the later array position for the same reason.
export function findLatestAppealInvitation(caseObj) {
  const meetings = Array.isArray(caseObj?.meetings) ? caseObj.meetings : [];
  let best = null;
  let bestAt = null;
  meetings.forEach(m => {
    if (!isValidAppealInvitation(m)) return;
    const at = m.savedAt ? Date.parse(m.savedAt) : NaN;
    const hasAt = !Number.isNaN(at);
    if (!best) { best = m; bestAt = hasAt ? at : null; return; }
    if (hasAt && bestAt === null) { best = m; bestAt = at; return; }
    if (hasAt && bestAt !== null && at >= bestAt) { best = m; bestAt = at; return; }
    if (!hasAt && bestAt === null) { best = m; }
  });
  return best;
}

// The scheduled logistics to seed the real hearing form with. Returns null
// rather than a partially-filled object when the invitation predates
// structured logistics, so callers fall back to their existing safe defaults
// instead of seeding a half-populated form.
export function appealInvitationLogistics(caseObj) {
  const invitation = findLatestAppealInvitation(caseObj);
  if (!invitation) return null;
  const date = invitation.hearingDate || "";
  const time = invitation.hearingTime || "";
  const locationOrMethod = invitation.hearingLocationOrMethod || "";
  if (!date && !time && !locationOrMethod) return null;
  return { date, time, locationOrMethod };
}
