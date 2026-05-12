import * as fs from 'fs'
import * as path from 'path'
import type { CanonicalRequestSchema } from '../../types'
import type { ProviderConfig } from '../catalog/provider-config'
import type { ProviderModel, SearchResult, SearchResultModel } from '../management/types'
import {
  asRecord,
  asOptionalNumber,
  coerceGenerationMode,
  getString,
  inferModeInfo
} from '../param-utils'
import { getProviderAdapter } from './adapters/adapter-registry'
import {
  extractHasMore,
  extractModelCandidates,
  getByPath,
  normalizeOutputs,
  type ProviderOutputArtifact
} from './response-utils'

const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000
const MAX_LOG_BODY_CHARS = 1600

const IMAGE_INPUT_FIELD_NAMES = new Set([
  'images',
  'image_urls',
  'image_url',
  'image',
  'init_image',
  'init_image_url',
  'input_image',
  'input_image_url',
  'image_input',
  'input_urls',
  'first_frame_url',
  'last_frame_url',
  'reference_image',
  'reference_images',
  'ref_images'
])

export interface RemoteGenerationResult {
  success: boolean
  outputs: ProviderOutputArtifact[]
  error?: string
  metrics?: {
    seed?: number
    totalTimeMs?: number
    promptCacheHit?: boolean
    refLatentCacheHit?: boolean
  }
}

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
    const authPrefix =
      this.config.auth.prefix ?? (this.config.auth.type === 'key' ? 'Key' : 'Bearer')
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

    const adapter = getProviderAdapter(this.config.adapter)

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
    const models = extractModelCandidates(payload, asRecord)

    const normalized = models.map((item) => {
      if (adapter) {
        return adapter.normalizeSearchResult(item, this.config)
      }

      return this.defaultNormalizeSearch(item)
    })
    const withModelIds = normalized.filter((item) => item.modelId)

    return {
      models: await this.enrichSearchResults(withModelIds),
      hasMore: extractHasMore(payload, asRecord)
    }
  }

  async fetchModelDetail(modelId: string): Promise<ProviderModel | null> {
    const detailEndpointTemplate = this.config.search?.detailEndpoint
    if (!detailEndpointTemplate) {
      return null
    }

    const adapter = getProviderAdapter(this.config.adapter)
    const detailUrl = this.resolveDetailEndpoint(detailEndpointTemplate, modelId)
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
      modes: normalized.modes,
      outputType: normalized.outputType,
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

  private async enrichSearchResults(models: SearchResultModel[]): Promise<SearchResultModel[]> {
    if (!this.config.search?.detailEndpoint || !this.config.search.searchOnly) {
      return models
    }

    const details = await Promise.all(
      models.map(async (model) => {
        try {
          return await this.fetchModelDetail(model.modelId)
        } catch {
          return null
        }
      })
    )

    return models.map((model, index) => {
      const detail = details[index]
      if (!detail) return model

      return {
        ...model,
        name: detail.name || model.name,
        description: detail.description ?? model.description,
        type: detail.type ?? model.type,
        modes: detail.modes ?? model.modes,
        outputType: detail.outputType ?? model.outputType
      }
    })
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
    const candidates = extractModelCandidates(payload, asRecord)

    const adapter = getProviderAdapter(this.config.adapter)

    if (!adapter) {
      return candidates
        .map((candidate) => this.defaultNormalizeSearch(candidate))
        .filter((model) => model.modelId)
        .map((model) => ({
          modelId: model.modelId,
          name: model.name,
          description: model.description,
          type: model.type,
          modes: model.modes,
          outputType: model.outputType,
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

    const details = await Promise.all(
      candidates.map((candidate) => adapter.normalizeModelDetail(candidate, this.config))
    )
    return details.filter((entry): entry is ProviderModel => !!entry)
  }

  async uploadFile(
    filePath: string,
    uploadConfig: NonNullable<ProviderConfig['upload']>
  ): Promise<string> {
    if (this.shouldUseSignedUrlUpload(uploadConfig)) {
      return this.uploadFileWithSignedUrl(filePath, uploadConfig)
    }

    const endpointUrl = this.buildUrl(uploadConfig.endpoint)

    if (uploadConfig.method === 'json') {
      const body = {
        filePath,
        ...(uploadConfig.extraFields ?? {})
      }

      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...this.buildAuthHeaders()
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
      }

      const payload = (await response.json()) as unknown
      const extracted = getByPath(payload, uploadConfig.responseField, asRecord)
      if (typeof extracted !== 'string' || !extracted.trim()) {
        throw new Error('Upload response did not contain a valid file URL')
      }
      return extracted
    }

    const form = new FormData()
    const fileBuffer = await fs.promises.readFile(filePath)
    const fileName = path.basename(filePath)
    form.append(uploadConfig.fileField || 'file', new Blob([fileBuffer]), fileName)
    for (const [key, value] of Object.entries(uploadConfig.extraFields ?? {})) {
      form.append(key, value)
    }

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
    const extracted = getByPath(payload, uploadConfig.responseField, asRecord)
    if (typeof extracted !== 'string' || !extracted.trim()) {
      throw new Error('Upload response did not contain a valid file URL')
    }

    return extracted
  }

  private shouldUseSignedUrlUpload(uploadConfig: ProviderConfig['upload']): boolean {
    return (
      uploadConfig?.method === 'signed-url-put' ||
      uploadConfig?.endpoint?.includes('/storage/upload/initiate') === true
    )
  }

  private getUsableUploadConfig(): NonNullable<ProviderConfig['upload']> | null {
    const uploadConfig = this.config.upload
    if (!uploadConfig?.endpoint || !uploadConfig.method || !uploadConfig.responseField) {
      return null
    }
    return uploadConfig
  }

  private async uploadFileWithSignedUrl(
    filePath: string,
    uploadConfig: NonNullable<ProviderConfig['upload']>
  ): Promise<string> {
    const fileBuffer = await fs.promises.readFile(filePath)
    const fileName = path.basename(filePath)
    const contentType = inferMimeType(filePath)
    const endpointUrl = this.resolveSignedUploadInitiateUrl(uploadConfig.endpoint)

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders()
      },
      body: JSON.stringify({
        content_type: contentType,
        file_name: fileName,
        ...(uploadConfig.extraFields ?? {})
      })
    })

    if (!response.ok) {
      const responseBody = await response.text()
      this.logError('upload:initiate-http-error', {
        providerId: this.config.providerId,
        endpoint: endpointUrl,
        status: response.status,
        statusText: response.statusText,
        responseBody: this.truncate(responseBody, MAX_LOG_BODY_CHARS)
      })
      throw new Error(
        `Upload failed: ${response.status} ${response.statusText} ${responseBody}`.trim()
      )
    }

    const payload = (await response.json()) as unknown
    const uploadUrlField = uploadConfig.uploadUrlField ?? 'upload_url'
    const uploadUrl = getByPath(payload, uploadUrlField, asRecord)
    const fileUrl = getByPath(payload, uploadConfig.responseField, asRecord)

    if (typeof uploadUrl !== 'string' || !uploadUrl.trim()) {
      throw new Error('Upload response did not contain a valid signed upload URL')
    }

    if (typeof fileUrl !== 'string' || !fileUrl.trim()) {
      throw new Error('Upload response did not contain a valid file URL')
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      body: new Blob([fileBuffer], { type: contentType })
    })

    if (!uploadResponse.ok) {
      const responseBody = await uploadResponse.text()
      this.logError('upload:put-http-error', {
        providerId: this.config.providerId,
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        responseBody: this.truncate(responseBody, MAX_LOG_BODY_CHARS)
      })
      throw new Error(
        `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText} ${responseBody}`.trim()
      )
    }

    return fileUrl
  }

  private resolveSignedUploadInitiateUrl(endpoint: string): string {
    const url = new URL(this.buildUrl(endpoint))

    if (this.config.providerId === 'fal' && url.pathname.endsWith('/storage/upload/initiate')) {
      url.protocol = 'https:'
      url.host = 'rest.fal.ai'
      if (!url.searchParams.has('storage_type')) {
        url.searchParams.set('storage_type', 'fal-cdn-v3')
      }
    }

    return url.toString()
  }

  async generate(
    model: ProviderModel,
    params: Record<string, unknown>,
    filePaths?: string[]
  ): Promise<RemoteGenerationResult> {
    this.logInfo('generate:start', {
      providerId: this.config.providerId,
      modelId: model.modelId,
      endpointTemplate: this.config.request?.endpointTemplate,
      hasUploadConfig: !!this.getUsableUploadConfig(),
      hasAsyncConfig: !!this.config.async?.enabled,
      paramSummary: this.summarizeParams(params),
      refImageCount: Array.isArray(filePaths) ? filePaths.length : 0
    })

    const preparedParams = { ...params }
    delete preparedParams.ref_image_ids
    delete preparedParams.ref_image_paths

    if (Array.isArray(filePaths) && filePaths.length > 0) {
      const uploadConfig = this.getUsableUploadConfig()
      const imageUrls = uploadConfig
        ? await Promise.all(filePaths.map((filePath) => this.uploadFile(filePath, uploadConfig)))
        : await Promise.all(filePaths.map((filePath) => this.fileToDataUrl(filePath)))
      const imageFields = this.detectImageFields(model.requestSchema)

      if (imageFields.length > 0) {
        for (const { name, isArray } of imageFields) {
          preparedParams[name] = this.resolvePreparedImageValue(name, isArray, imageUrls)
        }
      } else {
        preparedParams.image_urls = imageUrls
        if (imageUrls.length === 1) {
          preparedParams.image_url = imageUrls[0]
        }
      }

      this.logInfo('generate:uploads-prepared', {
        uploadedUrlCount: imageUrls.length,
        uploadedUrls: imageUrls.map((value) => `${this.truncate(value, 80)} (len=${value.length})`),
        targetFields: imageFields.map((field) => field.name)
      })
    }

    const requestEndpointTemplate = this.config.request?.endpointTemplate
    if (!requestEndpointTemplate) {
      throw new Error(`Provider ${this.config.providerId} is missing request.endpointTemplate`)
    }

    const endpoint = this.buildUrl(requestEndpointTemplate.replace('{model_id}', model.modelId))
    const requestPayload = this.buildRequestPayload(model, preparedParams)

    this.logInfo('generate:request', {
      endpoint,
      providerId: this.config.providerId,
      modelId: model.modelId,
      payloadSummary: this.summarizeParams(requestPayload)
    })

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders()
      },
      body: JSON.stringify(requestPayload)
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
        payloadSummary: this.summarizeParams(requestPayload)
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
      const requestId = getByPath(payload, this.config.async.requestIdPath, asRecord)
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
        outputs: normalizeOutputs(pollResult, asRecord, getString)
      }
    }

    const outputs = normalizeOutputs(
      getByPath(payload, this.config.async?.outputsPath || 'outputs', asRecord) ?? payload,
      asRecord,
      getString
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
      const statusValue = getByPath(payload, asyncConfig.statusPath, asRecord)
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
        const rawOutputs = getByPath(payload, asyncConfig.outputsPath, asRecord) ?? payload
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
          ? getByPath(payload, asyncConfig.errorPath, asRecord)
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
      ? getByPath(submitPayload, asyncConfig.pollUrlPath, asRecord)
      : undefined
    const fallbackPollUrl = getByPath(submitPayload, 'status_url', asRecord)
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
    if (typeof value !== 'string') {
      return value
    }

    if (!/^https?:\/\//i.test(value)) {
      try {
        return JSON.parse(value) as unknown
      } catch {
        return value
      }
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
        if (this.isPrivateQueueResultUrl(value)) {
          throw new Error(
            `Failed to fetch provider result: ${response.status} ${response.statusText} ${responseBody}`.trim()
          )
        }
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

      if (contentType.startsWith('text/') || contentType.includes('json') || contentType === '') {
        const responseBody = await response.text()
        const parsed = parseJsonIfPossible(responseBody)
        const resolvedValue = parsed ?? responseBody.trim()
        this.logInfo('poll:outputs-fetched-text', {
          providerId: this.config.providerId,
          url: value,
          contentType,
          payloadPreview: this.previewUnknown(resolvedValue)
        })
        return resolvedValue || value
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
      if (this.isPrivateQueueResultUrl(value)) {
        throw error
      }
      return value
    }
  }

  private isPrivateQueueResultUrl(value: string): boolean {
    if (this.config.providerId !== 'fal') return false

    try {
      const url = new URL(value)
      return url.hostname === 'queue.fal.run' && /\/requests\/[^/]+$/.test(url.pathname)
    } catch {
      return false
    }
  }

  private detectImageFields(
    schema: CanonicalRequestSchema
  ): Array<{ name: string; isArray: boolean }> {
    const result: Array<{ name: string; isArray: boolean }> = []
    if (!schema?.properties) return result

    for (const [key, prop] of Object.entries(schema.properties)) {
      if (!IMAGE_INPUT_FIELD_NAMES.has(key.toLowerCase())) continue
      result.push({ name: key, isArray: prop.type === 'array' })
    }

    return result
  }

  private resolvePreparedImageValue(
    fieldName: string,
    isArray: boolean,
    imageUrls: string[]
  ): string | string[] {
    if (isArray) return imageUrls
    if (fieldName === 'last_frame_url') {
      return imageUrls[imageUrls.length - 1] ?? imageUrls[0]
    }
    return imageUrls[0]
  }

  private buildRequestPayload(
    model: ProviderModel,
    params: Record<string, unknown>
  ): Record<string, unknown> {
    const requestConfig = this.config.request
    const payloadStyle = requestConfig?.payloadStyle
    if (!requestConfig || (payloadStyle !== 'nested-input' && payloadStyle !== 'input-only')) {
      return params
    }

    const modelField = requestConfig.modelField ?? 'model'
    const inputField = requestConfig.inputField ?? 'input'
    const { [modelField]: configuredModel, callBackUrl, ...inputParams } = params
    const allowedInputKeys = new Set(Object.keys(model.requestSchema.properties ?? {}))
    const filteredInputParams =
      allowedInputKeys.size > 0
        ? Object.fromEntries(
            Object.entries(inputParams).filter(([key]) => allowedInputKeys.has(key))
          )
        : inputParams
    const payload: Record<string, unknown> =
      payloadStyle === 'nested-input'
        ? {
            [modelField]: configuredModel || model.modelId,
            [inputField]: filteredInputParams
          }
        : {
            [inputField]: filteredInputParams
          }

    if (typeof callBackUrl === 'string' && callBackUrl.trim()) {
      payload.callBackUrl = callBackUrl.trim()
    }

    return payload
  }

  private async fileToDataUrl(filePath: string): Promise<string> {
    const fileBuffer = await fs.promises.readFile(filePath)
    const contentType = inferMimeType(filePath)
    return `data:${contentType};base64,${fileBuffer.toString('base64')}`
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

  private resolveDetailEndpoint(detailEndpointTemplate: string, modelId: string): URL {
    if (detailEndpointTemplate.includes('{owner}') && detailEndpointTemplate.includes('{name}')) {
      const [owner, name] = modelId.split('/')
      const endpoint = detailEndpointTemplate
        .replace('{owner}', owner ?? '')
        .replace('{name}', name ?? '')
      return new URL(this.buildUrl(endpoint))
    }

    if (detailEndpointTemplate.includes('{model_id}')) {
      return new URL(this.buildUrl(detailEndpointTemplate.replace('{model_id}', modelId)))
    }

    const url = new URL(this.buildUrl(detailEndpointTemplate))
    if (this.config.search?.detailQueryParam) {
      url.searchParams.set(this.config.search.detailQueryParam, modelId)
    }

    return url
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
    const name = getString(source.name) || getString(source.title) || modelId
    const description = getString(source.description) || undefined
    const rawType = getString(source.type)
    const type = coerceGenerationMode(rawType)
    const capability = inferModeInfo(rawType ?? undefined, modelId, { name, description })

    return {
      modelId,
      name,
      description,
      type,
      modes: capability.modes,
      outputType: capability.outputType,
      runCount: asOptionalNumber(source.run_count) ?? undefined,
      raw
    }
  }
}

async function wait(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.avif':
      return 'image/avif'
    case '.mp4':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.webm':
      return 'video/webm'
    default:
      return 'application/octet-stream'
  }
}

function parseJsonIfPossible(value: string): unknown | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}
