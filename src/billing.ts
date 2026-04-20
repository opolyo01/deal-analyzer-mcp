import Stripe from 'stripe';
import express from 'express';
import { getUserById, getUserByStripeCustomer, setSubscription } from './db';
import { PUBLIC_BASE_URL, errorMessage } from './utils';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || '';

export const stripeEnabled = Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET && STRIPE_PRICE_ID);

const stripe = stripeEnabled ? new Stripe(STRIPE_SECRET_KEY) : null;

export const billingRouter = express.Router();

// Checkout — redirect user to Stripe hosted page
billingRouter.get('/billing/checkout', async (req, res) => {
  if (!stripe || !stripeEnabled) return res.status(503).send('Billing not configured');
  const user = (req as any).user as ReturnType<typeof getUserById> | undefined;
  if (!user) return res.redirect('/auth/google?next=/billing/checkout');

  const origin = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?billing=cancelled`,
    });
    res.redirect(303, session.url!);
  } catch (err) {
    res.status(500).send(`Checkout error: ${errorMessage(err, 'unknown')}`);
  }
});

// Success landing — Stripe redirects here after payment
billingRouter.get('/billing/success', async (req, res) => {
  res.type('html').send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Subscribed!</title>
  <link rel="stylesheet" href="/deal-ui.css"/></head><body>
  <div class="compact-page"><div class="panel" style="text-align:center;padding:48px 32px">
    <div style="font-size:2.5rem;margin-bottom:16px">🎉</div>
    <h2>You're on Pro!</h2>
    <p class="lead">Unlimited deal saves are now active. It may take a moment to reflect.</p>
    <a href="/dashboard" class="button primary" style="margin-top:16px;display:inline-block">Go to dashboard</a>
  </div></div></body></html>`);
});

// Customer portal — manage billing
billingRouter.get('/billing/portal', async (req, res) => {
  if (!stripe || !stripeEnabled) return res.status(503).send('Billing not configured');
  const user = (req as any).user as ReturnType<typeof getUserById> | undefined;
  if (!user) return res.redirect('/auth/google');
  const dbUser = getUserById(user.id);
  if (!dbUser?.stripeCustomerId) return res.redirect('/?billing=no-subscription');

  const origin = PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: `${origin}/dashboard`,
    });
    res.redirect(303, session.url);
  } catch (err) {
    res.status(500).send(`Portal error: ${errorMessage(err, 'unknown')}`);
  }
});

// Webhook — Stripe calls this on subscription events
billingRouter.post('/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !stripeEnabled) return res.status(503).send('Billing not configured');
  const sig = req.headers['stripe-signature'] as string;
  let event: ReturnType<typeof stripe.webhooks.constructEventAsync> extends Promise<infer T> ? T : any;
  try {
    event = stripe.webhooks.constructEvent((req as any).rawBody ?? req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[billing] webhook signature failed:', errorMessage(err, 'unknown'));
    return res.status(400).send('Webhook signature invalid');
  }

  try {
    const obj = event.data.object as any;
    if (event.type === 'checkout.session.completed') {
      const userId: string | null = obj.client_reference_id;
      const customerId: string = obj.customer;
      if (userId && customerId) {
        setSubscription(userId, 'pro', customerId);
        console.log(`[billing] user ${userId} upgraded to pro`);
      }
    } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.paused') {
      const user = getUserByStripeCustomer(obj.customer);
      if (user) { setSubscription(user.id, 'free'); console.log(`[billing] user ${user.id} downgraded to free`); }
    } else if (event.type === 'customer.subscription.resumed' || event.type === 'invoice.paid') {
      const user = getUserByStripeCustomer(obj.customer);
      if (user) { setSubscription(user.id, 'pro'); console.log(`[billing] user ${user.id} confirmed pro`); }
    }
  } catch (err) {
    console.error('[billing] webhook handler error:', errorMessage(err, 'unknown'));
  }

  res.json({ received: true });
});
