import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const result = await query(
      'SELECT onboarding_completed, onboarding_step FROM users WHERE id = $1',
      [auth.user.id]
    );

    return NextResponse.json(result.rows[0] || { onboarding_completed: false, onboarding_step: 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const { step, completed } = await req.json();

    if (completed === true) {
      await query(
        'UPDATE users SET onboarding_completed = true, onboarding_step = 6, updated_at = now() WHERE id = $1',
        [auth.user.id]
      );
    } else if (completed === false) {
      await query(
        'UPDATE users SET onboarding_completed = false, onboarding_step = 0, updated_at = now() WHERE id = $1',
        [auth.user.id]
      );
    } else if (step !== undefined) {
      await query(
        'UPDATE users SET onboarding_step = $1, updated_at = now() WHERE id = $2',
        [step, auth.user.id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
