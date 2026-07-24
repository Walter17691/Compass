import Stripe from 'stripe';
import { supabaseRequest } from './_supabase.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

export async function checkout(req, res) {
  const { orgId, userId } = req.query;
  if (!orgId || !userId) return res.status(400).json({ error: 'orgId and userId are required' });

  try {
    // Verify the caller actually belongs to this org before creating a
    // Checkout session that would upgrade it.
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${orgId}&user_id=eq.${userId}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}/?billing=success`,
      cancel_url: `${APP_URL}/?billing=cancelled`,
      client_reference_id: orgId,
      metadata: { orgId },
    });

    res.writeHead(302, { Location: session.url });
    res.end();
  } catch (e) {
    console.error('Billing checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
