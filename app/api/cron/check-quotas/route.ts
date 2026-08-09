import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkAndSendQuotaAlerts } from '@/lib/quota-alerts';
import { erreurServeur } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/**
 * Cron endpoint to check quotas for all organizations.
 * Can be called by a cron job or manually.
 * Protected by a simple secret key.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgs = await query('SELECT id FROM organizations');
    let checked = 0;

    for (const org of orgs.rows) {
      await checkAndSendQuotaAlerts(org.id);
      checked++;
    }

    return NextResponse.json({ success: true, organizations_checked: checked });
  } catch (err: any) {
    console.error('[CRON CHECK-QUOTAS]', err);
    return erreurServeur('cron/check-quotas', err);
  }
}
