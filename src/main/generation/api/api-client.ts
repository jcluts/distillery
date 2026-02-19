import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { GenerationOutputArtifact } from '../../types'
import type { ProviderConfig } from '../catalog/provider-config-service'
import type { GenerationResult, ProviderModel, SearchResult, SearchResultModel } from './types'
import { createProviderAdapter } from '../catalog/adapters/adapter-factory'

const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000

export class ApiClient {
  private config: ProviderConfig
  private apiKey: string

  constructor(config: ProviderConfig, apiKey: string) {
    this.config = config
    this.apiKey = apiKey.trim()
  }

  private buildAuthHeaders(): Record<string, string> {
    if (!this.config.auth) {
      return {}
    }

    const headerName = this.config.auth.header || 'Authorization'
    const authPrefix = this.config.auth.prefix || (this.config.auth.type === 'key' ? 'Key' : 'Bearer')
    const token = authPrefix ? `${authPrefix} ${this.apiKey}` : this.apiKey

    return {
      [headerName]: token
    }
  }

  private buildUrl(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint
    }

    const baseUrl = this.config.baseUrl ?? ''
    const baseTrimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    const endpointTrimmed = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    return `${baseTrimmed}${endpointTrimmed}`
  }

  async searchModels(query: string): Promise<SearchResult> {
    const search = this.config.search
    if (!search) {
      return { models: [] }
    }

    const adapter = createProviderAdapter(this.config.adapter)

    const endpointUrl = this.buildUrl(search.endpoint)
    const headers: HeadersInit = {
      Accept: 'application/json',
      ...this.buildAuthHeaders()
    }

    let response: Response

    if (search.method === 'GET') {
      const url = new URL(endpointUrl)

      if (search.queryParam) {
        url.searchParams.set(search.queryParam, query)
      }

      if (search.limitParam && typeof search.maxResults === 'number') {
        url.searchParams.set(search.limitParam, String(search.maxResults))
      }

      for (const [key, value] of Object.entries(search.extraParams ?? {})) {
        url.searchParams.set(key, value)
      }

      response = await fetch(url.toString(), {
        method: 'GET',
        headers
      })
    } else {
      const body: Record<string, unknown> = {
        query,
        q: query,
        limit: search.maxResults
      }

      response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    }

    if (!response.ok) {
      throw new Error(`Model search failed: ${response.status} ${response.statusText}`)
    }

    const payload = (await response.json()) as unknown
    const models = this.extractModelCandidates(payload)

    const normalized = models.map((item) => {
      if (adapter) {
        return adapter.normalizeSearchResult(item, this.config)
      }

      return this.defaultNormalizeSearch(item)
    })

    return {
      models: normalized.filter((item) => item.modelId),
      hasMore: this.extractHasMore(payload)
    }
  }

  async fetchModelDetail(modelId: string): Promise<ProviderModel | null> {
    const detailEndpointTemplate = this.config.search?.detailEndpoint
    if (!detailEndpointTemplate) {
      return null
    }

    const adapter = createProviderAdapter(this.config.adapter)
    const resolved = this.resolveDetailEndpoint(detailEndpointTemplate, modelId)
    const headers: HeadersInit = {
      Accept: 'application/json',
      ...this.buildAuthHeaders()
    }

    const response = await fetch(resolved.url, {
      method: 'GET',
      headers
    })

    if (!response.ok) {
      throw new Error(`Model detail fetch failed: ${response.status} ${response.statusText}`)
    }

    const payload = (await response.json()) as unknown

    if (adapter) {
      return adapter.normalizeModelDetail(payload, this.config)
    }

    const normalized = this.defaultNormalizeSearch(payload)
    if (!normalized.modelId) {
      return null
    }

    return {
      modelId: normalized.modelId,
      name: normalized.name,
      description: normalized.description,
      type: normalized.type,
      providerId: this.config.providerId,
      requestSchema: {
        properties: {
          prompt: {
            type: 'string',
            title: 'Prompt'
          }
        },
        required: ['prompt'],
        order: ['prompt']
      }
    }
  }

  async fetchModelList(): Promise<ProviderModel[]> {
    const search = this.config.search
    if (!search?.endpoint) {
      return []
    }

    const endpointUrl = this.buildUrl(search.endpoint)
    const response = await fetch(endpointUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...this.buildAuthHeaders()
      }
    })

    if (!response.ok) {
      throw new Error(`Model list failed: ${response.status} ${response.statusText}`)
    }

    const payload = (await response.json()) as unknown
    const candidates = this.extractModelCandidates(payload)

    const adapter = createProviderAdapter(this.config.adapter)

    if (!adapter) {
      return candidates
        .map((candidate) => this.defaultNormalizeSearch(candidate))
        .filter((model) => model.modelId)
        .map((model) => ({
          modelId: model.modelId,
          name: model.name,
          description: model.description,
          type: model.type,
          providerId: this.config.providerId,
          requestSchema: {
            properties: {
              prompt: {
                type: 'string',
                title: 'Prompt'
              }
            },
            required: ['prompt'],
            order: ['prompt']
          }
        }))
    }

    const details = await Promise.all(candidates.map((candidate) => adapter.normalizeModelDetail(candidate, this.config)))
    return details.filter((entry): entry is ProviderModel => !!entry)
  }

  async uploadFile(filePath: string): Promise<string> {
    const uploadConfig = this.config.upload
    if (!uploadConfig) {
      throw new Error(`Provider ${this.config.providerId} does not support uploads`)
    }

    const endpointUrl = this.buildUrl(uploadConfig.endpoint)

    if (uploadConfig.method === 'json') {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...this.buildAuthHeaders()
        },
        body: JSON.stringify({ filePath })
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
      }

      const payload = (await response.json()) as unknown
      const extracted = this.getByPath(payload, uploadConfig.responseField)
      if (typeof extracted !== 'string' || !extracted.trim()) {
        throw new Error('Upload response did not contain a valid file URL')
      }
      return extracted
    }

    const form = new FormData()
    const fileBuffer = await fs.promises.readFile(filePath)
    const fileName = path.basename(filePath)
    form.append(uploadConfig.fileField || 'file', new Blob([fileBuffer]), fileName)

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...this.buildAuthHeaders()
      },
      body: form
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
    }

    const payload = (await response.json()) as unknown
    const extracted = this.getByPath(payload, uploadConfig.responseField)
    if (typeof extracted !== 'string' || !extracted.trim()) {
      throw new Error('Upload response did not contain a valid file URL')
    }

    return extracted
  }

  async generate(
    model: ProviderModel,
    params: Record<string, unknown>,
    filePaths?: string[]
  ): Promise<GenerationResult> {
    const preparedParams = { ...params }

    if (Array.isArray(filePaths) && filePaths.length > 0 && this.config.upload) {
      const uploadedUrls = await Promise.all(filePaths.map((filePath) => this.uploadFile(filePath)))

      if (!('image_urls' in preparedParams)) {
        preparedParams.image_urls = uploadedUrls
      }

      if (uploadedUrls.length === 1 && !('image_url' in preparedParams)) {
        preparedParams.image_url = uploadedUrls[0]
      }
    }

    const requestEndpointTemplate = this.config.request?.endpointTemplate
    if (!requestEndpointTemplate) {
      throw new Error(`Provider ${this.config.providerId} is missing request.endpointTemplate`)
    }

    const endpoint = this.buildUrl(requestEndpointTemplate.replace('{model_id}', model.modelId))

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders()
      },
      body: JSON.stringify(preparedParams)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `Generation request failed: ${response.status} ${response.statusText} ${errorBody}`.trim()
      )
    }

    const payload = (await response.json()) as unknown

    if (this.config.async?.enabled) {
      const requestId = this.getByPath(payload, this.config.async.requestIdPath)
      if (typeof requestId !== 'string' || !requestId.trim()) {
        throw new Error('Async generation response did not include a request id')
      }

      const pollResult = await this.pollForResults(requestId)
      return {
        success: true,
        outputs: this.normalizeOutputs(pollResult)
      }
    }

    const outputs = this.normalizeOutputs(
      this.getByPath(payload, this.config.async?.outputsPath || 'outputs') ?? payload
    )

    return {
      success: true,
      outputs
    }
  }

  private async pollForResults(requestId: string): Promise<unknown> {
    const asyncConfig = this.config.async
    if (!asyncConfig) {
      throw new Error('Async strategy is not configured')
    }

    const deadline = Date.now() + (asyncConfig.maxPollTime ?? DEFAULT_POLL_TIMEOUT_MS)
    const pollInterval = asyncConfig.pollInterval ?? 1000
    const pollEndpoint = this.buildUrl(asyncConfig.pollEndpoint.replace('{requestId}', requestId))

    while (Date.now() <= deadline) {
      const response = await fetch(pollEndpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...this.buildAuthHeaders()
        }
      })

      if (!response.ok) {
        throw new Error(`Poll request failed: ${response.status} ${response.statusText}`)
      }

      const payload = (await response.json()) as unknown
      const statusValue = this.getByPath(payload, asyncConfig.statusPath)
      const status = String(statusValue ?? '')

      if (status === asyncConfig.completedValue) {
        return this.getByPath(payload, asyncConfig.outputsPath) ?? payload
      }

      if (status === asyncConfig.failedValue) {
        const errorValue = asyncConfig.errorPath
          ? this.getByPath(payload, asyncConfig.errorPath)
          : 'Generation failed'
        throw new Error(String(errorValue ?? 'Generation failed'))
      }

      await wait(pollInterval)
    }

    throw new Error('Polling timed out while waiting for generation results')
  }

  private extractModelCandidates(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload
    }

    const root = this.asRecord(payload)
    if (!root) return []

    if (Array.isArray(root.models)) return root.models
    if (Array.isArray(root.results)) return root.results
    if (Array.isArray(root.data)) return root.data

    return []
  }

  private extractHasMore(payload: unknown): boolean | undefined {
    const root = this.asRecord(payload)
    if (!root) return undefined

    const hasMore = root.has_more
    if (typeof hasMore === 'boolean') {
      return hasMore
    }

    const next = root.next
    if (typeof next === 'string') {
      return next.trim().length > 0
    }

    return undefined
  }

  private resolveDetailEndpoint(
    detailEndpointTemplate: string,
    modelId: string
  ): { url: string; queryParams?: Record<string, string> } {
    if (detailEndpointTemplate.includes('{owner}') && detailEndpointTemplate.includes('{name}')) {
      const [owner, name] = modelId.split('/')
      const endpoint = detailEndpointTemplate
        .replace('{owner}', owner ?? '')
        .replace('{name}', name ?? '')
      return { url: this.buildUrl(endpoint) }
    }

    if (detailEndpointTemplate.includes('{model_id}')) {
      return {
        url: this.buildUrl(detailEndpointTemplate.replace('{model_id}', modelId))
      }
    }

    const url = new URL(this.buildUrl(detailEndpointTemplate))
    if (this.config.search?.detailQueryParam) {
      url.searchParams.set(this.config.search.detailQueryParam, modelId)
    }

    return { url: url.toString() }
  }

  private defaultNormalizeSearch(raw: unknown): SearchResultModel {
    const source = this.asRecord(raw)
    if (!source) {
      return { modelId: '', name: '', raw }
    }

    const modelId =
      this.getString(source.modelId) ||
      this.getString(source.model_id) ||
      this.getString(source.slug) ||
      this.getString(source.id) ||
      ''

    return {
      modelId,
      name: this.getString(source.name) || this.getString(source.title) || modelId,
      description: this.getString(source.description) || undefined,
      type: this.getString(source.type) || undefined,
      runCount: this.toOptionalNumber(source.run_count) ?? undefined,
      raw
    }
  }

  private normalizeOutputs(value: unknown): GenerationOutputArtifact[] {
    if (!value) return []

    if (typeof value === 'string') {
      return [{ providerPath: value }]
    }

    if (Array.isArray(value)) {
      return value
        .map((entry) => {
          if (typeof entry === 'string') {
            return { providerPath: entry }
          }

          const record = this.asRecord(entry)
          if (!record) return null

          const providerPath =
            this.getString(record.url) ||
            this.getString(record.download_url) ||
            this.getString(record.response_url) ||
            this.getString(record.path)

          if (!providerPath) return null

          return {
            providerPath,
            mimeType: this.getString(record.mime_type) || this.getString(record.mimeType) || undefined
          }
        })
        .filter((entry): entry is GenerationOutputArtifact => !!entry)
    }

    const record = this.asRecord(value)
    if (!record) return []

    const nested =
      record.outputs ??
      record.output ??
      record.response_url ??
      record.url ??
      record.download_url ??
      null

    return this.normalizeOutputs(nested)
  }

  private getByPath(value: unknown, pathExpression: string): unknown {
    if (!pathExpression) return value

    const parts = pathExpression.split('.').filter(Boolean)
    let cursor: unknown = value

    for (const part of parts) {
      const record = this.asRecord(cursor)
      if (!record || !(part in record)) {
        return undefined
      }
      cursor = record[part]
    }

    return cursor
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null
    return value as Record<string, unknown>
  }

  private getString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  private toOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }
}

async function wait(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}

export async function downloadRemoteOutput(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download output: ${response.status} ${response.statusText}`)
  }

  const fileNamePart = path.basename(new URL(url).pathname) || `${randomUUID()}.png`
  const outputDir = path.join(app.getPath('temp'), 'distillery', 'remote-outputs')
  await fs.promises.mkdir(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, `${randomUUID()}-${fileNamePart}`)
  const arrayBuffer = await response.arrayBuffer()
  const content = Buffer.from(arrayBuffer)
  await fs.promises.writeFile(outputPath, content)

  return outputPath
}
