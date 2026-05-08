import { query } from "./db";
import logger from "./logger";

/**
 * Calculate the next 9:00 AM Paris time after a given delay in days.
 * Skips weekends: if the date falls on Saturday, push to Monday.
 */
function getScheduledAt(daysFromNow: number): string {
  // All scheduling targets 9:00 AM Europe/Paris
  const now = new Date();
  const target = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);

  // Set to 9:00 AM Paris time (UTC+1 or UTC+2 in summer)
  // Use a fixed approach: create date string in Paris timezone
  const parisDate = new Date(target.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  parisDate.setHours(9, 0, 0, 0);

  // Skip weekends
  const day = parisDate.getDay();
  if (day === 0) parisDate.setDate(parisDate.getDate() + 1); // Sunday → Monday
  if (day === 6) parisDate.setDate(parisDate.getDate() + 2); // Saturday → Monday

  // Convert back to UTC for storage
  // Approximate: Paris is UTC+1 (winter) or UTC+2 (summer)
  // Use ISO string with timezone offset
  return parisDate.toISOString();
}

/**
 * Schedule the 6-step drip email sequence for a new free user.
 * All emails sent at 9:00 AM Paris time on weekdays.
 */
export async function scheduleDripEmails(userId: string, email: string): Promise<void> {
  try {
    const orgResult = await query(
      `SELECT o.subscription_plan FROM users u
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.id = $1`,
      [userId]
    );

    if (orgResult.rows.length > 0 && orgResult.rows[0].subscription_plan !== "free") {
      logger.info("DRIP", `Skipping drip for paid user ${email}`);
      return;
    }

    const existing = await query(
      `SELECT id FROM drip_email_queue WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      logger.info("DRIP", `Drip already scheduled for ${email}`);
      return;
    }

    // Schedule 6 emails at 9 AM Paris time, skip weekends
    const steps = [
      { step: 1, days: 0 },   // Day 0 — Welcome (immediate for day 0)
      { step: 2, days: 3 },   // Day 3 — First search tutorial
      { step: 3, days: 5 },   // Day 5 — Results & contact method
      { step: 4, days: 7 },   // Day 7 — Advanced features
      { step: 5, days: 10 },  // Day 10 — Promo -20%
      { step: 6, days: 14 },  // Day 14 — Last chance
    ];

    const values: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const { step, days } of steps) {
      const scheduledAt = days === 0
        ? new Date().toISOString() // Immediate for welcome email
        : getScheduledAt(days);

      values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}::timestamptz)`);
      params.push(userId, email, step, scheduledAt);
      paramIdx += 4;
    }

    await query(
      `INSERT INTO drip_email_queue (user_id, email, step, scheduled_at) VALUES ${values.join(", ")}`,
      params
    );

    logger.info("DRIP", `Scheduled 6 drip emails for ${email} (9 AM Paris, weekdays)`);
  } catch (err: any) {
    logger.error("DRIP", `Failed to schedule drip for ${email}`, { error: err.message });
  }
}
