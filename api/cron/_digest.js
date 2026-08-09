import { supabaseRequest, getUserEmail } from './_supabase.js';
import { postWebhook } from './_notify.js';
import { computeDueSoon } from '../../src/lib/deadlines.js';
import { mapCaseRow } from '../../src/lib/caseMapping.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// A daily email listing everything due in the next two weeks (the in-app
// banner's window) would repeat the same items for days and train people
// to ignore it. The digest only carries the "act now" set.
const DIGEST_WINDOW_DAYS = 3;

function isUrgent(d) {
  return d.overdue || d.daysLeft <= DIGEST_WINDOW_DAYS;
}

function digestHtml(items) {
  const rows = items.map(d => `
    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:13px">
      <div><strong>${d.employeeName}</strong><span style="color:#666;margin-left:8px">${d.label}</span></div>
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
// A confidential case (confidential_cases_2026-07-26.sql) is restricted to
// its creator, anyone granted case_access, and hr_directors — nobody else,
// including other hr_managers in the same org. Without this check, every
// opted-in org member would get emailed the employee name and deadline for
// a confidential case they have no right to see, and a configured Slack/
// Teams webhook (one shared, org-wide destination with no per-user
// boundary at all) would broadcast it to everyone who can read that
// channel.
export function isAuthorisedFor(deadline, member, caseAccessByCase) {
  if (!deadline.confidential) return true;
  if (member.role === 'hr_director') return true;
  if (deadline.createdBy && deadline.createdBy === member.user_id) return true;
  return (caseAccessByCase.get(deadline.caseId) || new Set()).has(member.user_id);
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
    const casesRes = await supabaseRequest(`cases?org_id=eq.${org.id}&select=*`);
    const rows = await casesRes.json();
    const dsarRes = await supabaseRequest(`dsar_requests?org_id=eq.${org.id}&status=neq.completed&select=*`);
    const dsarRequests = await dsarRes.json();
    const dueSoon = computeDueSoon(rows.map(mapCaseRow), dsarRequests);
    const urgent = dueSoon.filter(isUrgent);
    if (urgent.length === 0) continue;

    const membersRes = await supabaseRequest(`org_members?org_id=eq.${org.id}&email_digest_opt_in=eq.true&select=user_id,role`);
    const members = await membersRes.json();

    const caseAccessRes = await supabaseRequest(`case_access?org_id=eq.${org.id}&select=case_id,user_id`);
    const caseAccessRows = await caseAccessRes.json();
    const caseAccessByCase = new Map();
    for (const row of caseAccessRows) {
      if (!caseAccessByCase.has(row.case_id)) caseAccessByCase.set(row.case_id, new Set());
      caseAccessByCase.get(row.case_id).add(row.user_id);
    }

    for (const member of members) {
      const authorised = urgent.filter(d => isAuthorisedFor(d, member, caseAccessByCase));
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
      const ok = await postWebhook(org.notification_webhook_url, org.notification_webhook_type, publicUrgent);
      if (ok) webhooksNotified++;
    }
  }
  return { orgsChecked: orgs.length, emailsSent: sent, webhooksNotified };
}
