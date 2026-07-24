import Stripe from 'stripe';
import { supabaseRequest } from './_supabase.js';

// Stripe's signature verification hashes the exact raw request bytes —
// Vercel's default body parsing (relied on by every other endpoint here,
// e.g. api/portal/_invite.js reading req.body directly) would break that,
// so the dispatcher (api/billing/[...action].js) disables it via its
// `config.api.bodyParser = false` export and this reads the raw stream
// itself.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function webhook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error('Stripe webhook signature verification failed:', e.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orgId = session.client_reference_id || session.metadata?.orgId;
      if (orgId) {
        await supabaseRequest(`organisations?id=eq.${orgId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            plan: 'pro',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            stripe_subscription_status: 'active',
          }),
        });
      }
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const plan = (event.type === 'customer.subscription.deleted' || sub.status === 'canceled') ? 'free' : 'pro';
      await supabaseRequest(`organisations?stripe_subscription_id=eq.${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ plan, stripe_subscription_status: sub.status }),
      });
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error('Stripe webhook handler error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
