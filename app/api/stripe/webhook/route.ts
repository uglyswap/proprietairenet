import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { activateSubscription, cancelSubscription, addCredits } from "@/lib/stripe";
import { query } from "@/lib/db";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16" as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      logger.warn('STRIPE', 'No webhook secret configured — parsing body directly');
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err: any) {
    logger.error('STRIPE', 'Signature verification failed', { error: err.message });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organization_id;
        const userId = session.metadata?.user_id;

        if (!orgId) break;

        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = subscription.items.data[0]?.price.id;

          // Find plan by stripe_price_id
          const planResult = await query("SELECT slug FROM plans WHERE stripe_price_id = $1", [priceId]);
          const plan = planResult.rows[0];

          if (plan) {
            await activateSubscription(orgId, subscription.id, plan.slug);
            logger.info('STRIPE', `Subscription activated`, { orgId, plan: plan.slug });
          }
        } else if (session.mode === "payment" && session.metadata?.type === "credit_purchase") {
          const credits = parseInt(session.metadata.credits || "0");
          if (credits > 0 && userId) {
            await addCredits(orgId, userId, credits, `Achat de ${credits} crédits`);
            logger.info('STRIPE', `Credits purchased`, { orgId, credits });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.organization_id;
        if (!orgId) break;

        if (subscription.status === "active") {
          const priceId = subscription.items.data[0]?.price.id;
          const planResult = await query("SELECT slug FROM plans WHERE stripe_price_id = $1", [priceId]);
          const plan = planResult.rows[0];
          if (plan) {
            await activateSubscription(orgId, subscription.id, plan.slug);
            logger.info('STRIPE', `Subscription updated`, { orgId, plan: plan.slug });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.organization_id;
        if (orgId) {
          await cancelSubscription(orgId);
          logger.info('STRIPE', `Subscription cancelled`, { orgId });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.warn('STRIPE', `Payment failed`, { customer: invoice.customer });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    logger.error('STRIPE', 'Webhook processing error', { error: err.message });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
