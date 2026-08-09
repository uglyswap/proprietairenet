import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { activateSubscription, cancelSubscription, addCredits, findPlanByStripePriceId } from "@/lib/stripe";
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

  // Fail-closed: sans secret de webhook configure, on REFUSE de traiter la requete.
  // Ne jamais faire confiance a un body non signe (sinon n'importe qui peut forger
  // un evenement de paiement et se crediter gratuitement).
  if (!webhookSecret) {
    logger.error('STRIPE', 'STRIPE_WEBHOOK_SECRET non configure — webhook refuse');
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    logger.error('STRIPE', 'Signature verification failed', { error: err.message });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotence en DEUX TEMPS.
  //
  // L'ancienne version marquait l'evenement comme traite AVANT de le traiter.
  // Toute exception pendant le traitement laissait donc l'evenement marque, et
  // la retentative de Stripe etait ignoree comme un doublon : le client etait
  // debite et ne recevait jamais ses credits, definitivement.
  //
  // On enregistre desormais l'evenement en statut 'processing', et on ne le
  // bascule en 'completed' qu'apres succes. En cas d'echec, la ligne repasse en
  // 'failed' avec son message, ce qui autorise la retentative de Stripe a
  // reprendre le traitement.
  //
  // Seul un evenement 'completed' est un doublon a ignorer.
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS stripe_events (
         event_id TEXT PRIMARY KEY,
         type TEXT,
         status TEXT NOT NULL DEFAULT 'processing',
         attempts INTEGER NOT NULL DEFAULT 1,
         error TEXT,
         processed_at TIMESTAMPTZ,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    // Rattrapage pour une table creee par une version anterieure.
    await query(`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing'`);
    await query(`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1`);
    await query(`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS error TEXT`);

    const insert = await query(
      `INSERT INTO stripe_events (event_id, type, status)
       VALUES ($1, $2, 'processing')
       ON CONFLICT (event_id) DO UPDATE
         SET attempts = stripe_events.attempts + 1,
             status   = CASE WHEN stripe_events.status = 'completed'
                             THEN 'completed' ELSE 'processing' END
       RETURNING status, attempts`,
      [event.id, event.type]
    );

    if (insert.rows[0]?.status === 'completed') {
      logger.info('STRIPE', 'Evenement deja traite, ignore (idempotence)', { eventId: event.id });
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err: any) {
    logger.error('STRIPE', 'Echec du verrou idempotence', { error: err.message });
    return NextResponse.json({ error: "Idempotency store error" }, { status: 500 });
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

          // Recherche du plan sur le tarif mensuel ET annuel : un abonnement
          // annuel etait encaisse par Stripe puis jamais active dans le produit.
          const plan = await findPlanByStripePriceId(priceId as string);

          if (plan) {
            await activateSubscription(orgId, subscription.id, plan.slug);
            logger.info('STRIPE', `Subscription activated`, { orgId, plan: plan.slug });
          }
        } else if (session.mode === "payment" && session.metadata?.type === "credit_purchase") {
          const credits = parseInt(session.metadata.credits || "0");
          if (credits > 0 && userId) {
            await addCredits(orgId, userId, credits, `Achat de ${credits} crédits`, {
              // Double garde-fou : meme si le verrou d'evenement echouait, la
              // reference empeche de crediter deux fois le meme paiement.
              reference: `stripe:${event.id}`,
              montantEurCentimes: session.amount_total ?? undefined,
            });
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
          const plan = await findPlanByStripePriceId(priceId as string);
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

        // Toutes les souscriptions d'une organisation portent le meme
        // organization_id, y compris celle des sieges supplementaires. Sans
        // filtre, retirer un siege declassait la totalite du compte en 'free' :
        // un client payant perdait son plan en supprimant un collaborateur.
        const typeAbonnement = subscription.metadata?.type;
        if (typeAbonnement && typeAbonnement !== 'plan') {
          logger.info('STRIPE', 'Souscription annexe resiliee, plan inchange', {
            orgId, type: typeAbonnement,
          });
          break;
        }

        if (orgId) {
          // Ne declasser que si la souscription resiliee est bien celle
          // enregistree comme abonnement principal de l'organisation.
          const courant = await query(
            "SELECT stripe_subscription_id FROM organizations WHERE id = $1",
            [orgId]
          );
          const abonnementPrincipal = courant.rows[0]?.stripe_subscription_id;
          if (abonnementPrincipal && abonnementPrincipal !== subscription.id) {
            logger.info('STRIPE', 'Souscription non principale resiliee, plan inchange', {
              orgId, resiliee: subscription.id, principale: abonnementPrincipal,
            });
            break;
          }

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

    // Traitement reussi : l'evenement devient un doublon a ignorer.
    await query(
      `UPDATE stripe_events
          SET status = 'completed', processed_at = NOW(), error = NULL
        WHERE event_id = $1`,
      [event.id]
    );

    return NextResponse.json({ received: true });
  } catch (err: any) {
    // Echec : on laisse l'evenement rejouable par la retentative de Stripe.
    try {
      await query(
        `UPDATE stripe_events SET status = 'failed', error = $2 WHERE event_id = $1`,
        [event.id, String(err?.message || err).slice(0, 500)]
      );
    } catch (marquageErr) {
      logger.error('STRIPE', 'Marquage en echec impossible', { eventId: event.id });
    }
    logger.error('STRIPE', 'Webhook processing error', { error: err.message, eventId: event.id });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
