import { app } from 'electron'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

import { createThumbnail } from './image-derivatives'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov'])

type VideoMetadata = {
  width: number | null
  height: number | null
  duration: number | null
}

interface ProcessResult {
  stdout: string
  stderr: string
}

function normalizeExtension(ext: string): string {
  const lower = ext.toLowerCase()
  return lower.startsWith('.') ? lower : `.${lower}`
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function resolvePackagedBinary(tool: 'ffmpeg' | 'ffprobe'): string | null {
  if (!app.isPackaged) {
    return null
  }

  const executable = process.platform === 'win32' ? `${tool}.exe` : tool
  const candidates =
    tool === 'ffmpeg'
      ? [
          path.join(process.resourcesPath, 'bin', executable),
          path.join(process.resourcesPath, 'bin', 'ffmpeg-static', executable)
        ]
      : [
          path.join(process.resourcesPath, 'bin', executable),
          path.join(
            process.resourcesPath,
            'bin',
            'ffprobe-static',
            'bin',
            process.platform,
            process.arch,
            executable
          )
        ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function resolveBinaryPath(tool: 'ffmpeg' | 'ffprobe'): string {
  const packaged = resolvePackagedBinary(tool)
  if (packaged) {
    return packaged
  }

  if (tool === 'ffmpeg') {
    const staticPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : null
    if (staticPath) {
      return staticPath
    }
  } else {
    const staticPath = (ffprobeStatic as { path?: string }).path
    if (staticPath) {
      return staticPath
    }
  }

  throw new Error(`Unable to resolve ${tool} binary path`)
}

async function runProcess(command: string, args: string[]): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          `Command failed (${code}): ${command} ${args.join(' ')}${
            stderr ? `\n${stderr.trim()}` : ''
          }`
        )
      )
    })
  })
}

export function isVideoExtension(ext: string): boolean {
  return VIDEO_EXTENSIONS.has(normalizeExtension(ext))
}

export async function extractVideoThumbnail(
  sourcePath: string,
  outputDir: string,
  filename: string
): Promise<string | null> {
  const outputPath = path.join(outputDir, `${filename}_thumb.jpg`)
  if (fs.existsSync(outputPath)) {
    return outputPath
  }

  await fs.promises.mkdir(outputDir, { recursive: true })

  const ffmpegPath = resolveBinaryPath('ffmpeg')
  const framePath = path.join(outputDir, `${filename}_frame.jpg`)

  try {
    await runProcess(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      '1',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      framePath
    ])

    return await createThumbnail(framePath, outputDir, filename)
  } catch (error) {
    console.error('[VideoDerivatives] Failed to extract video thumbnail:', error)
    return null
  } finally {
    try {
      await fs.promises.unlink(framePath)
    } catch {
      // Best-effort cleanup only.
    }
  }
}

export async function getVideoMetadata(sourcePath: string): Promise<VideoMetadata> {
  const ffprobePath = resolveBinaryPath('ffprobe')

  const { stdout } = await runProcess(ffprobePath, [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    sourcePath
  ])

  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>
    format?: Record<string, unknown>
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : []
  const videoStream = streams.find((stream) => stream.codec_type === 'video')

  const width = parseNumeric(videoStream?.width ?? null)
  const height = parseNumeric(videoStream?.height ?? null)
  const duration =
    parseNumeric(videoStream?.duration ?? null) ?? parseNumeric(parsed.format?.duration ?? null)

  return {
    width,
    height,
    duration
  }
}
