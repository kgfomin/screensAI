import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const { region, ids } = req.query;

  if (region) {
    const result = await query('SELECT * FROM locations WHERE LOWER(city)=LOWER($1) ORDER BY id', [region]);
    return res.json(result.rows);
  }

  if (ids) {
    const parsed = String(ids)
      .split(',')
      .map((x) => Number(x.trim()))
      .filter(Boolean);

    const result = await query('SELECT * FROM locations WHERE id = ANY($1) ORDER BY id', [parsed]);
    return res.json(result.rows);
  }

  const result = await query('SELECT * FROM locations ORDER BY id LIMIT 100');
  return res.json(result.rows);
});

export default router;
