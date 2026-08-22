import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

// Only ever return these fields for a meeting — never record/transcript/
// signDocument/riskScore/prediction/nextSteps, which are HR's private
// working notes. A meeting only counts as "formal correspondence" if a
// letter was actually generated and issued for it.
function toSafeMeeting(m) {
  return { type: m.type, date: m.date, letterOutput: m.letterOutput };
}

export async function caseDetail(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  const { caseId } = req.query;
  if (!caseId) return res.status(400).json({ error: 'caseId is required' });

  try {
    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${encodeURIComponent(caller.id)}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    const caseRes = await supabaseRequest(`cases?id=eq.${encodeURIComponent(caseId)}&select=*`);
    const cases = await caseRes.json();
    const cs = cases[0];
    if (!cs) return res.status(404).json({ error: 'Case not found' });

    // Ownership check — this case must actually belong to this portal
    // account's org and employee, not just any case id the caller happens
    // to pass in. Phase 6.5 hardening (P0, security review) — name alone
    // can collide between two employees in the same org, so email is the
    // real disambiguator (see _case-list.js for the fuller reasoning);
    // previously a missing email on EITHER side let the match through,
    // which meant any case record incomplete enough to lack an
    // employee_email — not an unusual state — was readable by every
    // same-named portal user in the org, confidential cases included.
    // Both emails must be present and equal; missing on either side
    // fails closed (403), never falls through to a name-only match.
    const accountEmail = (account.employee_email || '').trim().toLowerCase();
    const caseEmail = (cs.employee_email || '').trim().toLowerCase();
    const sameEmployee = cs.employee_name === account.employee_name && !!accountEmail && !!caseEmail && accountEmail === caseEmail;
    if (cs.org_id !== account.org_id || !sameEmployee) {
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
