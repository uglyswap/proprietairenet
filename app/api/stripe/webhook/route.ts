/**
 * Webhook Stripe.
 *
 * IDEMPOTENCE : UNE SEULE TRANSACTION POUR TRAITER ET MARQUER
 *
 * Trois conceptions successives, et pourquoi seule la troisieme tient :
 *
 * 1. Marquer AVANT de traiter. Une exception pendant le traitement laissait
 *    l'evenement marque : la retentative de Stripe etait vue comme un doublon
 *    et ignoree. Le client etait debite et ne recevait jamais ses credits,
 *    definitivement.
 *
 * 2. Marquer APRES avoir traite. Symetriquement dangereux : si le marquage
 *    final echoue (pool sature, coupure) alors que les credits viennent d'etre
 *    poses, la retentative de Stripe repasse et credite une SECONDE fois. Le
 *    client paie une fois et recoit le double. La reference d'idempotence ne
 *    protege pas, la colonne credit_transactions.reference n'existant pas
 *    encore en production.
 *
 * 3. La seule conception correcte : le traitement ET le marquage se font dans
 *    UNE MEME TRANSACTION, ouverte sur une ligne de stripe_events verrouillee
 *    par SELECT ... FOR UPDATE.
 *      - un echec quelconque annule TOUT, y compris les credits poses, et la
 *        retentative de Stripe repart d'un etat propre ;
 *      - deux livraisons concurrentes du meme evenement se serialisent sur le
 *        verrou de ligne, la seconde voit 'completed' et sort ;
 *      - aucune dependance a une colonne non encore migree.
 *
 * Toutes les ecritures metier recoivent donc le client de transaction.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  activateSubscription,
  cancelSubscription,
  addCredits,
  findPlanByStripePriceId,
} from "@/lib/stripe";
import { query, withTransaction } from "@/lib/db";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16" as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

/** Cree la table de suivi des evenements si elle manque. Hors transaction. */
async function assurerTableEvenements(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS stripe_events (
       event_id     TEXT PRIMARY KEY,
       type         TEXT,
       status       TEXT NOT NULL DEFAULT 'processing',
       attempts     INTEGER NOT NULL DEFAULT 1,
       error        TEXT,
       processed_at TIMESTAMPTZ,
       created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  // Rattrapage d'une table creee par une version anterieure.
  await query(`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing'`);
  await query(`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1`);
  await query(`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS error TEXT`);
  await query(`ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  // Fail-closed: sans secret de webhook configure, on REFUSE de traiter la
  // requete. Ne jamais faire confiance a un body non signe, sinon n'importe qui
  // peut forger un evenement de paiement et se crediter gratuitement.
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

  try {
    await assurerTableEvenements();
  } catch (err: any) {
    logger.error('STRIPE', 'Table stripe_events indisponible', { error: err.message });
    return NextResponse.json({ error: "Idempotency store error" }, { status: 500 });
  }

  try {
    const resultat = await withTransaction(async (client) => {
      // Verrou de ligne : serialise les livraisons concurrentes du meme evenement.
      const existant = await client.query(
        `SELECT status FROM stripe_events WHERE event_id = $1 FOR UPDATE`,
        [event.id]
      );

      if (existant.rows.length === 0) {
        await client.query(
          `INSERT INTO stripe_events (event_id, type, status) VALUES ($1, $2, 'processing')`,
          [event.id, event.type]
        );
      } else {
        if (existant.rows[0].status === 'completed') {
          return { duplicate: true as const };
        }
        await client.query(
          `UPDATE stripe_events
              SET attempts = attempts + 1, status = 'processing', error = NULL
            WHERE event_id = $1`,
          [event.id]
        );
      }

      // --------------------------------------------------------------------
      // Traitement metier, dans la MEME transaction que le marquage.
      // --------------------------------------------------------------------
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const orgId = session.metadata?.organization_id;
          const userId = session.metadata?.user_id;

          if (!orgId) {
            // Sans organisation, rien n'est provisionnable. On leve plutot que
            // de marquer 'completed' un paiement dont personne n'a rien recu :
            // l'anomalie doit rester visible et rejouable.
            throw new Error(
              `checkout.session.completed sans organization_id (session ${session.id})`
            );
          }

          if (session.mode === "subscription" && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription as string
            );
            const priceId = subscription.items.data[0]?.price.id;

            // Recherche du plan sur le tarif mensuel ET annuel : un abonnement
            // annuel etait encaisse par Stripe puis jamais active.
            const plan = await findPlanByStripePriceId(priceId as string);
            if (!plan) {
              throw new Error(
                `Aucun plan ne correspond au price Stripe ${priceId} (session ${session.id})`
              );
            }

            await activateSubscription(orgId, subscription.id, plan.slug, client);
            logger.info('STRIPE', 'Subscription activated', { orgId, plan: plan.slug });
          } else if (
            session.mode === "payment" &&
            session.metadata?.type === "credit_purchase"
          ) {
            const credits = parseInt(session.metadata.credits || "0");
            if (!(credits > 0)) {
              throw new Error(
                `credit_purchase sans quantite exploitable (session ${session.id})`
              );
            }
            await addCredits(orgId, userId || '', credits, `Achat de ${credits} crédits`, {
              // Second garde-fou une fois la migration 004 appliquee.
              reference: `stripe:${event.id}`,
              montantEurCentimes: session.amount_total ?? undefined,
              client,
            });
            logger.info('STRIPE', 'Credits purchased', { orgId, credits });
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
              await activateSubscription(orgId, subscription.id, plan.slug, client);
              logger.info('STRIPE', 'Subscription updated', { orgId, plan: plan.slug });
            } else {
              logger.warn('STRIPE', 'Price Stripe sans plan correspondant', { orgId, priceId });
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const orgId = subscription.metadata?.organization_id;

          // Toutes les souscriptions d'une organisation portent le meme
          // organization_id, y compris celle des sieges supplementaires. Sans
          // filtre, retirer un siege declassait tout le compte en 'free' : un
          // client payant perdait son plan en supprimant un collaborateur.
          const typeAbonnement = subscription.metadata?.type;
          if (typeAbonnement && typeAbonnement !== 'plan') {
            logger.info('STRIPE', 'Souscription annexe resiliee, plan inchange', {
              orgId, type: typeAbonnement,
            });
            break;
          }

          if (orgId) {
            const courant = await client.query(
              "SELECT stripe_subscription_id FROM organizations WHERE id = $1",
              [orgId]
            );
            const principale = courant.rows[0]?.stripe_subscription_id;
            if (principale && principale !== subscription.id) {
              logger.info('STRIPE', 'Souscription non principale resiliee, plan inchange', {
                orgId, resiliee: subscription.id, principale,
              });
              break;
            }

            await cancelSubscription(orgId, client);
            logger.info('STRIPE', 'Subscription cancelled', { orgId });
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          logger.warn('STRIPE', 'Payment failed', { customer: invoice.customer });
          break;
        }
      }

      // Marquage dans la MEME transaction : indissociable du traitement.
      await client.query(
        `UPDATE stripe_events
            SET status = 'completed', processed_at = NOW(), error = NULL
          WHERE event_id = $1`,
        [event.id]
      );

      return { duplicate: false as const };
    });

    if (resultat.duplicate) {
      logger.info('STRIPE', 'Evenement deja traite, ignore (idempotence)', { eventId: event.id });
      return NextResponse.json({ received: true, duplicate: true });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    // La transaction a ete annulee : ni credits poses, ni evenement marque.
    // La retentative de Stripe repartira d'un etat propre. On enregistre
    // seulement la trace de l'echec, hors transaction.
    try {
      await query(
        `UPDATE stripe_events SET status = 'failed', error = $2 WHERE event_id = $1`,
        [event.id, String(err?.message || err).slice(0, 500)]
      );
    } catch {
      logger.error('STRIPE', 'Marquage en echec impossible', { eventId: event.id });
    }

    logger.error('STRIPE', 'Webhook processing error', {
      error: err?.message,
      eventId: event.id,
      type: event.type,
    });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
