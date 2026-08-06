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

    // Name alone isn't a reliable identity key — two employees can share a
    // name within one org. Disambiguate by email when we have one on both
    // sides (the account's email was verified against the invite at accept
    // time); a case with no email on file is left in rather than dropped,
    // since omitting it silently would hide real cases from the employee.
    if (account.employee_email) {
      const accountEmail = account.employee_email.trim().toLowerCase();
      cases = cases.filter(c => !c.employee_email || c.employee_email.trim().toLowerCase() === accountEmail);
    }

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
