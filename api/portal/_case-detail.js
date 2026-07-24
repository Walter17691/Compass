import { supabaseRequest } from './_supabase.js';

// Only ever return these fields for a meeting — never record/transcript/
// signDocument/riskScore/prediction/nextSteps, which are HR's private
// working notes. A meeting only counts as "formal correspondence" if a
// letter was actually generated and issued for it.
function toSafeMeeting(m) {
  return { type: m.type, date: m.date, letterOutput: m.letterOutput };
}

export async function caseDetail(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, caseId } = req.query;
  if (!userId || !caseId) return res.status(400).json({ error: 'userId and caseId are required' });

  try {
    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${userId}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    const caseRes = await supabaseRequest(`cases?id=eq.${caseId}&select=*`);
    const cases = await caseRes.json();
    const cs = cases[0];
    if (!cs) return res.status(404).json({ error: 'Case not found' });

    // Ownership check — this case must actually belong to this portal
    // account's org and employee_name, not just any case id the caller
    // happens to pass in.
    if (cs.org_id !== account.org_id || cs.employee_name !== account.employee_name) {
      return res.status(403).json({ error: 'You do not have access to this case' });
    }

    const meetings = Array.isArray(cs.meetings) ? cs.meetings : [];
    const formalLetters = meetings.filter(m => m.letterOutput && String(m.letterOutput).trim()).map(toSafeMeeting);

    res.status(200).json({
      caseType: cs.case_type,
      stage: cs.stage,
      meetings: formalLetters,
    });
  } catch (e) {
    console.error('Portal case-detail error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
