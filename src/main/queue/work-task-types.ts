export const WORK_TASK_TYPES = {
  GENERATION: 'generation.image'
} as const

export type WorkTaskType = (typeof WORK_TASK_TYPES)[keyof typeof WORK_TASK_TYPES]
