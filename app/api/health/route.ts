import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const startTime = Date.now();

export async function GET() {
  const checks: Record<string, { status: string; message?: string }> = {};

  // DB check
  try {
    await query('SELECT 1');
    checks.database = { status: 'ok' };
  } catch (err: any) {
    checks.database = { status: 'error', message: err.message };
  }

  // Service Postal config check
  const spUrl = process.env.SERVICE_POSTAL_API_URL;
  const spKey = process.env.SERVICE_POSTAL_API_KEY;
  if (spUrl && spKey) {
    checks.service_postal = { status: 'ok', message: spUrl.includes('prod') ? 'production' : 'sandbox' };
  } else {
    checks.service_postal = { status: 'error', message: 'Missing config' };
  }

  // Stripe config check
  if (process.env.STRIPE_SECRET_KEY) {
    checks.stripe = { status: 'ok' };
  } else {
    checks.stripe = { status: 'error', message: 'Missing STRIPE_SECRET_KEY' };
  }

  // Resend config check
  if (process.env.RESEND_API_KEY) {
    checks.resend = { status: 'ok' };
  } else {
    checks.resend = { status: 'error', message: 'Missing RESEND_API_KEY' };
  }

  // JWT config check
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    checks.jwt = { status: 'ok' };
  } else {
    checks.jwt = { status: 'warning', message: 'Using default JWT secret' };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const uptimeMs = Date.now() - startTime;
  const memUsage = process.memoryUsage();

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    version: '2.0.0',
    uptime_seconds: Math.floor(uptimeMs / 1000),
    memory: {
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    checks,
    timestamp: new Date().toISOString(),
  });
}
