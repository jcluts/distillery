import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

const MAX_LOG_BODY_CHARS = 1600

export async function downloadRemoteOutput(url: string, outputDir: string): Promise<string> {
  console.log('[RemoteOutputDownloader] start', { url, outputDir })

  const response = await fetch(url)
  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[RemoteOutputDownloader] http-error', {
      url,
      status: response.status,
      statusText: response.statusText,
      responseBody:
        errorBody.length <= MAX_LOG_BODY_CHARS
          ? errorBody
          : `${errorBody.slice(0, MAX_LOG_BODY_CHARS)}…`
    })
    throw new Error(`Failed to download output: ${response.status} ${response.statusText}`)
  }

  await fs.promises.mkdir(outputDir, { recursive: true })

  const parsedUrl = new URL(url)
  const baseName = path.basename(parsedUrl.pathname)
  const extension = path.extname(baseName).toLowerCase()
  const stem = baseName ? path.basename(baseName, extension) : randomUUID()
  const safeExtension = extension || '.bin'
  const outputPath = path.join(outputDir, `${randomUUID()}-${stem}${safeExtension}`)
  const arrayBuffer = await response.arrayBuffer()
  const content = Buffer.from(arrayBuffer)
  await fs.promises.writeFile(outputPath, content)

  console.log('[RemoteOutputDownloader] complete', {
    url,
    outputPath,
    bytes: content.byteLength
  })

  return outputPath
}
