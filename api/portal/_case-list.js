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
      `cases?org_id=eq.${account.org_id}&employee_name=eq.${encodeURIComponent(account.employee_name)}&select=id,case_type,stage,date_received`
    );
    const cases = await casesRes.json();

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
