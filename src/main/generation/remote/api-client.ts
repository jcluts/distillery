import * as fs from 'fs'
import * as path from 'path'
import type { CanonicalRequestSchema, GenerationMode } from '../../types'
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

interface PublicUploadBridge {
  config: ProviderConfig
  apiKey: string
}

interface ApiClientOptions {
  resolvePublicUpload?: (providerId: string) => PublicUploadBridge | null
}

interface UploadTarget {
  providerConfig: ProviderConfig
  uploadConfig: NonNullable<ProviderConfig['upload']>
  apiKey: string
}

export class ApiClient {
  private config: ProviderConfig
  private apiKey: string
  private options: ApiClientOptions

  constructor(config: ProviderConfig, apiKey: string, options: ApiClientOptions = {}) {
    this.config = config
    this.apiKey = apiKey.trim()
    this.options = options
  }

  private buildAuthHeaders(
    config: ProviderConfig = this.config,
    apiKey: string = this.apiKey
  ): Record<string, string> {
    if (!config.auth) {
      return {}
    }

    const headerName = config.auth.header || 'Authorization'
    const authPrefix = config.auth.prefix ?? (config.auth.type === 'key' ? 'Key' : 'Bearer')
    const token = authPrefix ? `${authPrefix} ${apiKey.trim()}` : apiKey.trim()

    return {
      [headerName]: token
    }
  }

  private buildUrl(endpoint: string, config: ProviderConfig = this.config): string {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint
    }

    const baseUrl = config.baseUrl ?? ''
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

    const endpointUrl = new URL(this.buildUrl(search.endpoint))
    for (const [key, value] of Object.entries(search.extraParams ?? {})) {
      endpointUrl.searchParams.set(key, value)
    }

    const response = await fetch(endpointUrl.toString(), {
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

  private async uploadFile(filePath: string, target: UploadTarget): Promise<string> {
    const { providerConfig, uploadConfig, apiKey } = target
    if (this.shouldUseSignedUrlUpload(uploadConfig)) {
      return this.uploadFileWithSignedUrl(filePath, target)
    }

    const endpointUrl = this.buildUrl(uploadConfig.endpoint, providerConfig)

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
          ...this.buildAuthHeaders(providerConfig, apiKey)
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
        ...this.buildAuthHeaders(providerConfig, apiKey)
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

  private getUsableUploadTarget(): UploadTarget | null {
    const uploadConfig = this.config.upload
    if (this.isUsableUploadConfig(uploadConfig)) {
      return {
        providerConfig: this.config,
        uploadConfig,
        apiKey: this.apiKey
      }
    }

    const publicUploadProviderId = this.config.publicUpload?.providerId
    if (!publicUploadProviderId) {
      return null
    }

    const bridge = this.options.resolvePublicUpload?.(publicUploadProviderId)
    if (!bridge) {
      throw new Error(
        `Provider ${this.config.displayName ?? this.config.providerId} needs a public upload provider for reference images: ${publicUploadProviderId}`
      )
    }

    if (bridge.config.auth && !bridge.apiKey.trim()) {
      throw new Error(
        `Missing API key for public upload provider: ${bridge.config.displayName ?? bridge.config.providerId}`
      )
    }

    if (!this.isUsableUploadConfig(bridge.config.upload)) {
      throw new Error(
        `Public upload provider ${bridge.config.displayName ?? bridge.config.providerId} is missing upload configuration`
      )
    }

    return {
      providerConfig: bridge.config,
      uploadConfig: bridge.config.upload,
      apiKey: bridge.apiKey.trim()
    }
  }

  private isUsableUploadConfig(
    uploadConfig: ProviderConfig['upload']
  ): uploadConfig is NonNullable<ProviderConfig['upload']> {
    return !!uploadConfig?.endpoint && !!uploadConfig.method && !!uploadConfig.responseField
  }

  private async uploadFileWithSignedUrl(filePath: string, target: UploadTarget): Promise<string> {
    const { providerConfig, uploadConfig, apiKey } = target
    const fileBuffer = await fs.promises.readFile(filePath)
    const fileName = path.basename(filePath)
    const contentType = inferMimeType(filePath)
    const endpointUrl = this.resolveSignedUploadInitiateUrl(uploadConfig.endpoint, providerConfig)

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.buildAuthHeaders(providerConfig, apiKey)
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
        uploadProviderId: providerConfig.providerId,
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
        uploadProviderId: providerConfig.providerId,
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

  private resolveSignedUploadInitiateUrl(endpoint: string, providerConfig: ProviderConfig): string {
    const url = new URL(this.buildUrl(endpoint, providerConfig))

    if (providerConfig.providerId === 'fal' && url.pathname.endsWith('/storage/upload/initiate')) {
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
    filePaths?: string[],
    mode?: GenerationMode
  ): Promise<RemoteGenerationResult> {
    this.logInfo('generate:start', {
      providerId: this.config.providerId,
      modelId: model.modelId,
      endpointTemplate: this.config.request?.endpointTemplate,
      hasUploadConfig: !!this.config.upload || !!this.config.publicUpload,
      hasAsyncConfig: this.shouldUseAsyncPolling(mode),
      paramSummary: this.summarizeParams(params),
      refImageCount: Array.isArray(filePaths) ? filePaths.length : 0
    })

    const preparedParams = { ...params }
    delete preparedParams.ref_image_ids
    delete preparedParams.ref_image_paths
    this.applySelectedModelParam(preparedParams, model)

    if (Array.isArray(filePaths) && filePaths.length > 0) {
      const preparedFilePaths = this.prepareImageInputPaths(filePaths, model, mode)
      const uploadTarget = this.getUsableUploadTarget()
      const imageUrls = uploadTarget
        ? await Promise.all(
            preparedFilePaths.map((filePath) => this.uploadFile(filePath, uploadTarget))
          )
        : await Promise.all(
            preparedFilePaths.map((filePath) => this.fileToProviderImageValue(filePath, mode))
          )
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
        uploadProviderId: uploadTarget?.providerConfig.providerId ?? this.config.providerId,
        uploadedUrlCount: imageUrls.length,
        uploadedUrls: imageUrls.map((value) => `${this.truncate(value, 80)} (len=${value.length})`),
        targetFields: imageFields.map((field) => field.name)
      })
    }

    const requestEndpointTemplate = this.resolveRequestEndpointTemplate(mode)
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

    const payload = await this.readGenerationResponsePayload(response)
    this.logInfo('generate:accepted', {
      providerId: this.config.providerId,
      modelId: model.modelId,
      payloadPreview: this.previewUnknown(payload)
    })

    const asyncConfig = this.config.async
    if (this.shouldUseAsyncPolling(mode) && asyncConfig) {
      const requestId = getByPath(payload, asyncConfig.requestIdPath, asRecord)
      if (typeof requestId !== 'string' || !requestId.trim()) {
        this.logError('generate:missing-request-id', {
          providerId: this.config.providerId,
          modelId: model.modelId,
          requestIdPath: asyncConfig.requestIdPath,
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

  private resolveRequestEndpointTemplate(mode: GenerationMode | undefined): string | undefined {
    if (mode) {
      const modeEndpoint = this.config.request?.endpointTemplatesByMode?.[mode]
      if (modeEndpoint) return modeEndpoint
    }

    return this.config.request?.endpointTemplate
  }

  private shouldUseAsyncPolling(mode: GenerationMode | undefined): boolean {
    const asyncConfig = this.config.async
    if (!asyncConfig?.enabled) return false
    if (!asyncConfig.modes?.length) return true
    return !!mode && asyncConfig.modes.includes(mode)
  }

  private async readGenerationResponsePayload(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

    if (contentType.includes('application/json')) {
      return (await response.json()) as unknown
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = contentType.split(';')[0]?.trim() || 'application/octet-stream'

    return `data:${mimeType};base64,${buffer.toString('base64')}`
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
    const pollRequest = this.buildPollRequest(requestId, submitPayload, modelId)
    let previousStatus = ''

    this.logInfo('poll:start', {
      providerId: this.config.providerId,
      requestId,
      pollEndpoint: pollRequest.endpoint,
      pollMethod: pollRequest.method,
      pollInterval,
      maxPollTime: asyncConfig.maxPollTime ?? DEFAULT_POLL_TIMEOUT_MS,
      pollBodySummary: pollRequest.bodySummary
    })

    while (Date.now() <= deadline) {
      const response = await fetch(pollRequest.endpoint, pollRequest.init)

      if (!response.ok) {
        const responseBody = await response.text()
        this.logError('poll:http-error', {
          providerId: this.config.providerId,
          requestId,
          pollEndpoint: pollRequest.endpoint,
          pollMethod: pollRequest.method,
          status: response.status,
          statusText: response.statusText,
          responseBody: this.truncate(responseBody, MAX_LOG_BODY_CHARS)
        })
        throw new Error(`Poll request failed: ${response.status} ${response.statusText}`)
      }

      const payload = await this.readGenerationResponsePayload(response)
      if (typeof payload === 'string' && payload.startsWith('data:')) {
        this.logInfo('poll:completed-binary', {
          providerId: this.config.providerId,
          requestId,
          payloadPreview: this.previewUnknown(payload)
        })
        return payload
      }

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
        const rawOutputs =
          getByPath(payload, asyncConfig.outputsPath, asRecord) ??
          getByPath(submitPayload, asyncConfig.outputsPath, asRecord) ??
          payload
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

  private buildPollRequest(
    requestId: string,
    submitPayload: unknown,
    modelId: string
  ): {
    endpoint: string
    method: 'GET' | 'POST'
    init: RequestInit
    bodySummary?: Record<string, unknown>
  } {
    const asyncConfig = this.config.async
    if (!asyncConfig) {
      throw new Error('Async strategy is not configured')
    }

    const method = asyncConfig.pollMethod ?? 'GET'
    const endpoint = this.resolvePollEndpoint(requestId, submitPayload, modelId)
    const headers: Record<string, string> = {
      Accept: 'application/json, video/mp4',
      ...this.buildAuthHeaders()
    }
    const init: RequestInit = {
      method,
      headers
    }
    const pollBody = this.buildPollBody(requestId, modelId)

    if (pollBody && method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(pollBody)
    }

    return {
      endpoint,
      method,
      init,
      bodySummary: pollBody ? this.summarizeParams(pollBody) : undefined
    }
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

  private buildPollBody(requestId: string, modelId: string): Record<string, unknown> | undefined {
    const pollBody = this.config.async?.pollBody
    if (!pollBody) return undefined

    const context = {
      requestId,
      modelId,
      model_id: modelId
    }

    return this.interpolateTemplateValue(pollBody, context) as Record<string, unknown>
  }

  private interpolateTemplateValue(value: unknown, context: Record<string, string>): unknown {
    if (typeof value === 'string') {
      return value
        .replace(/\{requestId\}/g, context.requestId)
        .replace(/\{modelId\}/g, context.modelId)
        .replace(/\{model_id\}/g, context.model_id)
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.interpolateTemplateValue(entry, context))
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          this.interpolateTemplateValue(entry, context)
        ])
      )
    }

    return value
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

    if (this.isDirectMediaUrl(value) || this.config.providerId === 'venice') {
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

  private isDirectMediaUrl(value: string): boolean {
    try {
      const url = new URL(value)
      return /\.(avif|gif|jpe?g|m4v|mov|mp4|png|webm|webp)$/i.test(url.pathname)
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

  private prepareImageInputPaths(
    filePaths: string[],
    model: ProviderModel,
    mode: GenerationMode | undefined
  ): string[] {
    if (this.config.providerId !== 'venice' || mode !== 'image-to-image') {
      return filePaths
    }

    const maxImages = this.getMaxImageInputCount(model.requestSchema, 'images') ?? 3
    if (filePaths.length <= maxImages) return filePaths

    this.logInfo('generate:image-inputs-truncated', {
      providerId: this.config.providerId,
      modelId: model.modelId,
      received: filePaths.length,
      maxImages
    })

    return filePaths.slice(0, maxImages)
  }

  private applySelectedModelParam(params: Record<string, unknown>, model: ProviderModel): void {
    const properties = model.requestSchema.properties ?? {}

    if ('modelId' in properties) {
      params.modelId = model.modelId
      delete params.model
      return
    }

    if ('model' in properties) {
      params.model = model.modelId
      delete params.modelId
    }
  }

  private getMaxImageInputCount(
    schema: CanonicalRequestSchema,
    fieldName: string
  ): number | undefined {
    const maxItems = schema.properties?.[fieldName]?.items?.maxItems
    return typeof maxItems === 'number' && Number.isFinite(maxItems) ? maxItems : undefined
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

  private async fileToProviderImageValue(
    filePath: string,
    mode: GenerationMode | undefined
  ): Promise<string> {
    if (this.config.providerId === 'venice' && mode === 'image-to-image') {
      const fileBuffer = await fs.promises.readFile(filePath)
      return fileBuffer.toString('base64')
    }

    return this.fileToDataUrl(filePath)
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
