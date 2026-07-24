import { supabaseRequest } from './_supabase.js';

export async function onboarding(req, res) {
  try {
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const accountRes = await supabaseRequest(`employee_portal_accounts?user_id=eq.${userId}&select=*`);
    const accounts = await accountRes.json();
    const account = accounts[0];
    if (!account) return res.status(404).json({ error: 'No portal account for this user' });

    const starterRes = await supabaseRequest(
      `starter_instances?org_id=eq.${account.org_id}&name=eq.${encodeURIComponent(account.employee_name)}&select=id,tasks`
    );
    const starters = await starterRes.json();
    const starter = starters[0];

    if (req.method === 'GET') {
      if (!starter) return res.status(200).json({ starter: null });
      return res.status(200).json({ starter: { id: starter.id, tasks: starter.tasks || [] } });
    }

    if (req.method === 'POST') {
      const { taskId, done } = req.body;
      if (!starter) return res.status(404).json({ error: 'No onboarding checklist found' });
      if (!taskId) return res.status(400).json({ error: 'taskId is required' });

      const updatedTasks = (starter.tasks || []).map(t =>
        t.id === taskId ? { ...t, done: !!done, doneAt: done ? new Date().toISOString() : null } : t
      );
      const updateRes = await supabaseRequest(`starter_instances?id=eq.${starter.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tasks: updatedTasks, updated_at: new Date().toISOString() }),
      });
      if (!updateRes.ok) {
        console.error('starter_instances update failed:', await updateRes.text());
        return res.status(500).json({ error: 'Failed to update task' });
      }
      return res.status(200).json({ success: true, tasks: updatedTasks });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Portal onboarding error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
