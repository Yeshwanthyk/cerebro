/**
 * SQLite database for Cerebro state management
 * Uses Bun's built-in SQLite support (bun:sqlite)
 */
import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join, resolve } from "path";
import { mkdirSync, existsSync } from "fs";

// Singleton database instance
let db: Database | null = null;
let currentDbPath: string | null = null;

/**
 * Get the config directory path (reads env var at runtime for testability)
 */
export function getConfigDir(): string {
  return process.env["CEREBRO_CONFIG_DIR"]
    ? resolve(process.env["CEREBRO_CONFIG_DIR"])
    : join(homedir(), ".config", "cerebro");
}

/**
 * Get or create the database connection
 */
export function getDb(): Database {
  const configDir = getConfigDir();
  const dbPath = join(configDir, "cerebro.db");

  // If db exists but path changed (e.g., env var changed), close and reopen
  if (db && currentDbPath !== dbPath) {
    db.close();
    db = null;
  }

  if (db) return db;

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  db = new Database(dbPath);
  currentDbPath = dbPath;
  db.exec("PRAGMA journal_mode = WAL"); // Better concurrent access
  db.exec("PRAGMA foreign_keys = ON");
  initSchema();
  return db;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Initialize database schema
 */
function initSchema(): void {
  const database = db!;

  // Config table (key-value store for simple settings)
  database.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Repositories
  database.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      base_branch TEXT NOT NULL,
      added_at INTEGER NOT NULL
    )
  `);

  // Current repo setting (stored in config table)
  // Viewed files (per repo/branch/commit)
  database.exec(`
    CREATE TABLE IF NOT EXISTS viewed_files (
      repo_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      file_path TEXT NOT NULL,
      viewed_at INTEGER NOT NULL,
      PRIMARY KEY (repo_id, branch, commit_hash, file_path),
      FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
    )
  `);

  // Create index for faster queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_viewed_files_lookup
    ON viewed_files(repo_id, branch, commit_hash)
  `);

  // Comments
  database.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      text TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved INTEGER DEFAULT 0,
      resolved_by TEXT,
      resolved_at INTEGER,
      FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for comments
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_comments_repo_branch
    ON comments(repo_id, branch, resolved)
  `);

  // Notes
  database.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      text TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      dismissed INTEGER DEFAULT 0,
      dismissed_by TEXT,
      dismissed_at INTEGER,
      FOREIGN KEY (repo_id) REFERENCES repos(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for notes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_repo_branch
    ON notes(repo_id, branch, dismissed)
  `);
}

/**
 * Generate a simple unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
