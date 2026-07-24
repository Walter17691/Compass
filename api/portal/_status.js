import { supabaseRequest } from './_supabase.js';

// Lets the client ask "is this authenticated user a portal employee?"
// without ever granting the client direct read access to
// employee_portal_accounts — that table has zero client-facing RLS
// policies by design (see supabase/employee_portal_2026-07-25.sql).
export async function status(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${userId}&select=employee_name`);
    const accounts = await accountRes.json();
    if (accounts.length === 0) return res.status(200).json({ isPortalUser: false });
    res.status(200).json({ isPortalUser: true, employeeName: accounts[0].employee_name });
  } catch (e) {
    console.error('Portal status error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
