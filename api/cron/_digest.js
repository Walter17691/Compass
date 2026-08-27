import { supabaseRequest, getUserEmail } from './_supabase.js';
import { fetchAllPagesServer } from '../_paginatedFetch.js';
import { postWebhook } from './_notify.js';
import { computeDueSoon } from '../../src/lib/deadlines.js';
import { mapCaseRow } from '../../src/lib/caseMapping.js';
import { isHrRole, hasConfidentialOversight, canSeeAllOrgCases, canAccessCaseLocation } from '../../src/lib/roles.js';
import { escapeHtml as esc } from '../_html.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// A daily email listing everything due in the next two weeks (the in-app
// banner's window) would repeat the same items for days and train people
// to ignore it. The digest only carries the "act now" set.
const DIGEST_WINDOW_DAYS = 3;

function isUrgent(d) {
  return d.overdue || d.daysLeft <= DIGEST_WINDOW_DAYS;
}

export function digestHtml(items) {
  const rows = items.map(d => `
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:13px">
      <div><strong>${esc(d.employeeName)}</strong><span style="color:#666;margin-left:8px">${esc(d.label)}</span></div>
      <span style="color:${d.overdue ? '#C84B2F' : '#7C5CFC'};white-space:nowrap;margin-left:12px">${d.overdue ? `${d.daysOverdue}d overdue` : `${d.daysLeft}d left`}</span>
    </div>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 20px">
    <h2 style="color:#7C5CFC">Compass HR — Deadline digest</h2>
    <p style="color:#444;font-size:14px">${items.length} item${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} attention:</p>
    <div style="margin:16px 0">${rows}</div>
    <div style="text-align:center;margin:28px 0 8px">
      <a href="${APP_URL}" style="background:#7C5CFC;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open Compass</a>
    </div>
  </div>`;
}

async function sendDigestEmail(email, items) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Compass HR <notifications@mail.compasshruk.com>',
      to: [email],
      subject: `${items.length} compliance deadline${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} attention`,
      html: digestHtml(items),
    }),
  });
  if (!res.ok) console.error('Digest email failed for', email, await res.text());
}

// This job runs with the service-role key, which bypasses RLS entirely —
// unlike every in-app view of dueSoon (the overdue banner, cases list),
// which Postgres RLS already scopes to cases the logged-in user can see.
//
// Phase 6.5 hardening (P0) — this used to check only the confidential
// flag (creator/case_access/hr_director), which is real but incomplete:
// it's just one of three RLS policies actually layered on cases.SELECT.
// The other two apply regardless of confidentiality — a location_manager
// or line_manager only sees cases they created, own, or hold case_access
// on (manager_enablement_case_access_2026-08-13.sql's own restrictive
// policy, deliberately narrowing even NON-confidential visibility), and
// a location_manager with real assigned locations is further filtered to
// their own sites (can_access_case_location()). Without this, every
// opted-in member — regardless of role or location — got emailed every
// non-confidential deadline org-wide, which real in-app browsing (RLS-
// protected) would never show them. This function now mirrors all three
// policies exactly; see src/lib/roles.js's canAccessCaseLocation/
// canSeeAllOrgCases/hasConfidentialOversight for the individual pieces.
//
// wellbeing deadlines have no case behind them at all — wellbeing_notes'
// own RLS is narrower still (is_hr_role: hr_manager/hr_director only,
// NOT legal_reviewer/auditor, unlike case confidentiality's broader
// oversight set) and gets its own branch rather than being forced
// through the case-shaped checks below. leaver deadlines are genuinely
// org-wide with no further restriction, matching leaver_instances' own
// real SELECT RLS (org membership only, no role check).
//
// Phase 6.5 hardening (closes Prompt 11 audit finding 2.6, MEDIUM) —
// dsar/redundancy deadlines used to fall through the same blanket
// `if (!deadline.caseId) return true` as leaver — but dsar_requests and
// redundancy_cases are BOTH is_hr_role-only in their live RLS (the
// comment this replaces was simply wrong about dsar_requests, which
// closed to HR-only via dsar_hr_only_access_2026-08-22.sql — after this
// comment was written, per the finding's own framing). A non-HR opted-in
// member was receiving an email naming an employee and their DSAR due
// date every morning — directly disclosing who has filed a subject
// access request, often the precursor to a tribunal claim against those
// same managers.
const CASELESS_CATEGORY_AUTH = {
  wellbeing: member => isHrRole(member.role),
  dsar: member => isHrRole(member.role),
  redundancy: member => isHrRole(member.role),
  leaver: () => true,
};
export function isAuthorisedFor(deadline, member, caseAccessByCase, casesById = new Map()) {
  if (!deadline.caseId) {
    const check = CASELESS_CATEGORY_AUTH[deadline.category];
    // Fail closed for any future caseId-less category this map hasn't
    // been taught about yet, rather than silently defaulting to "everyone".
    return check ? check(member) : false;
  }

  const cs = casesById.get(deadline.caseId);
  if (!cs) return false; // can't verify against real case data — fail closed

  const hasCaseAccess = (caseAccessByCase.get(deadline.caseId) || new Set()).has(member.user_id);

  // Mirrors "Users can access cases in their org or assigned to them" (PERMISSIVE).
  const locationOk = canAccessCaseLocation(member.role, member.location_ids, cs.locationId);
  if (!(locationOk || hasCaseAccess)) return false;

  // Mirrors "Non-oversight members restricted to their own assigned
  // cases" (RESTRICTIVE) — applies to every case, confidential or not.
  const ownershipOk = canSeeAllOrgCases(member.role) || cs.createdBy === member.user_id || cs.ownerId === member.user_id || hasCaseAccess;
  if (!ownershipOk) return false;

  // Mirrors "Confidential cases restricted to authorised staff" (RESTRICTIVE).
  if (deadline.confidential) {
    return cs.createdBy === member.user_id || hasCaseAccess || hasConfidentialOversight(member.role);
  }
  return true;
}

export async function runDigest() {
  const orgsRes = await supabaseRequest('organisations?select=id,name,plan,notification_webhook_url,notification_webhook_type');
  const orgs = await orgsRes.json();

  let sent = 0;
  let webhooksNotified = 0;
  for (const org of orgs) {
    // The digest is a Pro feature — email_digest_opt_in defaults to true
    // for every org member regardless of plan, so this check (not the
    // client-side toggle) is what actually enforces the gate.
    if (org.plan !== 'pro') continue;
    // Phase 6.5 hardening (structural remediation, Prompt 12 — Pagination
    // / Complete-Data invariant) — every one of these was a single
    // unpaginated request, silently truncated at PostgREST's default row
    // cap once an org's row count crossed it. Confirmed live: the
    // largest real org has 2,715 cases, so the un-paged `cases` query
    // alone was dropping 1,715 of them (63%) from every digest run,
    // meaning deadline alerts for well over half that org's cases never
    // went out. fetchAllPagesServer (api/_paginatedFetch.js) is the
    // server-side twin of src/lib/paginatedFetch.js's client-side
    // fetchAllPages, which already closed this exact bug for
    // loadCasesFromDB/loadEmployeeRecords.
    const { data: rows } = await fetchAllPagesServer(`cases?org_id=eq.${org.id}&select=*&order=id.asc`);
    const { data: dsarRequests } = await fetchAllPagesServer(`dsar_requests?org_id=eq.${org.id}&status=neq.completed&select=*&order=id.asc`);
    const dueSoon = computeDueSoon(rows.map(mapCaseRow), dsarRequests);
    const urgent = dueSoon.filter(isUrgent);
    if (urgent.length === 0) continue;

    // location_ids added for canAccessCaseLocation; casesById gives
    // isAuthorisedFor the same location_id/owner_id/created_by every
    // other RLS-equivalent check in this codebase reads off the raw row.
    const { data: members } = await fetchAllPagesServer(`org_members?org_id=eq.${org.id}&email_digest_opt_in=eq.true&select=user_id,role,location_ids&order=user_id.asc`);

    const casesById = new Map(rows.map(r => [r.id, { locationId: r.location_id, ownerId: r.owner_id, createdBy: r.created_by }]));

    const { data: caseAccessRows } = await fetchAllPagesServer(`case_access?org_id=eq.${org.id}&select=case_id,user_id&order=case_id.asc`);
    const caseAccessByCase = new Map();
    for (const row of caseAccessRows) {
      if (!caseAccessByCase.has(row.case_id)) caseAccessByCase.set(row.case_id, new Set());
      caseAccessByCase.get(row.case_id).add(row.user_id);
    }

    for (const member of members) {
      const authorised = urgent.filter(d => isAuthorisedFor(d, member, caseAccessByCase, casesById));
      if (authorised.length === 0) continue;
      const email = await getUserEmail(member.user_id);
      if (!email) continue;
      await sendDigestEmail(email, authorised);
      sent++;
    }

    // Never confidential deadlines here: a webhook is one shared, org-wide
    // destination (e.g. a Slack channel) with no per-recipient authorisation
    // to check against, unlike the per-member email loop above.
    const publicUrgent = urgent.filter(d => !d.confidential);
    if (org.notification_webhook_url && publicUrgent.length > 0) {
      const ok = await postWebhook(org.notification_webhook_url, org.notification_webhook_type, publicUrgent.length);
      if (ok) webhooksNotified++;
    }
  }
  return { orgsChecked: orgs.length, emailsSent: sent, webhooksNotified };
}
