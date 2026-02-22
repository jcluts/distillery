import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// =============================================================================
// File Manager
// Handles media file storage, path resolution, and library root management.
// =============================================================================

export class FileManager {
  private libraryRoot: string

  constructor(libraryRoot: string) {
    this.libraryRoot = libraryRoot
    this.ensureDirectories()
  }

  /**
   * Update the library root directory.
   */
  setLibraryRoot(root: string): void {
    this.libraryRoot = root
    this.ensureDirectories()
  }

  /**
   * Get the library root directory.
   */
  getLibraryRoot(): string {
    return this.libraryRoot
  }

  /**
   * Resolve a relative path to an absolute path within the library.
   */
  resolve(relativePath: string): string {
    return join(this.libraryRoot, relativePath)
  }

  /**
   * Get the originals directory path.
   */
  getOriginalsDir(): string {
    return join(this.libraryRoot, 'originals')
  }

  /**
   * Get the thumbnails directory path.
   */
  getThumbnailsDir(): string {
    return join(this.libraryRoot, 'thumbnails')
  }

  /**
   * Get the reference image cache directory path.
   */
  getRefCacheDir(): string {
    return join(this.libraryRoot, 'ref_cache')
  }

  /**
   * Get the reference thumbnails directory path.
   */
  getRefThumbsDir(): string {
    return join(this.libraryRoot, 'ref_thumbs')
  }

  /**
   * Get the upscaled images directory path.
   */
  getUpscaledDir(): string {
    return join(this.libraryRoot, 'upscaled')
  }

  /**
   * Get the date-based subdirectory for originals (YYYY/MM/).
   */
  getDateSubdir(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return join('originals', String(year), month)
  }

  /**
   * Ensure all required directories exist.
   */
  private ensureDirectories(): void {
    if (!this.libraryRoot) return

    const dirs = [
      this.libraryRoot,
      this.getOriginalsDir(),
      this.getThumbnailsDir(),
      this.getRefCacheDir(),
      this.getRefThumbsDir(),
      this.getUpscaledDir()
    ]

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    }
  }
}
