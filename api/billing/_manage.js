import Stripe from 'stripe';
import { supabaseRequest } from './_supabase.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

export async function manage(req, res) {
  const { orgId, userId } = req.query;
  if (!orgId || !userId) return res.status(400).json({ error: 'orgId and userId are required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${orgId}&user_id=eq.${userId}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const orgRes = await supabaseRequest(`organisations?id=eq.${orgId}&select=stripe_customer_id`);
    const [org] = await orgRes.json();
    if (!org?.stripe_customer_id) return res.status(400).json({ error: 'No Stripe customer on file for this organisation' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${APP_URL}/?screen=settings`,
    });

    res.writeHead(302, { Location: session.url });
    res.end();
  } catch (e) {
    console.error('Billing manage error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
