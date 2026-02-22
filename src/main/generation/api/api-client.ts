import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import type { CanonicalRequestSchema, GenerationOutputArtifact } from '../../types'
import type { ProviderConfig } from '../catalog/provider-config-service'
import type { GenerationResult, ProviderModel, SearchResult, SearchResultModel } from './types'
import { createProviderAdapter } from '../catalog/adapters/adapter-factory'
import { asRecord, getString, toOptionalNumber } from '../catalog/adapters/adapter-utils'

const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000
const MAX_LOG_BODY_CHARS = 1600

/**
 * Known provider field names that represent image/reference-image inputs.
 * Ordered by priority — the first match wins for single-image injection.
 */
const IMAGE_INPUT_FIELD_NAMES = new Set([
  'images',
  'image_urls',
  'image_url',
  'image',
  'init_image',
  'init_image_url',
  'input_image',
  'input_image_url',
  'reference_image',
  'reference_images',
  'ref_images'
])

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
    } else if (search.method === 'QUERY') {
      response = await fetch(endpointUrl, {
        method: 'QUERY',
        headers: {
          ...headers,
          'Content-Type': 'text/plain'
        },
        body: query
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
    const detailUrl = new URL(resolved.url)
    for (const [key, value] of Object.entries(this.config.search?.extraParams ?? {})) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          detailUrl.searchParams.append(key, String(entry))
        }
      } else if (value !== undefined && value !== null) {
        detailUrl.searchParams.set(key, String(value))
      }
    }

    const headers: HeadersInit = {
      Accept: 'application/json',
      ...this.buildAuthHeaders()
    }

    const response = await fetch(detailUrl.toString(), {
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
    this.logInfo('generate:start', {
      providerId: this.config.providerId,
      modelId: model.modelId,
      endpointTemplate: this.config.request?.endpointTemplate,
      hasUploadConfig: !!this.config.upload,
      hasAsyncConfig: !!this.config.async?.enabled,
      paramSummary: this.summarizeParams(params),
      refImageCount: Array.isArray(filePaths) ? filePaths.length : 0
    })

    const preparedParams = { ...params }

    // Strip Distillery-internal ref image fields — the main-process pipeline
    // already resolved them; they must not leak into the provider request body.
    delete preparedParams.ref_image_ids
    delete preparedParams.ref_image_paths

    if (Array.isArray(filePaths) && filePaths.length > 0 && this.config.upload) {
      const uploadedUrls = await Promise.all(filePaths.map((filePath) => this.uploadFile(filePath)))

      // Detect the correct image field(s) from the model's requestSchema and
      // inject uploaded URLs.  Array-typed fields receive all URLs; string-
      // typed fields receive the first URL only.
      const imageFields = this.detectImageFields(model.requestSchema)

      if (imageFields.length > 0) {
        for (const { name, isArray } of imageFields) {
          preparedParams[name] = isArray ? uploadedUrls : uploadedUrls[0]
        }
      } else {
        // Fallback: no known image field detected — use common defaults
        preparedParams.image_urls = uploadedUrls
        if (uploadedUrls.length === 1) {
          preparedParams.image_url = uploadedUrls[0]
        }
      }

      this.logInfo('generate:uploads-prepared', {
        uploadedUrlCount: uploadedUrls.length,
        uploadedUrls,
        targetFields: imageFields.map((f) => f.name)
      })
    }

    const requestEndpointTemplate = this.config.request?.endpointTemplate
    if (!requestEndpointTemplate) {
      throw new Error(`Provider ${this.config.providerId} is missing request.endpointTemplate`)
    }

    const endpoint = this.buildUrl(requestEndpointTemplate.replace('{model_id}', model.modelId))

    this.logInfo('generate:request', {
      endpoint,
      providerId: this.config.providerId,
      modelId: model.modelId,
      payloadSummary: this.summarizeParams(preparedParams)
    })

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
      this.logError('generate:http-error', {
        endpoint,
        providerId: this.config.providerId,
        modelId: model.modelId,
        status: response.status,
        statusText: response.statusText,
        responseBody: this.truncate(errorBody, MAX_LOG_BODY_CHARS),
        payloadSummary: this.summarizeParams(preparedParams)
      })
      throw new Error(
        `Generation request failed: ${response.status} ${response.statusText} ${errorBody}`.trim()
      )
    }

    const payload = (await response.json()) as unknown
    this.logInfo('generate:accepted', {
      providerId: this.config.providerId,
      modelId: model.modelId,
      payloadPreview: this.previewUnknown(payload)
    })

    if (this.config.async?.enabled) {
      const requestId = this.getByPath(payload, this.config.async.requestIdPath)
      if (typeof requestId !== 'string' || !requestId.trim()) {
        this.logError('generate:missing-request-id', {
          providerId: this.config.providerId,
          modelId: model.modelId,
          requestIdPath: this.config.async.requestIdPath,
          payloadPreview: this.previewUnknown(payload)
        })
        throw new Error('Async generation response did not include a request id')
      }

      this.logInfo('generate:polling-start', {
        providerId: this.config.providerId,
        modelId: model.modelId,
        requestId
      })

      const pollResult = await this.pollForResults(requestId, payload, model.modelId)
      this.logInfo('generate:polling-complete', {
        providerId: this.config.providerId,
        modelId: model.modelId,
        outputsPreview: this.previewUnknown(pollResult)
      })
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

  private async pollForResults(
    requestId: string,
    submitPayload: unknown,
    modelId: string
  ): Promise<unknown> {
    const asyncConfig = this.config.async
    if (!asyncConfig) {
      throw new Error('Async strategy is not configured')
    }

    const deadline = Date.now() + (asyncConfig.maxPollTime ?? DEFAULT_POLL_TIMEOUT_MS)
    const pollInterval = asyncConfig.pollInterval ?? 1000
    const pollEndpoint = this.resolvePollEndpoint(requestId, submitPayload, modelId)
    let previousStatus = ''

    this.logInfo('poll:start', {
      providerId: this.config.providerId,
      requestId,
      pollEndpoint,
      pollInterval,
      maxPollTime: asyncConfig.maxPollTime ?? DEFAULT_POLL_TIMEOUT_MS
    })

    while (Date.now() <= deadline) {
      const response = await fetch(pollEndpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...this.buildAuthHeaders()
        }
      })

      if (!response.ok) {
        const responseBody = await response.text()
        this.logError('poll:http-error', {
          providerId: this.config.providerId,
          requestId,
          pollEndpoint,
          status: response.status,
          statusText: response.statusText,
          responseBody: this.truncate(responseBody, MAX_LOG_BODY_CHARS)
        })
        throw new Error(`Poll request failed: ${response.status} ${response.statusText}`)
      }

      const payload = (await response.json()) as unknown
      const statusValue = this.getByPath(payload, asyncConfig.statusPath)
      const status = String(statusValue ?? '')

      if (status !== previousStatus) {
        previousStatus = status
        this.logInfo('poll:status-change', {
          providerId: this.config.providerId,
          requestId,
          status,
          statusPath: asyncConfig.statusPath,
          payloadPreview: this.previewUnknown(payload)
        })
      }

      if (status === asyncConfig.completedValue) {
        const rawOutputs = this.getByPath(payload, asyncConfig.outputsPath) ?? payload
        const resolvedOutputs = await this.resolveAsyncOutputs(rawOutputs)
        this.logInfo('poll:completed', {
          providerId: this.config.providerId,
          requestId,
          outputsPath: asyncConfig.outputsPath,
          outputsPreview: this.previewUnknown(resolvedOutputs)
        })
        return resolvedOutputs
      }

      if (status === asyncConfig.failedValue) {
        const errorValue = asyncConfig.errorPath
          ? this.getByPath(payload, asyncConfig.errorPath)
          : 'Generation failed'
        this.logError('poll:failed', {
          providerId: this.config.providerId,
          requestId,
          status,
          errorPath: asyncConfig.errorPath,
          errorValue: this.previewUnknown(errorValue),
          payloadPreview: this.previewUnknown(payload)
        })
        throw new Error(String(errorValue ?? 'Generation failed'))
      }

      await wait(pollInterval)
    }

    throw new Error('Polling timed out while waiting for generation results')
  }

  private resolvePollEndpoint(requestId: string, submitPayload: unknown, modelId: string): string {
    const asyncConfig = this.config.async
    if (!asyncConfig) {
      throw new Error('Async strategy is not configured')
    }

    const configuredPollUrl = asyncConfig.pollUrlPath
      ? this.getByPath(submitPayload, asyncConfig.pollUrlPath)
      : undefined
    const fallbackPollUrl = this.getByPath(submitPayload, 'status_url')
    const pollUrlCandidate = configuredPollUrl ?? fallbackPollUrl

    if (typeof pollUrlCandidate === 'string' && pollUrlCandidate.trim()) {
      return this.buildUrl(pollUrlCandidate)
    }

    const templateWithModel = asyncConfig.pollEndpoint.includes('{model_id}')
      ? asyncConfig.pollEndpoint.replace('{model_id}', modelId)
      : asyncConfig.pollEndpoint

    return this.buildUrl(templateWithModel.replace('{requestId}', requestId))
  }

  private async resolveAsyncOutputs(value: unknown): Promise<unknown> {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
      return value
    }

    try {
      const response = await fetch(value, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...this.buildAuthHeaders()
        }
      })

      if (!response.ok) {
        const responseBody = await response.text()
        this.logError('poll:outputs-fetch-http-error', {
          providerId: this.config.providerId,
          url: value,
          status: response.status,
          statusText: response.statusText,
          responseBody: this.truncate(responseBody, MAX_LOG_BODY_CHARS)
        })
        return value
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (contentType.includes('application/json')) {
        const payload = (await response.json()) as unknown
        this.logInfo('poll:outputs-fetched-json', {
          providerId: this.config.providerId,
          url: value,
          payloadPreview: this.previewUnknown(payload)
        })
        return payload
      }

      this.logInfo('poll:outputs-fetched-non-json', {
        providerId: this.config.providerId,
        url: value,
        contentType
      })
      return value
    } catch (error) {
      this.logError('poll:outputs-fetch-error', {
        providerId: this.config.providerId,
        url: value,
        error: error instanceof Error ? error.message : String(error)
      })
      return value
    }
  }

  /**
   * Scan a model's requestSchema for known image input fields.
   * Returns a list of `{ name, isArray }` entries so callers can inject
   * uploaded URLs into the correct parameter(s).
   */
  private detectImageFields(
    schema: CanonicalRequestSchema
  ): Array<{ name: string; isArray: boolean }> {
    const result: Array<{ name: string; isArray: boolean }> = []
    if (!schema?.properties) return result

    for (const [key, prop] of Object.entries(schema.properties)) {
      if (!IMAGE_INPUT_FIELD_NAMES.has(key)) continue
      result.push({ name: key, isArray: prop.type === 'array' })
    }

    return result
  }

  private logInfo(event: string, details?: Record<string, unknown>): void {
    if (details) {
      console.log(`[ApiClient:${this.config.providerId}] ${event}`, details)
      return
    }
    console.log(`[ApiClient:${this.config.providerId}] ${event}`)
  }

  private logError(event: string, details?: Record<string, unknown>): void {
    if (details) {
      console.error(`[ApiClient:${this.config.providerId}] ${event}`, details)
      return
    }
    console.error(`[ApiClient:${this.config.providerId}] ${event}`)
  }

  private summarizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        summary[key] = `${this.truncate(value, 80)} (len=${value.length})`
        continue
      }

      if (Array.isArray(value)) {
        summary[key] = `array(len=${value.length})`
        continue
      }

      if (value && typeof value === 'object') {
        summary[key] = `object(keys=${Object.keys(value as Record<string, unknown>).join(',')})`
        continue
      }

      summary[key] = value
    }

    return summary
  }

  private previewUnknown(value: unknown): string {
    if (value === null || value === undefined) return String(value)
    if (typeof value === 'string') return this.truncate(value, 200)

    try {
      return this.truncate(JSON.stringify(value), 200)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }

  private truncate(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value
    return `${value.slice(0, maxChars)}…`
  }

  private extractModelCandidates(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload
    }

    const root = asRecord(payload)
    if (!root) return []

    if (Array.isArray(root.models)) return root.models
    if (Array.isArray(root.results)) return root.results
    if (Array.isArray(root.data)) return root.data

    return []
  }

  private extractHasMore(payload: unknown): boolean | undefined {
    const root = asRecord(payload)
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
    const source = asRecord(raw)
    if (!source) {
      return { modelId: '', name: '', raw }
    }

    const modelId =
      getString(source.modelId) ||
      getString(source.model_id) ||
      getString(source.slug) ||
      getString(source.id) ||
      ''

    return {
      modelId,
      name: getString(source.name) || getString(source.title) || modelId,
      description: getString(source.description) || undefined,
      type: getString(source.type) || undefined,
      runCount: toOptionalNumber(source.run_count) ?? undefined,
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

          const record = asRecord(entry)
          if (!record) return null

          const providerPath =
            getString(record.url) ||
            getString(record.uri) ||
            getString(record.download_url) ||
            getString(record.response_url) ||
            getString(record.path)

          if (!providerPath) return null

          return {
            providerPath,
            mimeType: getString(record.mime_type) || getString(record.mimeType) || undefined
          }
        })
        .filter((entry): entry is GenerationOutputArtifact => !!entry)
    }

    const record = asRecord(value)
    if (!record) return []

    const nested =
      record.outputs ??
      record.output ??
      record.images ??
      record.image ??
      record.videos ??
      record.video ??
      record.data ??
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
      const record = asRecord(cursor)
      if (!record || !(part in record)) {
        return undefined
      }
      cursor = record[part]
    }

    return cursor
  }

}

async function wait(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}

export async function downloadRemoteOutput(url: string): Promise<string> {
  console.log('[ApiClient:downloadRemoteOutput] start', { url })

  const response = await fetch(url)
  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[ApiClient:downloadRemoteOutput] http-error', {
      url,
      status: response.status,
      statusText: response.statusText,
      responseBody: errorBody.length <= MAX_LOG_BODY_CHARS ? errorBody : `${errorBody.slice(0, MAX_LOG_BODY_CHARS)}…`
    })
    throw new Error(`Failed to download output: ${response.status} ${response.statusText}`)
  }

  const fileNamePart = path.basename(new URL(url).pathname) || `${randomUUID()}.png`
  const outputDir = path.join(app.getPath('temp'), 'distillery', 'remote-outputs')
  await fs.promises.mkdir(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, `${randomUUID()}-${fileNamePart}`)
  const arrayBuffer = await response.arrayBuffer()
  const content = Buffer.from(arrayBuffer)
  await fs.promises.writeFile(outputPath, content)

  console.log('[ApiClient:downloadRemoteOutput] complete', {
    url,
    outputPath,
    bytes: content.byteLength
  })

  return outputPath
}
