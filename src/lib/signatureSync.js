import { isTerminalStatus } from './eSignature';
import { awaitsEmployerReview } from './employeeResponse';

// ─────────────────────────────────────────────────────────────────────────
// WHICH SIGNING REQUESTS THE CASE VIEW SHOULD RE-READ, AND WHEN TO LOOK AGAIN.
//
// ┌─ THE DEFECT THIS CLOSES (TRUST-SIG-05) ─────────────────────────────────┐
// │ Human production UAT: a dispute resolved as `partially_accepted` in       │
// │ signing_requests kept rendering "Signed — notes disputed". The previous   │
// │ patch claimed opening the case would repair the stale mirror through the   │
// │ ordinary signature sync. It does not, and the reason is mount ORDER, not  │
// │ the filter I had been staring at:                                        │
// │                                                                         │
// │   App.jsx:346   screen        = useState(() => readNavFromUrl().screen)   │
// │   App.jsx:1512  activeCaseId  = useState(() => readNavFromUrl().caseId)   │
// │   App.jsx:512   cases         = useState([])                              │
// │   App.jsx:2700  useEffect(() => { if(org?.id) loadCasesFromDB(); }, …)    │
// │                                                                         │
// │ Navigation state is restored SYNCHRONOUSLY from the URL. Cases arrive     │
// │ asynchronously, after auth and org resolve. So on a hard refresh of a     │
// │ case URL the sync effect runs on the FIRST render, finds                  │
// │ cases.find(...) === undefined, takes its `if (!pending.length) return`    │
// │ exit — and never runs again, because `cases` is deliberately excluded     │
// │ from its dependency array.                                               │
// │                                                                         │
// │ My claim "the poll includes the stale meeting" was false. The poll never  │
// │ got as far as the meeting: it had already given up before the case        │
// │ existed in state. This has always been broken on a hard refresh or a      │
// │ direct link — it only ever worked when a user NAVIGATED into a case,      │
// │ because that changes activeCaseId after the data is present.             │
// └─────────────────────────────────────────────────────────────────────────┘
//
// THE FIX IS NOT "ADD `cases` TO THE DEPS". That dependency was removed for a
// real reason, recorded at the effect: re-running on every unrelated case-data
// change refires the check mid-edit and spams the signing API. Both things have
// to be true at once — notice data ARRIVING, ignore data merely CHANGING.
//
// So the effect depends on a KEY over the facts the sync actually acts on. The
// key moves from "" to a real value when cases load, which re-runs the effect
// exactly once at the moment the data appears. Editing meeting notes, saving a
// record, or any other case write leaves the key identical, so none of them
// refire it. It is the original intent, now actually achievable.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The requests whose stored state the case view should re-read.
 *
 * Two reasons to look:
 *   · the PARTICIPANT might still act — the request is not terminal;
 *   · an EMPLOYER review might have landed elsewhere — the request is signed and
 *     the mirror still shows a dispute awaiting review. Another tab, another
 *     manager, or a session whose mirror write lost an updated_at race.
 */
export function syncCandidates(meetings) {
  return (meetings || []).filter(m => m && m.signId
    && (!isTerminalStatus(m.signStatus) || awaitsEmployerReview(m)));
}

/**
 * A stable key over the candidates, for use as an effect dependency.
 *
 * It encodes ONLY the facts the sync reads and writes. That is the whole design:
 *
 *   ""                               no case in state yet  -> effect waits
 *   "m1:s1:signed:disputed:-"        case arrived           -> effect runs
 *   "m1:s1:signed:disputed:partially_accepted"  repaired    -> runs once more,
 *                                                              finds nothing to
 *                                                              do, and stops
 *
 * Deliberately NOT included: `record`, `participantComment`, or anything else a
 * manager can edit. Including them would reintroduce the mid-edit refiring the
 * original author removed `cases` to prevent.
 *
 * Termination: a repaired meeting leaves the candidate set, so the key changes at
 * most once more and the next run has nothing to fetch. No loop is possible.
 *
 * Honest note on `responseResolution` in the key: it is BEHAVIOURALLY REDUNDANT.
 * Mutation testing removed it and every test still passed, because a repaired
 * meeting stops being a candidate at all — the key goes to "" from the list
 * shrinking, not from the field. It is kept because it states what this sync acts
 * on, and because it keeps the key correct if the candidate rule is ever widened
 * to include resolved requests. It is not load-bearing today; do not assume it is.
 */
export function signatureSyncKey(meetings) {
  return syncCandidates(meetings)
    .map(m => [m.id, m.signId, m.signStatus || '-',
      m.responseType || '-', m.responseResolution || '-'].join(':'))
    .sort()
    .join('|');
}
