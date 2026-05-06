#!/usr/bin/env node

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import Database from 'better-sqlite3'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'

const THUMBNAIL_SIZE = 400
const THUMBNAIL_QUALITY = 80
const SUPPORTED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.mp4',
  '.webm',
  '.mov'
])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov'])
const DEFAULT_LIBRARY_ROOT = path.join(os.homedir(), 'Distillery', 'Library')
const DEFAULT_LEGACY_DB = path.join(os.homedir(), 'Import', 'library.db')
const DEFAULT_ADJUSTMENTS = {
  exposure: 0,
  brightness: 1,
  contrast: 1,
  highlights: 0,
  shadows: 0,
  saturation: 1,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  clarity: 0
}

function printHelp() {
  console.log(`Distillery legacy library importer

Copies media from a deprecated simple-ai-client library into the current Distillery library.
The script defaults to dry-run mode. Pass --apply to copy files and write the target DB.

Usage:
  npm run import:legacy -- [options]

Options:
  --apply                         Write changes. Without this, the script only reports a dry run.
  --legacy-db <path>              Legacy library.db path. Defaults to ~/Import/library.db.
  --legacy-root <path>            Directory containing the legacy library folder. Defaults to legacy DB dir.
  --target-db <path>              Distillery distillery.db path. Defaults to the Electron userData DB.
  --target-library <path>         Distillery library root. Defaults to app_settings.library_root.
  --limit <count>                 Import at most N media rows, useful for validation.
  --no-collections                Skip legacy manual collections and collection membership.
  --no-generation-inputs          Skip generation input/reference-image records.
  --help                          Show this message.

Example:
  npm run import:legacy -- --apply --legacy-db ~/Import/library.db --legacy-root ~/Import
`)
}

function parseArgs(argv) {
  const result = { _: [] }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      result._.push(arg)
      continue
    }

    if (arg.startsWith('--no-')) {
      result[arg.slice(5)] = false
      continue
    }

    const key = arg.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      result[key] = next
      index += 1
    } else {
      result[key] = true
    }
  }

  return result
}

function expandHome(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return input
  }
  if (input === '~') {
    return os.homedir()
  }
  if (input.startsWith(`~${path.sep}`) || input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2))
  }
  return input
}

function defaultTargetDbPath() {
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'distillery',
      'data',
      'distillery.db'
    )
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
      'distillery',
      'data',
      'distillery.db'
    )
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
    'distillery',
    'data',
    'distillery.db'
  )
}

function normalizePathForDb(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parsePositiveInt(value) {
  if (value === undefined || value === true || value === false) {
    return null
  }

  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseJson(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readIso(value) {
  const text = cleanString(value)
  if (!text) return null

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function addMilliseconds(iso, ms) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Date(date.getTime() + ms).toISOString()
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function toNullableNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function toNullableInteger(value) {
  const parsed = toNullableNumber(value)
  return parsed === null ? null : Math.round(parsed)
}

function getColumnSet(db, tableName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return new Set(rows.map((row) => row.name))
}

function requireColumns(db, tableName, columns) {
  const columnSet = getColumnSet(db, tableName)
  const missing = columns.filter((column) => !columnSet.has(column))
  if (missing.length > 0) {
    throw new Error(`Target table ${tableName} is missing required columns: ${missing.join(', ')}`)
  }
  return columnSet
}

function readTargetLibraryRoot(db, explicitPath) {
  if (explicitPath) {
    return path.resolve(expandHome(explicitPath))
  }

  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'library_root'").get()
  const parsed = parseJson(row?.value)
  if (typeof parsed === 'string' && parsed.trim()) {
    return path.resolve(expandHome(parsed))
  }

  return DEFAULT_LIBRARY_ROOT
}

function getDateSubdir(iso) {
  const date = new Date(iso)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const year = String(safeDate.getFullYear())
  const month = String(safeDate.getMonth() + 1).padStart(2, '0')
  return normalizePathForDb(path.join('originals', year, month))
}

function resolveLegacyPath(legacyPath, config) {
  const text = cleanString(legacyPath)
  if (!text) return null

  const normalized = text.replace(/\\/g, '/')
  if (path.isAbsolute(normalized)) {
    return path.normalize(normalized)
  }

  const withoutLibraryPrefix = normalized.replace(/^library\//i, '')
  const candidates = normalized.toLowerCase().startsWith('library/')
    ? [
        path.join(config.legacyRoot, normalized),
        path.join(config.legacyLibraryRoot, withoutLibraryPrefix)
      ]
    : [path.join(config.legacyLibraryRoot, normalized), path.join(config.legacyRoot, normalized)]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

function isVideoExtension(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function isSupportedMediaPath(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

async function createImageThumbnail(sourcePath, outputDir, filename) {
  await fs.promises.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `${filename}_thumb.jpg`)
  if (fs.existsSync(outputPath)) {
    return outputPath
  }

  await sharp(sourcePath)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
      fit: 'cover',
      position: 'centre'
    })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(outputPath)

  return outputPath
}

function resolveBinaryPath(tool) {
  if (tool === 'ffmpeg' && typeof ffmpegStatic === 'string') {
    return ffmpegStatic
  }

  if (tool === 'ffprobe') {
    const maybePath = ffprobeStatic?.path
    if (typeof maybePath === 'string') {
      return maybePath
    }
  }

  return tool
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

async function getVideoMetadata(sourcePath) {
  const { stdout } = await runProcess(resolveBinaryPath('ffprobe'), [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    sourcePath
  ])
  const parsed = JSON.parse(stdout)
  const streams = Array.isArray(parsed.streams) ? parsed.streams : []
  const videoStream = streams.find((stream) => stream.codec_type === 'video')

  return {
    width: toNullableInteger(videoStream?.width),
    height: toNullableInteger(videoStream?.height),
    duration: toNullableNumber(videoStream?.duration) ?? toNullableNumber(parsed.format?.duration)
  }
}

async function extractVideoThumbnail(sourcePath, outputDir, filename) {
  await fs.promises.mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `${filename}_thumb.jpg`)
  if (fs.existsSync(outputPath)) {
    return outputPath
  }

  const framePath = path.join(outputDir, `${filename}_frame.jpg`)
  try {
    await runProcess(resolveBinaryPath('ffmpeg'), [
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
    return await createImageThumbnail(framePath, outputDir, filename)
  } finally {
    await fs.promises.unlink(framePath).catch(() => {})
  }
}

async function readMediaMetadata(sourceAbsPath, legacyRow, mediaType) {
  let width = toNullableInteger(legacyRow.width)
  let height = toNullableInteger(legacyRow.height)
  let duration = null

  if (mediaType === 'video') {
    try {
      const video = await getVideoMetadata(sourceAbsPath)
      width = width ?? video.width
      height = height ?? video.height
      duration = video.duration
    } catch (error) {
      console.warn(
        `[legacy-import] Unable to read video metadata for ${sourceAbsPath}: ${error.message}`
      )
    }
  } else if (width === null || height === null) {
    const metadata = await sharp(sourceAbsPath).metadata()
    width = width ?? metadata.width ?? null
    height = height ?? metadata.height ?? null
  }

  return { width, height, duration }
}

function parseKeywords(value) {
  const text = cleanString(value)
  if (!text) return []

  const parsed = parseJson(text)
  const rawKeywords = Array.isArray(parsed) ? parsed : text.split(',')

  return [
    ...new Set(rawKeywords.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean))
  ]
}

function mapStatus(flag) {
  const normalized = cleanString(flag)?.toLowerCase()
  if (!normalized) return null
  if (['select', 'selected', 'pick', 'picked'].includes(normalized)) return 'selected'
  if (['reject', 'rejected'].includes(normalized)) return 'rejected'
  return null
}

function hasGenerationMetadata(row) {
  return !!(
    cleanString(row.generationId) ||
    cleanString(row.prompt) ||
    cleanString(row.model) ||
    cleanString(row.provider)
  )
}

function generationIdForMedia(row) {
  const legacyGenerationId = cleanString(row.generationId)
  if (legacyGenerationId) return legacyGenerationId
  if (hasGenerationMetadata(row)) return `legacy-media-${row.id || uuidv4()}`
  return null
}

function mapGenerationStatus(legacyStatus) {
  const status = cleanString(legacyStatus)?.toLowerCase()
  if (status === 'error' || status === 'failed') return 'failed'
  return 'completed'
}

function allocateGenerationNumber(preferred, context) {
  if (
    Number.isInteger(preferred) &&
    preferred > 0 &&
    !context.usedGenerationNumbers.has(preferred)
  ) {
    context.usedGenerationNumbers.add(preferred)
    return preferred
  }

  while (context.usedGenerationNumbers.has(context.nextGenerationNumber)) {
    context.nextGenerationNumber += 1
  }

  const next = context.nextGenerationNumber
  context.usedGenerationNumbers.add(next)
  context.nextGenerationNumber += 1
  return next
}

function parseResolution(value) {
  const text = cleanString(value)
  if (!text) return { width: null, height: null }

  const match = text.match(/(\d{2,5})\s*[x*×]\s*(\d{2,5})/i)
  if (!match) return { width: null, height: null }

  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10)
  }
}

function buildGenerationRecord(row, generationId, importedMedia, context) {
  const legacyGeneration = context.legacyGenerations.get(cleanString(row.generationId)) ?? null
  const inputParams = parseJson(legacyGeneration?.inputParams)
  const resolution = parseResolution(inputParams?.resolution ?? inputParams?.size)
  const createdAt =
    readIso(legacyGeneration?.timestamp) ??
    readIso(row.birthtime) ??
    readIso(row.mtime) ??
    new Date().toISOString()
  const durationMs = toNullableNumber(legacyGeneration?.duration)
    ? Math.round(toNullableNumber(legacyGeneration.duration) * 1000)
    : null
  const status = mapGenerationStatus(legacyGeneration?.status)
  const preferredNumber = toNullableInteger(inputParams?.number)

  return {
    id: generationId,
    number: allocateGenerationNumber(preferredNumber, context),
    model_identity_id: null,
    provider: cleanString(legacyGeneration?.provider) ?? cleanString(row.provider) ?? 'legacy',
    model_file: cleanString(legacyGeneration?.model) ?? cleanString(row.model),
    prompt: cleanString(legacyGeneration?.prompt) ?? cleanString(row.prompt),
    width: resolution.width ?? importedMedia.width,
    height: resolution.height ?? importedMedia.height,
    seed: toNullableInteger(inputParams?.seed),
    steps: toNullableInteger(inputParams?.steps),
    guidance: toNullableNumber(inputParams?.guidance ?? inputParams?.cfgScale),
    sampling_method: cleanString(inputParams?.sampling_method ?? inputParams?.sampler),
    params_json: legacyGeneration?.inputParams ?? null,
    status,
    error:
      status === 'failed'
        ? (cleanString(legacyGeneration?.error) ?? 'Legacy generation failed')
        : null,
    total_time_ms: durationMs,
    prompt_cache_hit: 0,
    ref_latent_cache_hit: 0,
    output_paths: JSON.stringify([importedMedia.file_path]),
    created_at: createdAt,
    started_at: createdAt,
    completed_at: status === 'completed' ? addMilliseconds(createdAt, durationMs ?? 0) : null
  }
}

function appendGenerationOutputPath(targetDb, generationId, relPath) {
  const row = targetDb
    .prepare('SELECT output_paths FROM generations WHERE id = ?')
    .get(generationId)
  if (!row) return false

  const parsed = parseJson(row.output_paths)
  const outputPaths = Array.isArray(parsed)
    ? parsed.filter((entry) => typeof entry === 'string')
    : []
  if (!outputPaths.includes(relPath)) {
    outputPaths.push(relPath)
    targetDb
      .prepare('UPDATE generations SET output_paths = ? WHERE id = ?')
      .run(JSON.stringify(outputPaths), generationId)
    return true
  }

  return false
}

function upsertGenerationForMedia(targetDb, row, importedMedia, context) {
  const generationId = generationIdForMedia(row)
  if (!generationId) return null

  const existing = targetDb.prepare('SELECT id FROM generations WHERE id = ?').get(generationId)
  if (existing) {
    if (appendGenerationOutputPath(targetDb, generationId, importedMedia.file_path)) {
      context.stats.generationOutputLinks += 1
    }
    return generationId
  }

  const generation = buildGenerationRecord(row, generationId, importedMedia, context)
  targetDb
    .prepare(
      `INSERT INTO generations (
        id, number, model_identity_id, provider, model_file, prompt,
        width, height, seed, steps, guidance, sampling_method,
        params_json, status, error, total_time_ms,
        prompt_cache_hit, ref_latent_cache_hit, output_paths,
        created_at, started_at, completed_at
      ) VALUES (
        @id, @number, @model_identity_id, @provider, @model_file, @prompt,
        @width, @height, @seed, @steps, @guidance, @sampling_method,
        @params_json, @status, @error, @total_time_ms,
        @prompt_cache_hit, @ref_latent_cache_hit, @output_paths,
        @created_at, @started_at, @completed_at
      )`
    )
    .run(generation)
  context.stats.generationsImported += 1
  context.stats.generationOutputLinks += 1
  return generationId
}

function normalizeCrop(crop, width, height) {
  if (!isPlainObject(crop) || !width || !height) return null

  const left = toNullableNumber(crop.left ?? crop.x)
  const top = toNullableNumber(crop.top ?? crop.y)
  const cropWidth = toNullableNumber(crop.width ?? crop.w)
  const cropHeight = toNullableNumber(crop.height ?? crop.h)
  if (left === null || top === null || cropWidth === null || cropHeight === null) return null

  const x = clampNumber(left / width, 0, 1)
  const y = clampNumber(top / height, 0, 1)
  const w = clampNumber(cropWidth / width, 0, 1 - x)
  const h = clampNumber(cropHeight / height, 0, 1 - y)
  if (w <= 0 || h <= 0) return null

  if (x <= 0.0001 && y <= 0.0001 && w >= 0.9999 && h >= 0.9999) {
    return null
  }

  return { x, y, w, h }
}

function normalizeImageEdits(rawEdits, width, height) {
  const parsed = parseJson(rawEdits)
  if (!isPlainObject(parsed)) {
    return { transformsJson: null, adjustmentsJson: null }
  }

  const crop = normalizeCrop(parsed.crop, width, height)
  const flip = isPlainObject(parsed.flip) ? parsed.flip : {}
  const transforms = {
    rotation: 0,
    flip_h: flip.horizontal === true,
    flip_v: flip.vertical === true,
    crop,
    aspect_ratio: crop ? cleanString(parsed.aspectRatio) : null
  }
  const hasTransforms = transforms.flip_h || transforms.flip_v || !!transforms.crop

  const adjustments = { ...DEFAULT_ADJUSTMENTS }
  if (isPlainObject(parsed.adjustments)) {
    for (const key of Object.keys(DEFAULT_ADJUSTMENTS)) {
      const value = toNullableNumber(parsed.adjustments[key])
      if (value !== null) {
        adjustments[key] = value
      }
    }
  }

  const hasAdjustments = Object.entries(DEFAULT_ADJUSTMENTS).some(
    ([key, defaultValue]) => adjustments[key] !== defaultValue
  )

  return {
    transformsJson: hasTransforms ? JSON.stringify(transforms) : null,
    adjustmentsJson: hasAdjustments ? JSON.stringify(adjustments) : null
  }
}

function normalizeVideoEdits(rawVideoEdits) {
  const parsed = parseJson(rawVideoEdits)
  if (!isPlainObject(parsed) || parsed.version !== 1) return null

  const videoEdits = { version: 1 }
  if (isPlainObject(parsed.trim)) {
    const startTime = toNullableNumber(parsed.trim.startTime)
    const endTime = toNullableNumber(parsed.trim.endTime)
    if (startTime !== null && endTime !== null && endTime > startTime) {
      videoEdits.trim = { startTime, endTime }
    }
  }
  if (cleanString(parsed.timestamp)) {
    videoEdits.timestamp = cleanString(parsed.timestamp)
  }

  return videoEdits.trim || videoEdits.timestamp ? JSON.stringify(videoEdits) : null
}

function insertKeywords(targetDb, mediaId, keywords, stats) {
  if (keywords.length === 0) return

  const insertKeyword = targetDb.prepare('INSERT OR IGNORE INTO keywords (keyword) VALUES (?)')
  const getKeywordId = targetDb.prepare('SELECT id FROM keywords WHERE keyword = ?')
  const insertMediaKeyword = targetDb.prepare(
    'INSERT OR IGNORE INTO media_keywords (media_id, keyword_id) VALUES (?, ?)'
  )

  for (const keyword of keywords) {
    insertKeyword.run(keyword)
    const row = getKeywordId.get(keyword)
    if (!row) continue
    const result = insertMediaKeyword.run(mediaId, row.id)
    if (result.changes > 0) {
      stats.keywordLinksImported += 1
    }
  }
}

function insertMedia(targetDb, media, metadata, columnSet) {
  const columns = [
    'id',
    'file_path',
    'thumb_path',
    'file_name',
    'media_type',
    'origin',
    'width',
    'height',
    'duration',
    'file_size',
    'rating',
    'status',
    'generation_id',
    'origin_id',
    'created_at',
    'updated_at'
  ].filter((column) => columnSet.has(column))

  if (columnSet.has('active_upscale_id')) columns.push('active_upscale_id')
  if (metadata.transformsJson && columnSet.has('transforms_json')) columns.push('transforms_json')
  if (metadata.adjustmentsJson && columnSet.has('adjustments_json'))
    columns.push('adjustments_json')
  if (metadata.videoEditsJson && columnSet.has('video_edits_json')) columns.push('video_edits_json')

  const values = {
    ...media,
    active_upscale_id: null,
    transforms_json: metadata.transformsJson,
    adjustments_json: metadata.adjustmentsJson,
    video_edits_json: metadata.videoEditsJson
  }
  const placeholders = columns.map((column) => `@${column}`).join(', ')

  targetDb.prepare(`INSERT INTO media (${columns.join(', ')}) VALUES (${placeholders})`).run(values)
}

function getExistingMedia(targetDb, id) {
  return targetDb
    .prepare(
      'SELECT id, file_path, thumb_path, width, height, media_type, generation_id FROM media WHERE id = ?'
    )
    .get(id)
}

async function copyMediaFile(sourceAbsPath, targetAbsPath) {
  await fs.promises.mkdir(path.dirname(targetAbsPath), { recursive: true })
  await fs.promises.copyFile(sourceAbsPath, targetAbsPath)
}

async function createThumbnailForMedia(sourceAbsPath, targetLibraryRoot, mediaId, mediaType) {
  const thumbnailsDir = path.join(targetLibraryRoot, 'thumbnails')
  if (mediaType === 'video') {
    try {
      return await extractVideoThumbnail(sourceAbsPath, thumbnailsDir, mediaId)
    } catch (error) {
      console.warn(
        `[legacy-import] Unable to create video thumbnail for ${sourceAbsPath}: ${error.message}`
      )
      return null
    }
  }

  return await createImageThumbnail(sourceAbsPath, thumbnailsDir, mediaId)
}

async function importMediaRow(row, context) {
  context.stats.mediaScanned += 1

  const sourceAbsPath = resolveLegacyPath(row.path, context.config)
  if (!sourceAbsPath || !fs.existsSync(sourceAbsPath)) {
    context.stats.mediaMissing += 1
    return
  }

  if (!isSupportedMediaPath(sourceAbsPath)) {
    context.stats.mediaUnsupported += 1
    return
  }

  const mediaId = cleanString(row.id) ?? uuidv4()
  const existing = getExistingMedia(context.targetDb, mediaId)
  if (existing) {
    context.importedMediaByLegacyId.set(row.id, existing)
    context.stats.mediaExisting += 1
    return
  }

  const ext = path.extname(sourceAbsPath).toLowerCase() || '.png'
  const legacyType = cleanString(row.type)?.toLowerCase()
  const mediaType = legacyType === 'video' || isVideoExtension(sourceAbsPath) ? 'video' : 'image'
  const createdAt =
    readIso(row.birthtime) ??
    readIso(row.mtime) ??
    readIso(row.lastIndexed) ??
    new Date().toISOString()
  const updatedAt = readIso(row.mtime) ?? createdAt
  const relDir = getDateSubdir(createdAt)
  const relFilePath = normalizePathForDb(path.join(relDir, `${mediaId}${ext}`))
  const targetAbsPath = path.join(context.config.targetLibraryRoot, relFilePath)

  if (fs.existsSync(targetAbsPath)) {
    context.stats.mediaFileCollisions += 1
    return
  }

  if (context.config.dryRun) {
    context.stats.mediaWouldImport += 1
    context.importedMediaByLegacyId.set(row.id, {
      id: mediaId,
      file_path: relFilePath,
      thumb_path: normalizePathForDb(path.join('thumbnails', `${mediaId}_thumb.jpg`)),
      width: toNullableInteger(row.width),
      height: toNullableInteger(row.height),
      media_type: mediaType,
      generation_id: generationIdForMedia(row)
    })
    return
  }

  let thumbAbsPath = null
  try {
    await copyMediaFile(sourceAbsPath, targetAbsPath)
    const stat = await fs.promises.stat(targetAbsPath)
    const { width, height, duration } = await readMediaMetadata(targetAbsPath, row, mediaType)
    thumbAbsPath = await createThumbnailForMedia(
      targetAbsPath,
      context.config.targetLibraryRoot,
      mediaId,
      mediaType
    )
    const thumbRelPath = thumbAbsPath
      ? normalizePathForDb(path.join('thumbnails', `${mediaId}_thumb.jpg`))
      : null
    const imageEdits = mediaType === 'image' ? normalizeImageEdits(row.edits, width, height) : {}
    const videoEditsJson = mediaType === 'video' ? normalizeVideoEdits(row.video_edits) : null
    const importedMedia = {
      id: mediaId,
      file_path: relFilePath,
      thumb_path: thumbRelPath,
      file_name: path.basename(relFilePath),
      media_type: mediaType,
      origin: hasGenerationMetadata(row) ? 'generation' : 'import',
      width,
      height,
      duration,
      file_size: stat.size,
      rating: clampNumber(toNullableInteger(row.rating) ?? 0, 0, 5),
      status: mapStatus(row.flag),
      generation_id: null,
      origin_id: null,
      created_at: createdAt,
      updated_at: updatedAt
    }

    context.targetDb.transaction(() => {
      importedMedia.generation_id = upsertGenerationForMedia(
        context.targetDb,
        row,
        importedMedia,
        context
      )
      insertMedia(
        context.targetDb,
        importedMedia,
        {
          transformsJson: imageEdits.transformsJson ?? null,
          adjustmentsJson: imageEdits.adjustmentsJson ?? null,
          videoEditsJson
        },
        context.mediaColumnSet
      )
      insertKeywords(context.targetDb, mediaId, parseKeywords(row.keywords), context.stats)
    })()

    if (imageEdits.transformsJson) context.stats.imageTransformsImported += 1
    if (imageEdits.adjustmentsJson) context.stats.imageAdjustmentsImported += 1
    if (videoEditsJson) context.stats.videoEditsImported += 1
    if (cleanString(row.remove)) context.stats.removalEditsSkipped += 1
    if (cleanString(row.upscale) || cleanString(row.video_upscale))
      context.stats.upscaleEditsSkipped += 1

    context.importedMediaByLegacyId.set(row.id, importedMedia)
    context.stats.mediaImported += 1
  } catch (error) {
    context.stats.mediaErrored += 1
    context.stats.errors.push(`${sourceAbsPath}: ${error.message}`)
    await fs.promises.unlink(targetAbsPath).catch(() => {})
    if (thumbAbsPath) {
      await fs.promises.unlink(thumbAbsPath).catch(() => {})
    }
  }
}

function loadLegacyGenerations(legacyDb) {
  const rows = legacyDb
    .prepare(
      `SELECT id, timestamp, prompt, model, provider, status, inputParams, outputPaths, error, duration
       FROM generations`
    )
    .all()
  return new Map(rows.map((row) => [row.id, row]))
}

function loadLegacyMediaRows(legacyDb, limit) {
  const sql = `SELECT
      id, path, name, folder, size, mtime, birthtime, rating, model, provider,
      prompt, width, height, type, generationId, lastIndexed, flag, keywords,
      edits, upscale, video_edits, video_upscale, remove, adjustment_brushes, origin_id
    FROM media
    ORDER BY COALESCE(birthtime, mtime, lastIndexed, path) ASC
    ${limit ? 'LIMIT @limit' : ''}`

  return limit ? legacyDb.prepare(sql).all({ limit }) : legacyDb.prepare(sql).all()
}

function loadUsedGenerationNumbers(targetDb) {
  const rows = targetDb.prepare('SELECT number FROM generations').all()
  return new Set(rows.map((row) => row.number).filter((number) => Number.isInteger(number)))
}

function getNextGenerationNumber(targetDb) {
  const row = targetDb.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS next FROM generations').get()
  return row?.next ?? 1
}

async function importCollections(context) {
  if (!context.config.includeCollections) return

  const collectionRows = context.legacyDb
    .prepare(
      `SELECT id, name, sort_order, color, is_smart, created_at, updated_at
       FROM collections
       ORDER BY sort_order ASC, created_at ASC`
    )
    .all()
  const linkRows = context.legacyDb
    .prepare(
      `SELECT collection_id, media_id, added_at, sort_order
       FROM collection_media
       ORDER BY collection_id, sort_order ASC, added_at ASC`
    )
    .all()

  if (context.config.dryRun) {
    context.stats.collectionsWouldImport = collectionRows.filter((row) => row.is_smart !== 1).length
    context.stats.collectionLinksWouldImport = linkRows.filter((row) =>
      context.importedMediaByLegacyId.has(row.media_id)
    ).length
    return
  }

  context.targetDb.transaction(() => {
    const editableCollectionIds = new Set()
    const existingCollection = context.targetDb.prepare('SELECT id FROM collections WHERE id = ?')
    const insertCollection = context.targetDb.prepare(
      `INSERT INTO collections (
        id, name, color, type, system_key, sort_order, filter_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'manual', NULL, ?, NULL, ?, ?)`
    )
    const insertLink = context.targetDb.prepare(
      `INSERT OR IGNORE INTO collection_media (
        collection_id, media_id, sort_order, added_at
      ) VALUES (?, ?, ?, ?)`
    )

    for (const row of collectionRows) {
      if (row.is_smart === 1) {
        context.stats.smartCollectionsSkipped += 1
        continue
      }
      editableCollectionIds.add(row.id)
      if (existingCollection.get(row.id)) {
        context.stats.collectionsExisting += 1
        continue
      }
      insertCollection.run(
        row.id,
        cleanString(row.name) ?? 'Untitled Collection',
        cleanString(row.color) ?? 'var(--foreground)',
        toNullableInteger(row.sort_order) ?? 0,
        readIso(row.created_at) ?? new Date().toISOString(),
        readIso(row.updated_at) ?? readIso(row.created_at) ?? new Date().toISOString()
      )
      context.stats.collectionsImported += 1
    }

    for (const row of linkRows) {
      if (!editableCollectionIds.has(row.collection_id)) continue
      if (!context.importedMediaByLegacyId.has(row.media_id)) continue
      const result = insertLink.run(
        row.collection_id,
        row.media_id,
        toNullableInteger(row.sort_order) ?? 0,
        readIso(row.added_at) ?? new Date().toISOString()
      )
      if (result.changes > 0) {
        context.stats.collectionLinksImported += 1
      }
    }
  })()
}

async function createGenerationInputThumbnail(context, inputRow, importedMedia, sourceAbsPath) {
  const refThumbRelPath = normalizePathForDb(
    path.join(
      'ref_thumbs',
      inputRow.generation_id,
      `${toNullableInteger(inputRow.position) ?? 0}.jpg`
    )
  )
  const refThumbAbsPath = path.join(context.config.targetLibraryRoot, refThumbRelPath)

  if (fs.existsSync(refThumbAbsPath)) {
    return refThumbRelPath
  }

  await fs.promises.mkdir(path.dirname(refThumbAbsPath), { recursive: true })

  if (importedMedia?.thumb_path) {
    const mediaThumbAbs = path.join(context.config.targetLibraryRoot, importedMedia.thumb_path)
    if (fs.existsSync(mediaThumbAbs)) {
      await fs.promises.copyFile(mediaThumbAbs, refThumbAbsPath)
      return refThumbRelPath
    }
  }

  if (!sourceAbsPath || !fs.existsSync(sourceAbsPath)) {
    return null
  }

  if (isVideoExtension(sourceAbsPath)) {
    const created = await extractVideoThumbnail(
      sourceAbsPath,
      path.dirname(refThumbAbsPath),
      path.basename(refThumbAbsPath, '.jpg')
    )
    return created ? refThumbRelPath : null
  }

  const created = await createImageThumbnail(
    sourceAbsPath,
    path.dirname(refThumbAbsPath),
    path.basename(refThumbAbsPath, '.jpg')
  )
  if (created !== refThumbAbsPath) {
    await fs.promises.rename(created, refThumbAbsPath).catch(async () => {
      await fs.promises.copyFile(created, refThumbAbsPath)
      await fs.promises.unlink(created).catch(() => {})
    })
  }
  return refThumbRelPath
}

async function importGenerationInputs(context) {
  if (!context.config.includeGenerationInputs) return

  const generationIds = new Set(
    [...context.importedMediaByLegacyId.values()]
      .map((media) => media.generation_id)
      .filter((generationId) => typeof generationId === 'string' && generationId.length > 0)
  )

  if (generationIds.size === 0) return

  const inputRows = context.legacyDb
    .prepare(
      `SELECT id, generation_id, media_id, position, source_type, original_path, original_filename, created_at
       FROM generation_inputs
       ORDER BY generation_id, position ASC`
    )
    .all()
    .filter((row) => generationIds.has(row.generation_id))

  if (context.config.dryRun) {
    context.stats.generationInputsWouldImport = inputRows.length
    return
  }

  const existingInput = context.targetDb.prepare('SELECT id FROM generation_inputs WHERE id = ?')
  const insertInput = context.targetDb.prepare(
    `INSERT INTO generation_inputs (
      id, generation_id, media_id, position, source_type,
      original_path, original_filename, thumb_path, ref_cache_path, created_at
    ) VALUES (
      @id, @generation_id, @media_id, @position, @source_type,
      @original_path, @original_filename, @thumb_path, @ref_cache_path, @created_at
    )`
  )

  for (const row of inputRows) {
    if (existingInput.get(row.id)) {
      context.stats.generationInputsExisting += 1
      continue
    }

    const importedMedia = cleanString(row.media_id)
      ? context.importedMediaByLegacyId.get(row.media_id)
      : null
    const sourceAbsPath = importedMedia
      ? path.join(context.config.targetLibraryRoot, importedMedia.file_path)
      : resolveLegacyPath(row.original_path, context.config)
    const thumbPath = await createGenerationInputThumbnail(
      context,
      row,
      importedMedia,
      sourceAbsPath
    )
    if (!thumbPath) {
      context.stats.generationInputsSkipped += 1
      continue
    }

    const input = {
      id: cleanString(row.id) ?? uuidv4(),
      generation_id: row.generation_id,
      media_id: importedMedia ? importedMedia.id : null,
      position: toNullableInteger(row.position) ?? 0,
      source_type: importedMedia ? 'library' : 'external',
      original_path: importedMedia ? importedMedia.file_path : sourceAbsPath,
      original_filename:
        cleanString(row.original_filename) ?? (sourceAbsPath ? path.basename(sourceAbsPath) : null),
      thumb_path: thumbPath,
      ref_cache_path: null,
      created_at: readIso(row.created_at) ?? new Date().toISOString()
    }

    insertInput.run(input)
    context.stats.generationInputsImported += 1
  }
}

function createStats() {
  return {
    mediaScanned: 0,
    mediaWouldImport: 0,
    mediaImported: 0,
    mediaExisting: 0,
    mediaMissing: 0,
    mediaUnsupported: 0,
    mediaFileCollisions: 0,
    mediaErrored: 0,
    generationsImported: 0,
    generationOutputLinks: 0,
    generationInputsWouldImport: 0,
    generationInputsImported: 0,
    generationInputsExisting: 0,
    generationInputsSkipped: 0,
    keywordLinksImported: 0,
    imageTransformsImported: 0,
    imageAdjustmentsImported: 0,
    videoEditsImported: 0,
    collectionsWouldImport: 0,
    collectionsImported: 0,
    collectionsExisting: 0,
    collectionLinksWouldImport: 0,
    collectionLinksImported: 0,
    smartCollectionsSkipped: 0,
    removalEditsSkipped: 0,
    upscaleEditsSkipped: 0,
    errors: []
  }
}

function printSummary(config, stats) {
  console.log('\nLegacy import summary')
  console.log(`Mode: ${config.dryRun ? 'dry run' : 'apply'}`)
  console.log(`Legacy DB: ${config.legacyDb}`)
  console.log(`Target DB: ${config.targetDb}`)
  console.log(`Target library: ${config.targetLibraryRoot}`)
  console.log(`Media scanned: ${stats.mediaScanned}`)

  if (config.dryRun) {
    console.log(`Media that would import: ${stats.mediaWouldImport}`)
    console.log(`Collections that would import: ${stats.collectionsWouldImport}`)
    console.log(`Collection links that would import: ${stats.collectionLinksWouldImport}`)
    console.log(`Generation inputs that would import: ${stats.generationInputsWouldImport}`)
  } else {
    console.log(`Media imported: ${stats.mediaImported}`)
    console.log(`Generations imported: ${stats.generationsImported}`)
    console.log(`Generation output links: ${stats.generationOutputLinks}`)
    console.log(`Generation inputs imported: ${stats.generationInputsImported}`)
    console.log(`Keyword links imported: ${stats.keywordLinksImported}`)
    console.log(`Image transforms imported: ${stats.imageTransformsImported}`)
    console.log(`Image adjustments imported: ${stats.imageAdjustmentsImported}`)
    console.log(`Video edits imported: ${stats.videoEditsImported}`)
    console.log(`Collections imported: ${stats.collectionsImported}`)
    console.log(`Collection links imported: ${stats.collectionLinksImported}`)
  }

  console.log(`Existing media skipped: ${stats.mediaExisting}`)
  console.log(`Missing source files skipped: ${stats.mediaMissing}`)
  console.log(`Unsupported files skipped: ${stats.mediaUnsupported}`)
  console.log(`File collisions skipped: ${stats.mediaFileCollisions}`)
  console.log(`Media errors: ${stats.mediaErrored}`)
  if (!config.dryRun) {
    console.log(`Legacy removal edits not imported: ${stats.removalEditsSkipped}`)
    console.log(`Legacy upscale edits not imported: ${stats.upscaleEditsSkipped}`)
  }

  if (stats.errors.length > 0) {
    console.log('\nFirst errors:')
    for (const error of stats.errors.slice(0, 10)) {
      console.log(`- ${error}`)
    }
  }

  if (config.dryRun) {
    console.log('\nDry run only. Re-run with --apply to import.')
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const legacyDbPath = path.resolve(expandHome(args['legacy-db'] || DEFAULT_LEGACY_DB))
  const targetDbPath = path.resolve(expandHome(args['target-db'] || defaultTargetDbPath()))
  const legacyRoot = path.resolve(expandHome(args['legacy-root'] || path.dirname(legacyDbPath)))
  const legacyLibraryRoot = path.join(legacyRoot, 'library')
  const limit = parsePositiveInt(args.limit)
  const dryRun = args.apply !== true

  if (!fs.existsSync(legacyDbPath)) {
    throw new Error(`Legacy DB does not exist: ${legacyDbPath}`)
  }
  if (!fs.existsSync(targetDbPath)) {
    throw new Error(
      `Target DB does not exist: ${targetDbPath}. Start Distillery once so migrations run.`
    )
  }

  const legacyDb = new Database(legacyDbPath, { readonly: true, fileMustExist: true })
  const targetDb = new Database(targetDbPath, { readonly: dryRun, fileMustExist: true })

  try {
    targetDb.pragma('foreign_keys = ON')
    targetDb.pragma('busy_timeout = 5000')

    const targetLibraryRoot = readTargetLibraryRoot(targetDb, args['target-library'])
    const config = {
      legacyDb: legacyDbPath,
      legacyRoot,
      legacyLibraryRoot,
      targetDb: targetDbPath,
      targetLibraryRoot,
      dryRun,
      includeCollections: args.collections !== false,
      includeGenerationInputs: args['generation-inputs'] !== false
    }

    requireColumns(targetDb, 'media', [
      'id',
      'file_path',
      'thumb_path',
      'file_name',
      'media_type',
      'origin',
      'width',
      'height',
      'file_size',
      'rating',
      'status',
      'generation_id',
      'origin_id',
      'created_at',
      'updated_at'
    ])

    if (!dryRun) {
      await fs.promises.mkdir(targetLibraryRoot, { recursive: true })
      await fs.promises.mkdir(path.join(targetLibraryRoot, 'originals'), { recursive: true })
      await fs.promises.mkdir(path.join(targetLibraryRoot, 'thumbnails'), { recursive: true })
      await fs.promises.mkdir(path.join(targetLibraryRoot, 'ref_thumbs'), { recursive: true })
    }

    const stats = createStats()
    const context = {
      config,
      legacyDb,
      targetDb,
      stats,
      mediaColumnSet: getColumnSet(targetDb, 'media'),
      legacyGenerations: loadLegacyGenerations(legacyDb),
      importedMediaByLegacyId: new Map(),
      usedGenerationNumbers: loadUsedGenerationNumbers(targetDb),
      nextGenerationNumber: getNextGenerationNumber(targetDb)
    }

    const mediaRows = loadLegacyMediaRows(legacyDb, limit)
    console.log(`Scanning ${mediaRows.length} legacy media rows${dryRun ? ' (dry run)' : ''}...`)

    for (const row of mediaRows) {
      await importMediaRow(row, context)
      if (context.stats.mediaScanned % 250 === 0) {
        console.log(`Processed ${context.stats.mediaScanned}/${mediaRows.length} media rows...`)
      }
    }

    await importCollections(context)
    await importGenerationInputs(context)
    printSummary(config, stats)
  } finally {
    legacyDb.close()
    targetDb.close()
  }
}

run().catch((error) => {
  console.error(`Legacy import failed: ${error.message}`)
  process.exitCode = 1
})
