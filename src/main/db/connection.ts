import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'

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

  const migrationsDir = join(__dirname, '../../src/main/db/migrations')
  // Also try the packaged location
  const altMigrationsDir = join(__dirname, '../db/migrations')

  let migrationPath = migrationsDir
  if (!existsSync(migrationPath)) {
    migrationPath = altMigrationsDir
  }
  if (!existsSync(migrationPath)) {
    // In development with electron-vite, migrations are alongside compiled output
    // Try resolving from the project root
    const devPath = join(process.cwd(), 'src/main/db/migrations')
    if (existsSync(devPath)) {
      migrationPath = devPath
    } else {
      console.warn('[DB] No migrations directory found, skipping migrations')
      return
    }
  }

  const files = readdirSync(migrationPath)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const applied = new Set(
    database
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row: { name: string }) => row.name)
  )

  for (const file of files) {
    if (applied.has(file)) continue

    const sql = readFileSync(join(migrationPath, file), 'utf-8')

    console.log(`[DB] Applying migration: ${file}`)

    database.transaction(() => {
      database.exec(sql)
      database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
    })()

    console.log(`[DB] Migration applied: ${file}`)
  }
}
