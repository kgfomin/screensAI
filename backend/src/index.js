import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import locationRoutes from './routes/locationRoutes.js';
import { initSchema } from './db/schema.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/locations', locationRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

const port = process.env.PORT || 4000;

initSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`API started on :${port}`);
    });
  })
  .catch((e) => {
    console.error('Failed to initialize DB schema', e);
    process.exit(1);
  });
