import { query } from './db';

export async function createNotification(
  orgId: string,
  userId: string | null,
  type: string,
  title: string,
  message: string,
  link?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (organization_id, user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, userId, type, title, message, link || null]
    );
  } catch (err) {
    console.error('[NOTIFICATION] Failed to create notification:', err);
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
    [userId]
  );
  return parseInt(result.rows[0].count);
}
