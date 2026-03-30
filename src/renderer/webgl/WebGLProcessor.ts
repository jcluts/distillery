import type { ImageAdjustments } from '@/types'

import { AdjustmentsRenderer } from './AdjustmentsRenderer'
import { ShaderManager } from './ShaderManager'

export interface TextureInfo {
  texture: WebGLTexture
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

export class WebGLProcessor {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | null = null
  private shaderManager = new ShaderManager()
  private adjustmentsRenderer = new AdjustmentsRenderer()
  private texture: WebGLTexture | null = null
  private textureInfo: TextureInfo | null = null
  private initialized = false
  private lastSource: HTMLImageElement | string | null = null
  private lastAdjustments: ImageAdjustments | null | undefined = null

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.initialized = false
    this.gl = null
    this.texture = null
    this.textureInfo = null
    this.shaderManager.clearCache()
  }

  private readonly handleContextRestored = (): void => {
    try {
      this.initialize()
    } catch {
      return
    }

    if (!this.lastSource) {
      return
    }

    void this.loadImage(this.lastSource)
      .then(() => {
        this.render(this.lastAdjustments)
      })
      .catch(() => {
        // Ignore recovery failures; caller will trigger a fresh render path.
      })
  }

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false)
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false)
  }

  initialize(): void {
    if (this.initialized && this.gl && !this.gl.isContextLost()) {
      return
    }

    const context =
      this.canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
      }) ??
      (this.canvas.getContext('experimental-webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
      }) as WebGLRenderingContext | null)

    if (!context) {
      throw new Error('WebGL is not available in this renderer')
    }

    this.gl = context
    this.adjustmentsRenderer.initialize(context, this.shaderManager)
    this.initialized = true
  }

  private async resolveSource(source: HTMLImageElement | string): Promise<HTMLImageElement> {
    if (typeof source !== 'string') {
      if (!source.complete) {
        await source.decode()
      }
      return source
    }

    const image = new Image()
    image.src = source
    await image.decode()
    return image
  }

  async loadImage(source: HTMLImageElement | string): Promise<TextureInfo> {
    this.initialize()

    if (!this.gl) {
      throw new Error('WebGL context is not initialized')
    }

    const image = await this.resolveSource(source)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height

    if (!width || !height) {
      throw new Error('Image has invalid dimensions for WebGL upload')
    }

    if (!this.texture) {
      this.texture = this.gl.createTexture()
    }

    if (!this.texture) {
      throw new Error('Failed to create WebGL texture')
    }

    this.canvas.width = width
    this.canvas.height = height

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, 0)
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      image
    )
    this.gl.bindTexture(this.gl.TEXTURE_2D, null)

    this.textureInfo = {
      texture: this.texture,
      width,
      height,
      originalWidth: width,
      originalHeight: height
    }
    this.lastSource = source

    return this.textureInfo
  }

  render(adjustments?: ImageAdjustments | null): void {
    if (!this.gl || !this.textureInfo) {
      return
    }

    this.lastAdjustments = adjustments
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.adjustmentsRenderer.render(
      this.gl,
      this.shaderManager,
      this.textureInfo.texture,
      adjustments,
      this.textureInfo.width,
      this.textureInfo.height
    )
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  getTextureDimensions(): {
    width: number
    height: number
    originalWidth: number
    originalHeight: number
  } {
    if (!this.textureInfo) {
      return { width: 0, height: 0, originalWidth: 0, originalHeight: 0 }
    }

    return {
      width: this.textureInfo.width,
      height: this.textureInfo.height,
      originalWidth: this.textureInfo.originalWidth,
      originalHeight: this.textureInfo.originalHeight
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false)

    if (!this.gl) {
      return
    }

    if (this.texture) {
      this.gl.deleteTexture(this.texture)
      this.texture = null
    }

    this.adjustmentsRenderer.dispose(this.gl)
    this.shaderManager.dispose(this.gl)
    this.textureInfo = null
    this.gl = null
    this.initialized = false
  }
}