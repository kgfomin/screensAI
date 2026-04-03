import { query } from '../db/client.js';

export async function logAction(userId, action, details = {}) {
  await query(
    'INSERT INTO logs (user_id, action, details) VALUES ($1, $2, $3)',
    [userId ?? null, action, details]
  );
}
