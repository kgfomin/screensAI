import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { query } from '../db/client.js';
import { logAction } from '../services/logService.js';

dotenv.config();

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, role = 'user' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, hash, role === 'admin' ? 'admin' : 'user']
    );
    await logAction(result.rows[0].id, 'register', { email });
    return res.json(result.rows[0]);
  } catch {
    return res.status(400).json({ error: 'User already exists' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const userResult = await query('SELECT * FROM users WHERE email=$1', [email]);
  const user = userResult.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: '1d'
  });

  await logAction(user.id, 'login', { email });
  return res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

export default router;
