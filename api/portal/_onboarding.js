import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

// Every task's owner is one of HR/Line Manager/IT/Facilities/Payroll (see
// TemplatesSection.jsx's OWNERS list) — there's no "Employee" owner, so no
// task in this checklist is ever the new starter's own to complete. This is
// read-only for the portal: it shows onboarding progress for transparency,
// but letting the employee toggle tasks they don't own would let them
// mark HR/IT/Payroll's prep work as done regardless of whether it actually
// happened, corrupting the tracking staff rely on. `note` is HR's internal
// working note on the task and isn't returned, same as `record`/transcript
// are withheld from case correspondence in _case-detail.js.
function toSafeTask(t) {
  return { id: t.id, task: t.task, owner: t.owner, dueDate: t.dueDate, done: t.done };
}

export async function onboarding(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const caller = await verifyCaller(req);
    if (!caller) return res.status(401).json({ error: 'Unauthorized' });

    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${caller.id}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    // Phase 6.5 hardening (security review) — same class of bug as
    // _case-list.js/_case-detail.js: org_id+name alone lets two same-named
    // new starters in one org see each other's onboarding checklist.
    // starter_instances carries its own `email` column; require it to
    // match the portal account's employee_email rather than falling back
    // to a name-only match when either is missing.
    const accountEmail = (account.employee_email || '').trim().toLowerCase();
    if (!accountEmail) return res.status(200).json({ starter: null });

    const starterRes = await supabaseRequest(
      `starter_instances?org_id=eq.${account.org_id}&name=eq.${encodeURIComponent(account.employee_name)}&select=id,tasks,email`
    );
    const starters = await starterRes.json();
    const starter = starters.find(s => (s.email || '').trim().toLowerCase() === accountEmail);

    if (!starter) return res.status(200).json({ starter: null });
    return res.status(200).json({ starter: { id: starter.id, tasks: (starter.tasks || []).map(toSafeTask) } });
  } catch (e) {
    console.error('Portal onboarding error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
