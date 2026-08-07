import Stripe from 'stripe';
import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';

// Called after addLocation/deleteLocation succeed (see App.jsx) — keeps the
// Stripe subscription's quantity matched to the org's actual location
// count, so billing tracks reality instead of only reflecting whatever the
// count was at initial checkout. Uses Stripe's default proration behaviour
// (create_prorations) — the adjustment lands as a line item on the next
// regular invoice rather than triggering a separate immediate charge,
// which is the less surprising choice for a customer's card.
export async function syncQuantity(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  // orgId via query string, not a JSON body — this dispatcher has
  // bodyParser disabled group-wide (the webhook needs the raw request
  // bytes for signature verification), so req.body isn't parsed here.
  // Matches how checkout.js/manage.js already take orgId, for consistency.
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=id`);
    const members = await memberRes.json();
    if (!members.length) return res.status(403).json({ error: 'Not a member of this organisation' });

    const orgRes = await supabaseRequest(`organisations?id=eq.${encodeURIComponent(orgId)}&select=stripe_subscription_id`);
    const [org] = await orgRes.json();
    // No active subscription yet (e.g. still on the pre-checkout screen) —
    // nothing to sync. Not an error: this is expected before the org has
    // ever completed checkout.
    if (!org?.stripe_subscription_id) return res.status(200).json({ synced: false });

    const locationsRes = await supabaseRequest(`locations?org_id=eq.${encodeURIComponent(orgId)}&select=id`);
    const locations = await locationsRes.json();
    const quantity = Math.max(1, locations.length);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const item = subscription.items.data[0];
    if (item && item.quantity !== quantity) {
      await stripe.subscriptionItems.update(item.id, { quantity });
    }

    res.status(200).json({ synced: true, quantity });
  } catch (e) {
    console.error('Billing sync-quantity error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
