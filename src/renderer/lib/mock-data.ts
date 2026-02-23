import type { EngineStatus, GenerationRecord, MediaPage, MediaRecord, WorkQueueItem } from '@/types'

function isoAgo(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString()
}

function clampRating(value: number): number {
  return Math.max(0, Math.min(5, value))
}

export function createMockMediaPage(count = 96): MediaPage {
  const items: MediaRecord[] = Array.from({ length: count }).map((_, i) => {
    const id = `mock-media-${String(i + 1).padStart(4, '0')}`
    const isGenerated = i % 3 !== 0
    const width = i % 5 === 0 ? 1024 : i % 2 === 0 ? 1024 : 682
    const height = i % 5 === 0 ? 1024 : i % 2 === 0 ? 682 : 1024

    return {
      id,
      file_path: `originals/mock/${id}.png`,
      thumb_path: null,
      file_name: isGenerated ? `${id}.png` : `${id}.jpg`,
      media_type: 'image',
      origin: isGenerated ? 'generation' : 'import',
      width,
      height,
      duration: null,
      file_size: 1024 * 1024 * (i % 7 === 0 ? 3 : 2),
      rating: clampRating((i % 7) - 1),
      status: i % 11 === 0 ? 'selected' : i % 13 === 0 ? 'rejected' : null,
      keywords: null,
      generation_id: isGenerated ? `mock-gen-${String(Math.floor(i / 2) + 1).padStart(4, '0')}` : null,
      origin_id: null,
      active_upscale_id: null,
      working_file_path: null,
      created_at: isoAgo(i * 1000 * 60 * 10),
      updated_at: isoAgo(i * 1000 * 60 * 10)
    }
  })

  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 200
  }
}

export function createMockGenerations(count = 24): GenerationRecord[] {
  return Array.from({ length: count }).map((_, i) => {
    const id = `mock-gen-${String(i + 1).padStart(4, '0')}`
    const status: GenerationRecord['status'] =
      i === 0 ? 'pending' : i % 9 === 0 ? 'failed' : 'completed'

    return {
      id,
      number: 1000 + i,
      model_identity_id: null,
      provider: 'local',
      model_file: 'FLUX.2 Klein (mock)',
      prompt:
        i % 2 === 0
          ? 'A cinematic portrait photo, rim lighting, shallow depth of field'
          : 'Minimal product photo on a studio background, softbox lighting',
      width: 1024,
      height: 1024,
      seed: status === 'completed' ? 123456 + i : -1,
      steps: 4,
      guidance: 3.5,
      sampling_method: 'euler',
      params_json: null,
      status,
      error: status === 'failed' ? 'Mock error: model out of memory' : null,
      total_time_ms: status === 'completed' ? 3400 + i * 12 : null,
      prompt_cache_hit: i % 4 === 0,
      ref_latent_cache_hit: i % 5 === 0,
      output_paths: status === 'completed' ? JSON.stringify([`originals/mock/${id}.png`]) : null,
      created_at: isoAgo(i * 1000 * 60 * 15),
      started_at: status === 'pending' ? null : isoAgo(i * 1000 * 60 * 15 - 1000 * 5),
      completed_at: status === 'completed' ? isoAgo(i * 1000 * 60 * 15 - 1000 * 3) : null
    }
  })
}

export function createMockQueueItems(): WorkQueueItem[] {
  return [
    {
      id: 'mock-queue-0001',
      task_type: 'generation.local.image',
      status: 'processing',
      priority: 0,
      correlation_id: 'mock-gen-0001',
      owner_module: 'generation',
      error_message: null,
      attempt_count: 1,
      max_attempts: 1,
      created_at: isoAgo(1000 * 25),
      started_at: isoAgo(1000 * 10),
      completed_at: null
    },
    {
      id: 'mock-queue-0002',
      task_type: 'generation.local.image',
      status: 'pending',
      priority: 0,
      correlation_id: 'mock-gen-0002',
      owner_module: 'generation',
      error_message: null,
      attempt_count: 0,
      max_attempts: 1,
      created_at: isoAgo(1000 * 5),
      started_at: null,
      completed_at: null
    }
  ]
}

export function createMockEngineStatus(): EngineStatus {
  return {
    state: 'idle',
    modelName: 'FLUX.2 Klein (mock)'
  }
}
