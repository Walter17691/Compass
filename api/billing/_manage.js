import Stripe from 'stripe';
import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

export async function manage(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(orgId)}&select=stripe_customer_id`);
    const [org] = await orgRes.json();
    if (!org?.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer on file for this organisation' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${APP_URL}/?screen=settings`,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('Billing manage error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
