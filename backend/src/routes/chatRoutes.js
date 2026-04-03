import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';
import {
  handleUserMessage,
  fetchMessages,
  getOrCreateSession,
  onImageModerated,
  onLegalUploaded
} from '../services/agentOrchestrator.js';
import { moderateAsset } from '../services/moderationService.js';
import { logAction } from '../services/logService.js';

const router = Router();
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

router.get('/session', requireAuth, async (req, res) => {
  const session = await getOrCreateSession(req.user.id);
  const messages = await fetchMessages(session.id);

  if (messages.length === 0) {
    const welcome = await handleUserMessage(req.user.id, 'Москва');
    return res.json({ session, messages: [{ sender: 'agent', content: welcome.content, agent: welcome.agent, quickReplies: welcome.quickReplies }] });
  }

  return res.json({ session, messages });
});

router.post('/message', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });

  const reply = await handleUserMessage(req.user.id, text);
  await logAction(req.user.id, 'chat_message', { text });
  return res.json(reply);
});

router.post('/upload/image', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const moderation = moderateAsset(req.file);

  const reply = await onImageModerated(req.user.id, moderation.approved, moderation.reason, req.file.path);
  return res.json({ moderation, reply });
});

router.post('/upload/legal', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return res.status(400).json({ error: 'Unsupported file format' });
  }

  const reply = await onLegalUploaded(req.user.id, req.file.path);
  return res.json({ ok: true, reply });
});

router.get('/campaigns', requireAuth, async (req, res) => {
  const result = await query('SELECT * FROM campaigns WHERE user_id=$1 ORDER BY id DESC', [req.user.id]);
  return res.json(result.rows);
});

router.get('/dashboard', requireAuth, async (req, res) => {
  const campaigns = await query(
    `SELECT status, COUNT(*)::int as count, COALESCE(SUM(forecast_reach),0)::int as total_reach
     FROM campaigns WHERE user_id=$1 GROUP BY status`,
    [req.user.id]
  );
  return res.json(campaigns.rows);
});

export default router;
