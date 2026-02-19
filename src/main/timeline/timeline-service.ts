import Database from 'better-sqlite3'
import * as generationRepo from '../db/repositories/generations'
import * as workQueueRepo from '../db/repositories/work-queue'

// =============================================================================
// Timeline Service
// Manages generation history queries and cleanup.
// =============================================================================

export class TimelineService {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * Initialize timeline on app start.
   * Marks any interrupted generations/queue items from previous sessions as failed.
   */
  initialize(): void {
    generationRepo.markInterruptedGenerations(this.db)
    workQueueRepo.markInterruptedWorkItems(this.db)
    console.log('[TimelineService] Marked interrupted jobs as failed')
  }

  /**
   * Get all generations for timeline display.
   */
  getAll(): { generations: import('../types').GenerationRecord[] } {
    return {
      generations: generationRepo.getAllGenerations(this.db)
    }
  }

  /**
   * Remove a generation and all associated data.
   */
  remove(id: string): void {
    generationRepo.removeGeneration(this.db, id)
  }

  /**
   * Clear all failed generations.
   */
  clearFailed(): void {
    const all = generationRepo.getAllGenerations(this.db)
    for (const gen of all) {
      if (gen.status === 'failed') {
        generationRepo.removeGeneration(this.db, gen.id)
      }
    }
  }
}
