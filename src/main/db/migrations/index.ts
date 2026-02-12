export interface SqlMigration {
  name: string
  sql: string
}

/**
 * List of migrations bundled at build-time.
 *
 * Using `import.meta.glob` avoids relying on runtime filesystem paths, which is
 * brittle once the app is packaged (ASAR/unpacked layouts vary by platform).
 */
const migrationModules = import.meta.glob<string>('./*.sql', {
  eager: true,
  query: '?raw',
  import: 'default'
})

export const SQL_MIGRATIONS: SqlMigration[] = Object.entries(migrationModules)
  .map(([path, sql]) => {
    const normalizedPath = path.replace(/\\/g, '/')
    const name = normalizedPath.split('/').pop() ?? normalizedPath
    return { name, sql }
  })
  .sort((a, b) => a.name.localeCompare(b.name))
