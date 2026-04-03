import { query } from './client.js';

export async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS locations (
      id SERIAL PRIMARY KEY,
      city TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'draft',
      target_type TEXT,
      target_value TEXT,
      atm_count INTEGER DEFAULT 0,
      image_path TEXT,
      legal_file_path TEXT,
      legal_approved BOOLEAN DEFAULT FALSE,
      forecast_days INTEGER DEFAULT 7,
      forecast_reach INTEGER DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaign_atms (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
      location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
      step TEXT NOT NULL DEFAULT 'select_target',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      agent_type TEXT,
      content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
