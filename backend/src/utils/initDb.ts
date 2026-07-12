import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = process.env.DB_PATH || './data/anime-recommender.db';

export function initializeDatabase(): Database.Database {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      device_ids TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- User settings (model preferences, etc.)
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      pro_model TEXT DEFAULT 'gemini-3-pro-preview',
      flash_model TEXT DEFAULT 'gemini-3-flash-preview',
      theme TEXT DEFAULT 'dark',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Anime catalog (cached from AniList/Jikan)
    CREATE TABLE IF NOT EXISTS anime (
      id INTEGER PRIMARY KEY,
      anilist_id INTEGER UNIQUE,
      mal_id INTEGER,
      title_romaji TEXT,
      title_english TEXT,
      title_native TEXT,
      synopsis TEXT,
      cover_image TEXT,
      banner_image TEXT,
      genres TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      ai_tags TEXT DEFAULT '[]',
      ai_blurb TEXT,
      episodes INTEGER,
      status TEXT,
      season TEXT,
      season_year INTEGER,
      average_score REAL,
      popularity INTEGER,
      source TEXT,
      studios TEXT DEFAULT '[]',
      format TEXT,
      start_date TEXT,
      end_date TEXT,
      is_adult INTEGER DEFAULT 0,
      fetched_at TEXT DEFAULT (datetime('now')),
      tags_extracted_at TEXT
    );

    -- User anime list (their personal collection)
    CREATE TABLE IF NOT EXISTS user_anime (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'planning',
      rating REAL,
      notes TEXT,
      favorite INTEGER DEFAULT 0,
      episodes_watched INTEGER DEFAULT 0,
      added_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, anime_id)
    );

    -- User personalization file (user.md content)
    CREATE TABLE IF NOT EXISTS user_personalization (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      user_md TEXT NOT NULL DEFAULT '',
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Encrypted backups (server-side storage of encrypted blobs)
    CREATE TABLE IF NOT EXISTS encrypted_backups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      encrypted_blob TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Recommendation history
    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anime_ids TEXT NOT NULL DEFAULT '[]',
      explanations TEXT NOT NULL DEFAULT '{}',
      model_used TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_user_anime_user ON user_anime(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_anime_anime ON user_anime(anime_id);
    CREATE INDEX IF NOT EXISTS idx_anime_anilist ON anime(anilist_id);
    CREATE INDEX IF NOT EXISTS idx_anime_mal ON anime(mal_id);
    CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations(user_id);

    -- Shared AI sessions (Admin shares their Antigravity auth via invite link)
    CREATE TABLE IF NOT EXISTS shared_sessions (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invite_token TEXT UNIQUE NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      project_id TEXT NOT NULL,
      email TEXT,
      token_expiry INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Guests using a shared session
    CREATE TABLE IF NOT EXISTS session_guests (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE,
      guest_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_active INTEGER DEFAULT 1,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(session_id, guest_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shared_sessions_admin ON shared_sessions(admin_user_id);
    CREATE INDEX IF NOT EXISTS idx_shared_sessions_invite ON shared_sessions(invite_token);
    CREATE INDEX IF NOT EXISTS idx_session_guests_guest ON session_guests(guest_user_id);
    CREATE INDEX IF NOT EXISTS idx_session_guests_session ON session_guests(session_id);

    -- Import jobs tracking table (job history/final state persistence)
    CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      stage TEXT,
      processed INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      result_json TEXT,
      error TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(user_id);

    -- Library state tracking
    CREATE TABLE IF NOT EXISTS library_state (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER DEFAULT 0,
      last_updated TEXT DEFAULT (datetime('now'))
    );

    -- Library synchronization log
    CREATE TABLE IF NOT EXISTS library_sync_log (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      anime_id INTEGER NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_library_sync_log_user_seq ON library_sync_log(user_id, sequence);
  `);

  // Cleanup stale jobs from previous run (marked as abandoned)
  try {
    db.prepare(`
      UPDATE import_jobs 
      SET status = 'abandoned', error = 'Server restarted during processing' 
      WHERE status IN ('pending', 'running')
    `).run();
    console.log('🧹 Cleaned up stale running/pending import jobs');
  } catch (err: any) {
    console.error('Failed to cleanup stale jobs:', err.message);
  }

  console.log('✅ Database initialized successfully');
  return db;
}

// Run if called directly
if (require.main === module) {
  const db = initializeDatabase();
  db.close();
}
