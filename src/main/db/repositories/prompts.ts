import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

import type {
  PromptCollectionCreate,
  PromptCollectionRecord,
  PromptCreate,
  PromptRecord,
  PromptUpdate
} from '../../types'

type PromptCollectionRow = Omit<PromptCollectionRecord, 'prompt_count'> & {
  prompt_count: number
}

function mapPromptCollection(row: PromptCollectionRow): PromptCollectionRecord {
  return {
    ...row,
    prompt_count: row.prompt_count
  }
}

function requireNonEmptyPromptText(text: string | undefined): string {
  const value = text ?? ''
  if (!value.trim()) {
    throw new Error('Prompt text is required')
  }
  return value
}

function normalizeOptionalTitle(title: string | undefined): string | null {
  const trimmed = title?.trim()
  return trimmed ? trimmed : null
}

function validateRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    throw new Error('Rating must be an integer between 0 and 5')
  }
  return rating
}

function getPromptOrThrow(db: Database.Database, id: string): PromptRecord {
  const prompt = getPromptById(db, id)
  if (!prompt) {
    throw new Error(`Prompt not found: ${id}`)
  }
  return prompt
}

function getPromptCollectionOrThrow(db: Database.Database, id: string): PromptCollectionRecord {
  const collection = getCollectionById(db, id)
  if (!collection) {
    throw new Error(`Prompt collection not found: ${id}`)
  }
  return collection
}

function validatePromptCollectionId(
  db: Database.Database,
  collectionId: string | null | undefined
): string | null {
  if (!collectionId) return null
  getPromptCollectionOrThrow(db, collectionId)
  return collectionId
}

function ensureValidPromptCollectionName(name: string | undefined): string {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) {
    throw new Error('Collection name is required')
  }
  return trimmed
}

function assertNoPromptCollectionCycle(
  db: Database.Database,
  collectionId: string,
  nextParentId: string | null
): void {
  if (!nextParentId) return
  if (collectionId === nextParentId) {
    throw new Error('A collection cannot be its own parent')
  }

  let currentParentId: string | null = nextParentId
  while (currentParentId) {
    if (currentParentId === collectionId) {
      throw new Error('A collection cannot be moved into one of its descendants')
    }

    currentParentId =
      (db.prepare('SELECT parent_id FROM prompt_collections WHERE id = ?').get(currentParentId) as {
        parent_id: string | null
      } | undefined)?.parent_id ?? null
  }
}

function getNextPromptCollectionSortOrder(
  db: Database.Database,
  parentId: string | null
): number {
  const row = parentId
    ? (db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
           FROM prompt_collections
           WHERE parent_id = ?`
        )
        .get(parentId) as { next_sort_order: number })
    : (db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
           FROM prompt_collections
           WHERE parent_id IS NULL`
        )
        .get() as { next_sort_order: number })

  return row.next_sort_order
}

function getPromptCollectionSortKey(parentId: string | null): string {
  return parentId ?? '__root__'
}

export function getAllPrompts(db: Database.Database): PromptRecord[] {
  return db
    .prepare(
      `SELECT
        id,
        title,
        text,
        rating,
        use_count,
        collection_id,
        created_at,
        updated_at,
        last_used_at
      FROM prompts
      ORDER BY created_at DESC`
    )
    .all() as PromptRecord[]
}

export function getPromptById(db: Database.Database, id: string): PromptRecord | undefined {
  return db
    .prepare(
      `SELECT
        id,
        title,
        text,
        rating,
        use_count,
        collection_id,
        created_at,
        updated_at,
        last_used_at
      FROM prompts
      WHERE id = ?`
    )
    .get(id) as PromptRecord | undefined
}

export function searchPrompts(db: Database.Database, query: string): PromptRecord[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return getAllPrompts(db)
  }

  const like = `%${trimmed}%`

  return db
    .prepare(
      `SELECT
        id,
        title,
        text,
        rating,
        use_count,
        collection_id,
        created_at,
        updated_at,
        last_used_at
      FROM prompts
      WHERE text LIKE ? OR COALESCE(title, '') LIKE ?
      ORDER BY created_at DESC`
    )
    .all(like, like) as PromptRecord[]
}

export function getPromptsByCollection(
  db: Database.Database,
  collectionId: string
): PromptRecord[] {
  validatePromptCollectionId(db, collectionId)

  return db
    .prepare(
      `SELECT
        id,
        title,
        text,
        rating,
        use_count,
        collection_id,
        created_at,
        updated_at,
        last_used_at
      FROM prompts
      WHERE collection_id = ?
      ORDER BY created_at DESC`
    )
    .all(collectionId) as PromptRecord[]
}

export function insertPrompt(db: Database.Database, data: PromptCreate): PromptRecord {
  const id = randomUUID()
  const text = requireNonEmptyPromptText(data.text)
  const title = normalizeOptionalTitle(data.title)
  const collectionId = validatePromptCollectionId(db, data.collection_id ?? null)

  db.prepare(
    `INSERT INTO prompts (
      id, title, text, rating, use_count, collection_id, created_at, updated_at, last_used_at
    ) VALUES (
      ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'), NULL
    )`
  ).run(id, title, text, collectionId)

  return getPromptOrThrow(db, id)
}

export function updatePrompt(
  db: Database.Database,
  id: string,
  data: PromptUpdate
): PromptRecord | undefined {
  getPromptOrThrow(db, id)

  const sets: string[] = []
  const values: unknown[] = []

  if (data.text !== undefined) {
    sets.push('text = ?')
    values.push(requireNonEmptyPromptText(data.text))
  }

  if (data.title !== undefined) {
    sets.push('title = ?')
    values.push(normalizeOptionalTitle(data.title))
  }

  if (data.rating !== undefined) {
    sets.push('rating = ?')
    values.push(validateRating(data.rating))
  }

  if (data.collection_id !== undefined) {
    sets.push('collection_id = ?')
    values.push(validatePromptCollectionId(db, data.collection_id ?? null))
  }

  if (sets.length === 0) {
    return getPromptById(db, id)
  }

  sets.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE prompts SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return getPromptById(db, id)
}

export function deletePrompt(db: Database.Database, id: string): void {
  getPromptOrThrow(db, id)
  db.prepare('DELETE FROM prompts WHERE id = ?').run(id)
}

export function incrementUseCount(db: Database.Database, id: string): void {
  getPromptOrThrow(db, id)

  db.prepare(
    `UPDATE prompts
     SET use_count = use_count + 1,
         last_used_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(id)
}

export function setRating(db: Database.Database, id: string, rating: number): void {
  getPromptOrThrow(db, id)

  db.prepare(
    `UPDATE prompts
     SET rating = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(validateRating(rating), id)
}

export function getAllCollections(db: Database.Database): PromptCollectionRecord[] {
  const rows = db
    .prepare(
      `SELECT
        c.id,
        c.name,
        c.parent_id,
        c.sort_order,
        c.created_at,
        c.updated_at,
        COUNT(p.id) AS prompt_count
      FROM prompt_collections c
      LEFT JOIN prompts p ON p.collection_id = c.id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.created_at ASC`
    )
    .all() as PromptCollectionRow[]

  return rows.map(mapPromptCollection)
}

export function getCollectionById(
  db: Database.Database,
  id: string
): PromptCollectionRecord | undefined {
  const row = db
    .prepare(
      `SELECT
        c.id,
        c.name,
        c.parent_id,
        c.sort_order,
        c.created_at,
        c.updated_at,
        COUNT(p.id) AS prompt_count
      FROM prompt_collections c
      LEFT JOIN prompts p ON p.collection_id = c.id
      WHERE c.id = ?
      GROUP BY c.id`
    )
    .get(id) as PromptCollectionRow | undefined

  return row ? mapPromptCollection(row) : undefined
}

export function insertCollection(
  db: Database.Database,
  data: PromptCollectionCreate
): PromptCollectionRecord {
  const id = randomUUID()
  const name = ensureValidPromptCollectionName(data.name)
  const parentId = validatePromptCollectionId(db, data.parent_id ?? null)
  const sortOrder = getNextPromptCollectionSortOrder(db, parentId)

  db.prepare(
    `INSERT INTO prompt_collections (
      id, name, parent_id, sort_order, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, datetime('now'), datetime('now')
    )`
  ).run(id, name, parentId, sortOrder)

  return getPromptCollectionOrThrow(db, id)
}

export function updateCollection(
  db: Database.Database,
  id: string,
  data: Partial<PromptCollectionCreate>
): PromptCollectionRecord | undefined {
  const existing = getPromptCollectionOrThrow(db, id)

  const sets: string[] = []
  const values: unknown[] = []

  if (data.name !== undefined) {
    sets.push('name = ?')
    values.push(ensureValidPromptCollectionName(data.name))
  }

  if (data.parent_id !== undefined) {
    const parentId = validatePromptCollectionId(db, data.parent_id ?? null)
    assertNoPromptCollectionCycle(db, id, parentId)
    sets.push('parent_id = ?')
    values.push(parentId)

    if (parentId !== existing.parent_id) {
      sets.push('sort_order = ?')
      values.push(getNextPromptCollectionSortOrder(db, parentId))
    }
  }

  if (sets.length === 0) {
    return getCollectionById(db, id)
  }

  sets.push("updated_at = datetime('now')")
  values.push(id)

  db.prepare(`UPDATE prompt_collections SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return getCollectionById(db, id)
}

export function deleteCollection(db: Database.Database, id: string): void {
  getPromptCollectionOrThrow(db, id)
  db.prepare('DELETE FROM prompt_collections WHERE id = ?').run(id)
}

export function reorderCollections(db: Database.Database, orderedIds: string[]): void {
  const uniqueOrderedIds = [...new Set(orderedIds)]
  if (uniqueOrderedIds.length === 0) return

  const rows = db
    .prepare('SELECT id, parent_id, sort_order FROM prompt_collections')
    .all() as Array<{ id: string; parent_id: string | null; sort_order: number }>

  if (rows.length === 0) return

  const rowById = new Map(rows.map((row) => [row.id, row]))
  const counters = new Map<string, number>()
  const assignments = new Map<string, number>()

  for (const id of uniqueOrderedIds) {
    const row = rowById.get(id)
    if (!row) continue

    const key = getPromptCollectionSortKey(row.parent_id)
    const nextSort = counters.get(key) ?? 0
    assignments.set(id, nextSort)
    counters.set(key, nextSort + 1)
  }

  const remainingRows = rows
    .filter((row) => !assignments.has(row.id))
    .sort((left, right) => {
      const parentCompare = getPromptCollectionSortKey(left.parent_id).localeCompare(
        getPromptCollectionSortKey(right.parent_id)
      )
      if (parentCompare !== 0) return parentCompare
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order
      return left.id.localeCompare(right.id)
    })

  for (const row of remainingRows) {
    const key = getPromptCollectionSortKey(row.parent_id)
    const nextSort = counters.get(key) ?? 0
    assignments.set(row.id, nextSort)
    counters.set(key, nextSort + 1)
  }

  db.transaction(() => {
    const updateStmt = db.prepare(
      `UPDATE prompt_collections
       SET sort_order = ?, updated_at = datetime('now')
       WHERE id = ?`
    )

    for (const [id, sortOrder] of assignments) {
      updateStmt.run(sortOrder, id)
    }
  })()
}