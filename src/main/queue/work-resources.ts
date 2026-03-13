export const WORK_RESOURCE_KEYS = {
  LOCAL_INFERENCE: 'resource:local-inference'
} as const

export type WorkResourceKey = (typeof WORK_RESOURCE_KEYS)[keyof typeof WORK_RESOURCE_KEYS]