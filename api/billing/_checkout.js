import Stripe from 'stripe';
import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

// Returns the Stripe Checkout URL as JSON rather than redirecting directly
// — a top-level window.location.href navigation can't carry a custom
// Authorization header, so the client fetches this (with its Supabase
// access token attached) and navigates to the URL it gets back.
export async function checkout(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    // Priced per active location (volume-tiered on STRIPE_PRICE_ID — see
    // src/lib/plan.js for the tier bands). At least 1: an org with zero
    // locations recorded yet still needs a subscription to unlock the app
    // in the first place.
    const locationsRes = await supabaseRequest(`locations?org_id=eq.${encodeURIComponent(orgId)}&select=id`);
    const locations = await locationsRes.json();
    const quantity = Math.max(1, locations.length);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity }],
      success_url: `${APP_URL}/?billing=success`,
      cancel_url: `${APP_URL}/?billing=cancelled`,
      client_reference_id: orgId,
      metadata: { orgId },
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('Billing checkout error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
