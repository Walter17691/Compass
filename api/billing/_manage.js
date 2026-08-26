import Stripe from 'stripe';
import { supabaseRequest } from './_supabase.js';
import { verifyCaller } from '../_auth.js';
import { isHrRole } from '../../src/lib/roles.js';

const APP_URL = 'https://compass-lemon-iota.vercel.app';

export async function manage(req, res) {
  const caller = await verifyCaller(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });

  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ error: 'orgId is required' });

  try {
    // Phase 6.5 hardening (Prompt 14, Section 7 — closes independent
    // audit finding 2.4, billing half) — was select=id with no role
    // filter at all, so any org member (line_manager, investigator, even
    // the nominally read-only auditor) could open a Stripe Billing
    // Portal session — real power to change payment methods, download
    // invoices, or cancel the subscription. Same HR-only bar as every
    // other billing-adjacent control in this app.
    const memberRes = await supabaseRequest(`org_members?org_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=role`);
    const [member] = await memberRes.json();
    if (!member) return res.status(403).json({ error: 'Not a member of this organisation' });
    if (!isHrRole(member.role)) return res.status(403).json({ error: 'You do not have permission to manage billing' });

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
