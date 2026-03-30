import type { ImageAdjustments } from '@/types'

import type { ShaderManager } from './ShaderManager'
import vertexShaderSource from './shaders/vertex.glsl?raw'
import fragmentShaderSource from './shaders/adjustments.glsl?raw'

const PROGRAM_NAME = 'adjustments'

export class AdjustmentsRenderer {
  private program: WebGLProgram | null = null
  private vertexBuffer: WebGLBuffer | null = null
  private texCoordBuffer: WebGLBuffer | null = null
  private initialized = false

  initialize(gl: WebGLRenderingContext, shaderManager: ShaderManager): void {
    if (this.initialized) {
      return
    }

    this.program = shaderManager.createProgram(
      gl,
      vertexShaderSource,
      fragmentShaderSource,
      PROGRAM_NAME
    )

    this.vertexBuffer = gl.createBuffer()
    this.texCoordBuffer = gl.createBuffer()

    if (!this.vertexBuffer || !this.texCoordBuffer) {
      throw new Error('Failed to create WebGL buffers for adjustments renderer')
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW
    )

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW
    )

    this.initialized = true
  }

  private adjustmentsToUniforms(
    adjustments: ImageAdjustments | null | undefined
  ): Record<string, number> {
    if (!adjustments) {
      return {
        u_brightness: 1,
        u_contrast: 1,
        u_saturation: 1,
        u_hue: 0,
        u_temperature: 0,
        u_tint: 0,
        u_exposure: 0,
        u_highlights: 0,
        u_shadows: 0,
        u_vibrance: 0,
        u_clarity: 0
      }
    }

    return {
      u_brightness: adjustments.brightness,
      u_contrast: adjustments.contrast,
      u_saturation: adjustments.saturation,
      u_hue: adjustments.hue * (Math.PI / 180),
      u_temperature: adjustments.temperature / 100,
      u_tint: adjustments.tint / 100,
      u_exposure: adjustments.exposure,
      u_highlights: adjustments.highlights / 100,
      u_shadows: adjustments.shadows / 100,
      u_vibrance: adjustments.vibrance / 100,
      u_clarity: adjustments.clarity / 100
    }
  }

  render(
    gl: WebGLRenderingContext,
    shaderManager: ShaderManager,
    texture: WebGLTexture,
    adjustments: ImageAdjustments | null | undefined,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!this.program || !this.vertexBuffer || !this.texCoordBuffer) {
      return
    }

    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)

    const positionLocation = shaderManager.getAttribLocation(gl, this.program, 'a_position')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const texCoordLocation = shaderManager.getAttribLocation(gl, this.program, 'a_texCoord')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer)
    gl.enableVertexAttribArray(texCoordLocation)
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)

    shaderManager.setUniforms(gl, this.program, PROGRAM_NAME, {
      u_image: 0,
      u_maskTexture: 0,
      u_maskEnabled: 0,
      u_maskOpacity: 1,
      u_flipY: 0,
      ...this.adjustmentsToUniforms(adjustments)
    })

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.disableVertexAttribArray(positionLocation)
    gl.disableVertexAttribArray(texCoordLocation)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  dispose(gl: WebGLRenderingContext): void {
    if (this.vertexBuffer) {
      gl.deleteBuffer(this.vertexBuffer)
      this.vertexBuffer = null
    }

    if (this.texCoordBuffer) {
      gl.deleteBuffer(this.texCoordBuffer)
      this.texCoordBuffer = null
    }

    this.program = null
    this.initialized = false
  }
}