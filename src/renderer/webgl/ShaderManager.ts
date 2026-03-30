export class ShaderManager {
  private programCache = new Map<string, WebGLProgram>()
  private attribCache = new Map<string, number>()
  private uniformCache = new Map<string, WebGLUniformLocation | null>()
  private uniformTypeCache = new Map<string, number>()

  private compileShader(
    gl: WebGLRenderingContext,
    type: number,
    source: string
  ): WebGLShader {
    const shader = gl.createShader(type)
    if (!shader) {
      throw new Error('Failed to create shader')
    }

    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error'
      gl.deleteShader(shader)
      throw new Error(log)
    }

    return shader
  }

  createProgram(
    gl: WebGLRenderingContext,
    vertexSource: string,
    fragmentSource: string,
    programName: string
  ): WebGLProgram {
    const cached = this.programCache.get(programName)
    if (cached) {
      return cached
    }

    const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    const program = gl.createProgram()

    if (!program) {
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      throw new Error('Failed to create WebGL program')
    }

    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'Unknown program link error'
      gl.deleteProgram(program)
      throw new Error(log)
    }

    this.programCache.set(programName, program)
    return program
  }

  getAttribLocation(gl: WebGLRenderingContext, program: WebGLProgram, name: string): number {
    const key = `${name}:${program}`
    const cached = this.attribCache.get(key)
    if (cached !== undefined) {
      return cached
    }

    const location = gl.getAttribLocation(program, name)
    this.attribCache.set(key, location)
    return location
  }

  private getUniformLocation(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    programName: string,
    name: string
  ): WebGLUniformLocation | null {
    const key = `${programName}:${name}`
    if (this.uniformCache.has(key)) {
      return this.uniformCache.get(key) ?? null
    }

    const location = gl.getUniformLocation(program, name)
    this.uniformCache.set(key, location)
    return location
  }

  private getUniformType(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    programName: string,
    name: string
  ): number | null {
    const key = `${programName}:${name}:type`
    if (this.uniformTypeCache.has(key)) {
      return this.uniformTypeCache.get(key) ?? null
    }

    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let index = 0; index < uniformCount; index += 1) {
      const info = gl.getActiveUniform(program, index)
      if (!info) continue

      const activeName = info.name.replace(/\[0\]$/, '')
      if (activeName === name) {
        this.uniformTypeCache.set(key, info.type)
        return info.type
      }
    }

    this.uniformTypeCache.set(key, -1)
    return null
  }

  private setScalarUniform(
    gl: WebGLRenderingContext,
    location: WebGLUniformLocation,
    uniformType: number | null,
    value: number
  ): void {
    switch (uniformType) {
      case gl.SAMPLER_2D:
      case gl.SAMPLER_CUBE:
      case gl.INT:
      case gl.BOOL:
        gl.uniform1i(location, value)
        return
      default:
        gl.uniform1f(location, value)
    }
  }

  private setVectorUniform(
    gl: WebGLRenderingContext,
    location: WebGLUniformLocation,
    uniformType: number | null,
    value: number[]
  ): void {
    switch (value.length) {
      case 2:
        if (uniformType === gl.INT_VEC2 || uniformType === gl.BOOL_VEC2) {
          gl.uniform2iv(location, value)
        } else {
          gl.uniform2fv(location, value)
        }
        return
      case 3:
        if (uniformType === gl.INT_VEC3 || uniformType === gl.BOOL_VEC3) {
          gl.uniform3iv(location, value)
        } else {
          gl.uniform3fv(location, value)
        }
        return
      case 4:
        if (uniformType === gl.INT_VEC4 || uniformType === gl.BOOL_VEC4) {
          gl.uniform4iv(location, value)
        } else {
          gl.uniform4fv(location, value)
        }
        return
      default:
        throw new Error(`Unsupported uniform vector length: ${value.length}`)
    }
  }

  setUniforms(
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    programName: string,
    uniforms: Record<string, number | number[]>
  ): void {
    for (const [name, value] of Object.entries(uniforms)) {
      const location = this.getUniformLocation(gl, program, programName, name)
      if (!location) continue

      const uniformType = this.getUniformType(gl, program, programName, name)

      if (typeof value === 'number') {
        this.setScalarUniform(gl, location, uniformType, value)
        continue
      }

      this.setVectorUniform(gl, location, uniformType, value)
    }
  }

  clearCache(): void {
    this.programCache.clear()
    this.attribCache.clear()
    this.uniformCache.clear()
    this.uniformTypeCache.clear()
  }

  dispose(gl: WebGLRenderingContext): void {
    for (const program of this.programCache.values()) {
      gl.deleteProgram(program)
    }
    this.clearCache()
  }
}