import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

export async function caseList(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${caller.id}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    const casesRes = await supabaseRequest(
      `cases?org_id=eq.${account.org_id}&employee_name=eq.${encodeURIComponent(account.employee_name)}&select=id,case_type,stage,date_received,employee_email`
    );
    let cases = await casesRes.json();

    // Phase 6.5 hardening (P0, security review) — name alone isn't a
    // reliable ownership boundary: two employees can share a name within
    // one org. Disambiguate by email (the account's was verified against
    // the invite at accept time — see _accept-invite.js). Previously, a
    // case with no employee_email on file was left IN rather than
    // dropped, on the reasoning that omitting it would silently hide a
    // real case — but that's exactly backwards for confidential HR case
    // data: it meant any case missing an employee_email (an incomplete
    // record, not an unusual one) was exposed to every same-named portal
    // user in the org, including ones it has nothing to do with. Fail
    // closed instead — a case with no email on file, or a portal account
    // with no email on file, is excluded rather than shown.
    const accountEmail = (account.employee_email || '').trim().toLowerCase();
    cases = accountEmail
      ? cases.filter(c => c.employee_email && c.employee_email.trim().toLowerCase() === accountEmail)
      : [];

    // Curated response only — no meetings/evidence/notes leave this endpoint.
    const curated = cases.map(c => ({
      id: c.id,
      caseType: c.case_type,
      stage: c.stage,
      dateReceived: c.date_received,
    }));

    res.status(200).json({ cases: curated });
  } catch (e) {
    console.error('Portal case-list error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
