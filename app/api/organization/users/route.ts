import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import logger from "@/lib/logger";
import { erreurServeur } from '@/lib/api-error';
import { requireFeature } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const result = await query(
      "SELECT id, email, first_name, last_name, role, created_at, last_login_at FROM users WHERE organization_id = $1 ORDER BY created_at",
      [auth.user.organization_id]
    );

    const orgResult = await query(
      "SELECT max_users, subscription_plan, owner_id FROM organizations WHERE id = $1",
      [auth.user.organization_id]
    );
    const org = orgResult.rows[0];

    return NextResponse.json({
      users: result.rows,
      max_users: org?.max_users || 1,
      current_count: result.rows.length,
      plan: org?.subscription_plan || "free",
      owner_id: org?.owner_id || null,
    });
  } catch (err: any) {
    return erreurServeur('organization/users', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'multi_utilisateurs');
    if (refusPlan) return refusPlan;

    const orgResult = await query(
      "SELECT o.owner_id, o.max_users, o.subscription_plan, o.stripe_customer_id, o.stripe_extra_user_sub_id, p.stripe_extra_user_price_id, p.included_users FROM organizations o LEFT JOIN plans p ON p.slug = o.subscription_plan WHERE o.id = $1",
      [auth.user.organization_id]
    );
    const org = orgResult.rows[0];
    if (org?.owner_id !== auth.user.id && !auth.user.is_admin) {
      return NextResponse.json({ error: "Seul le propriétaire peut ajouter des utilisateurs" }, { status: 403 });
    }

    // Check plan allows adding users
    if (org?.subscription_plan === 'free') {
      return NextResponse.json({ error: "Passez au plan Pro pour ajouter des utilisateurs" }, { status: 403 });
    }

    const { email, first_name, last_name, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });

    const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) return NextResponse.json({ error: "Email déjà utilisé" }, { status: 409 });

    const countResult = await query("SELECT count(*) as c FROM users WHERE organization_id = $1", [auth.user.organization_id]);
    const currentCount = parseInt(countResult.rows[0].c);
    const includedUsers = org?.included_users || 1;

    // If adding beyond included users, handle Stripe billing (monthly, no commitment)
    let billingAction = null;
    if (currentCount >= includedUsers && !auth.user.is_admin) {
      if (!org?.stripe_customer_id) {
        return NextResponse.json({ error: "Erreur de facturation : aucun client Stripe associé" }, { status: 400 });
      }
      if (!org?.stripe_extra_user_price_id) {
        return NextResponse.json({ error: "Prix utilisateur supplémentaire non configuré" }, { status: 400 });
      }

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const extraUsersNeeded = currentCount - includedUsers + 1; // +1 for the new user

      if (org?.stripe_extra_user_sub_id) {
        // Update existing extra user subscription quantity
        try {
          const sub = await stripe.subscriptions.retrieve(org.stripe_extra_user_sub_id);
          if (sub.status === 'active' || sub.status === 'trialing') {
            const item = sub.items.data[0];
            await stripe.subscriptionItems.update(item.id, { quantity: extraUsersNeeded });
            billingAction = 'updated';
          } else {
            // Subscription cancelled/expired, create new one
            const newSub = await stripe.subscriptions.create({
              customer: org.stripe_customer_id,
              items: [{ price: org.stripe_extra_user_price_id, quantity: extraUsersNeeded }],
              metadata: { organization_id: auth.user.organization_id, type: 'extra_users' },
            });
            await query("UPDATE organizations SET stripe_extra_user_sub_id = $1 WHERE id = $2", [newSub.id, auth.user.organization_id]);
            billingAction = 'created';
          }
        } catch (stripeErr: any) {
          logger.error('TEAM', 'Stripe update failed', { error: stripeErr.message });
          return NextResponse.json({ error: "Erreur Stripe : " + stripeErr.message }, { status: 500 });
        }
      } else {
        // Create new monthly subscription for extra users
        try {
          const newSub = await stripe.subscriptions.create({
            customer: org.stripe_customer_id,
            items: [{ price: org.stripe_extra_user_price_id, quantity: extraUsersNeeded }],
            metadata: { organization_id: auth.user.organization_id, type: 'extra_users' },
          });
          await query("UPDATE organizations SET stripe_extra_user_sub_id = $1 WHERE id = $2", [newSub.id, auth.user.organization_id]);
          billingAction = 'created';
        } catch (stripeErr: any) {
          logger.error('TEAM', 'Stripe create failed', { error: stripeErr.message });
          return NextResponse.json({ error: "Erreur Stripe : " + stripeErr.message }, { status: 500 });
        }
      }
    }

    // Create the user
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(password, 10);

    const result = await query(
      "INSERT INTO users (email, password_hash, first_name, last_name, role, organization_id, email_verified) VALUES ($1, $2, $3, $4, 'user', $5, TRUE) RETURNING id, email, first_name, last_name, role",
      [email.toLowerCase(), hash, first_name, last_name, auth.user.organization_id]
    );

    // Update max_users to allow this user
    await query("UPDATE organizations SET max_users = GREATEST(max_users, $1) WHERE id = $2", [currentCount + 1, auth.user.organization_id]);

    // Notify all org users about new member
    const orgUsers = await query("SELECT id FROM users WHERE organization_id = $1 AND id != $2", [auth.user.organization_id, result.rows[0].id]);
    for (const u of orgUsers.rows) {
      await createNotification(
        auth.user.organization_id!,
        u.id,
        'new_member',
        'Nouveau membre',
        `${first_name || email} a rejoint l'équipe`,
        '/dashboard/team'
      );
    }

    logger.info('TEAM', 'User added', { email, orgId: auth.user.organization_id, billingAction });

    return NextResponse.json({ 
      user: result.rows[0],
      billing: billingAction ? `Facturation mise à jour (${billingAction})` : 'Inclus dans votre plan'
    }, { status: 201 });
  } catch (err: any) {
    return erreurServeur('organization/users', err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'multi_utilisateurs');
    if (refusPlan) return refusPlan;

    const orgResult = await query("SELECT owner_id FROM organizations WHERE id = $1", [auth.user.organization_id]);
    const org = orgResult.rows[0];
    if (org?.owner_id !== auth.user.id && !auth.user.is_admin) {
      return NextResponse.json({ error: "Seul le propriétaire peut modifier les rôles" }, { status: 403 });
    }

    const { user_id, role } = await req.json();
    if (!user_id || !role) return NextResponse.json({ error: "user_id et role requis" }, { status: 400 });

    const validRoles = ["admin", "user"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Rôle invalide. Rôles autorisés : ${validRoles.join(", ")}` }, { status: 400 });
    }

    if (user_id === auth.user.id) {
      return NextResponse.json({ error: "Impossible de modifier votre propre rôle" }, { status: 400 });
    }

    // Verify user belongs to same org
    const userCheck = await query("SELECT id FROM users WHERE id = $1 AND organization_id = $2", [user_id, auth.user.organization_id]);
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: "Utilisateur non trouvé dans votre organisation" }, { status: 404 });
    }

    await query("UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2", [role, user_id]);

    return NextResponse.json({ success: true, message: `Rôle mis à jour en ${role}` });
  } catch (err: any) {
    return erreurServeur('organization/users', err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'multi_utilisateurs');
    if (refusPlan) return refusPlan;

    const orgResult = await query(
      "SELECT o.owner_id, o.stripe_extra_user_sub_id, p.included_users FROM organizations o LEFT JOIN plans p ON p.slug = o.subscription_plan WHERE o.id = $1",
      [auth.user.organization_id]
    );
    const org = orgResult.rows[0];
    if (org?.owner_id !== auth.user.id && !auth.user.is_admin) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("id");
    if (!userId) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    if (userId === auth.user.id) return NextResponse.json({ error: "Impossible de supprimer votre propre compte" }, { status: 400 });

    // Delete the user
    await query("DELETE FROM users WHERE id = $1 AND organization_id = $2", [userId, auth.user.organization_id]);

    // Update Stripe extra user subscription
    const countResult = await query("SELECT count(*) as c FROM users WHERE organization_id = $1", [auth.user.organization_id]);
    const remainingUsers = parseInt(countResult.rows[0].c);
    const includedUsers = org?.included_users || 1;
    const extraUsersNeeded = Math.max(0, remainingUsers - includedUsers);

    if (org?.stripe_extra_user_sub_id) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        if (extraUsersNeeded <= 0) {
          // No more extra users needed — cancel the subscription
          await stripe.subscriptions.cancel(org.stripe_extra_user_sub_id);
          await query("UPDATE organizations SET stripe_extra_user_sub_id = NULL WHERE id = $1", [auth.user.organization_id]);
          logger.info('TEAM', 'Extra user subscription cancelled', { orgId: auth.user.organization_id });
        } else {
          // Reduce quantity
          const sub = await stripe.subscriptions.retrieve(org.stripe_extra_user_sub_id);
          if (sub.status === 'active') {
            const item = sub.items.data[0];
            await stripe.subscriptionItems.update(item.id, { quantity: extraUsersNeeded });
            logger.info('TEAM', 'Extra user subscription reduced', { orgId: auth.user.organization_id, quantity: extraUsersNeeded });
          }
        }
      } catch (stripeErr: any) {
        logger.error('TEAM', 'Stripe cancel/reduce failed', { error: stripeErr.message });
        // Don't fail the delete — user is already removed
      }
    }

    // Update max_users
    await query("UPDATE organizations SET max_users = GREATEST($1, $2) WHERE id = $3", [includedUsers, remainingUsers, auth.user.organization_id]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return erreurServeur('organization/users', err);
  }
}
