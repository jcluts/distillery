import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { SQL_MIGRATIONS } from './migrations'

let db: Database.Database | null = null

/**
 * Get or create the SQLite database connection.
 * Database file lives in Electron's userData directory.
 */
export function getDatabase(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = join(dbDir, 'distillery.db')

  db = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run migrations
  runMigrations(db)

  return db
}

/**
 * Close the database connection. Called on app shutdown.
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * Run all pending SQL migration files.
 * Migrations are applied in alphabetical order by filename.
 */
function runMigrations(database: Database.Database): void {
  // Ensure _migrations table exists (bootstrap - the first migration also creates it,
  // but we need it to exist before we check what's been applied)
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (database.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(
      (row) => row.name
    )
  )

  for (const migration of SQL_MIGRATIONS) {
    if (applied.has(migration.name)) continue

    console.log(`[DB] Applying migration: ${migration.name}`)

    database.transaction(() => {
      database.exec(migration.sql)
      database
        .prepare('INSERT INTO _migrations (name) VALUES (?)')
        .run(migration.name)
    })()

    console.log(`[DB] Migration applied: ${migration.name}`)
  }
}
