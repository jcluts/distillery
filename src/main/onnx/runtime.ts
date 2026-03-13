import * as ort from 'onnxruntime-node'

export type OnnxExecutionProviderPreference = 'auto' | 'cpu' | 'dml' | 'cuda' | 'coreml'

export interface OnnxSessionOptions {
  preference?: OnnxExecutionProviderPreference
  deviceId?: number
  graphOptimizationLevel?: 'all' | 'disabled' | 'basic' | 'extended'
  logSeverityLevel?: 0 | 1 | 2 | 3 | 4
}

export type ExecutionProviderConfig =
  | string
  | {
      name: string
      deviceId?: number
    }

function getExecutionProviders(options: OnnxSessionOptions): ExecutionProviderConfig[] {
  const preference = options.preference ?? 'auto'
  const deviceId = options.deviceId ?? 0

  if (preference === 'cpu') {
    return ['cpu']
  }

  const providers: ExecutionProviderConfig[] = []

  if (process.platform === 'win32') {
    if (preference === 'auto' || preference === 'dml') {
      providers.push({ name: 'dml', deviceId })
    } else if (preference === 'cuda') {
      providers.push('cuda')
    }
  } else if (process.platform === 'darwin') {
    if (preference === 'auto' || preference === 'coreml') {
      providers.push('coreml')
    }
  } else if (preference === 'auto' || preference === 'cuda') {
    providers.push('cuda')
  }

  if (!providers.includes('cpu')) {
    providers.push('cpu')
  }

  return providers
}

function formatProvider(provider: ExecutionProviderConfig): string {
  if (typeof provider === 'string') {
    return provider
  }

  return provider.deviceId === undefined
    ? provider.name
    : `${provider.name}:${provider.deviceId}`
}

export async function createOnnxSession(
  modelPath: string,
  options: OnnxSessionOptions = {}
): Promise<ort.InferenceSession> {
  const providers = getExecutionProviders(options)
  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: providers as ort.InferenceSession.SessionOptions['executionProviders'],
    graphOptimizationLevel: options.graphOptimizationLevel ?? 'all',
    logSeverityLevel: options.logSeverityLevel ?? 3
  }

  try {
    const session = await ort.InferenceSession.create(modelPath, sessionOptions)
    console.log(
      `[ONNX] Loaded ${modelPath} with providers: ${providers.map(formatProvider).join(', ')}`
    )
    return session
  } catch (error) {
    const isCpuOnly = providers.length === 1 && providers[0] === 'cpu'
    if (isCpuOnly) {
      throw error
    }

    console.warn(
      `[ONNX] Failed to initialize ${modelPath} with preferred providers; falling back to CPU:`,
      error
    )

    return await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: options.graphOptimizationLevel ?? 'all',
      logSeverityLevel: options.logSeverityLevel ?? 3
    })
  }
}

export async function disposeOnnxSession(session: ort.InferenceSession | null): Promise<void> {
  if (!session) {
    return
  }

  const disposable = session as ort.InferenceSession & { release?: () => Promise<void> | void }
  if (typeof disposable.release === 'function') {
    await disposable.release()
  }
}