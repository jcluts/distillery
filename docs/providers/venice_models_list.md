> ## Documentation Index
> Fetch the complete documentation index at: https://docs.venice.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# List Models

> Returns a list of available models supported by the Venice.ai API across text, image, audio, video, and related inference types.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-59dfa959-7038-4cd8-b8ba-80cf09f2f026?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


## OpenAPI

````yaml GET /models
openapi: 3.0.0
info:
  description: The Venice.ai API.
  termsOfService: https://venice.ai/legal/tos
  title: Venice.ai API
  version: '20260513.213930'
  x-guidance: >-
    Venice.ai is an OpenAI-compatible inference API supporting text, image,
    audio, and video generation.


    **Authentication options:**

    - API Key: Use Bearer token in Authorization header

    - x402 Wallet: Use USDC credits via Ethereum wallet (no account required)


    **For x402 wallet access:**

    1. POST /x402/top-up without headers to get payment requirements

    2. Sign a USDC payment using the x402 SDK

    3. POST /x402/top-up with X-402-Payment header to add credits

    4. Call any inference endpoint with X-Sign-In-With-X header


    **Pricing:** Prepaid credits consumed per request. Check /models for
    available models and their capabilities.
servers:
  - url: https://api.venice.ai/api/v1
security:
  - BearerAuth: []
tags:
  - description: >-
      Generate speech/audio, transcribe audio, and manage asynchronous audio
      generation jobs.
    name: Audio
  - description: >-
      Given a list of messages comprising a conversation, the model will return
      a response. Supports multimodal inputs including text, images, audio
      (input_audio), and video (video_url) for compatible models.
    name: Chat
  - description: List and describe the various models available in the API.
    name: Models
  - description: Generate and manipulate images using AI models.
    name: Image
  - description: Generate videos using AI models.
    name: Video
  - description: List and retrieve character information for use in completions.
    name: Characters
  - description: >-
      Billing and usage analytics. **Beta**: This API is currently in beta and
      may be unstable. Endpoints, request/response schemas, and behavior may
      change without notice.
    name: Billing
  - description: Proxy JSON-RPC requests to blockchain nodes. Billed per credit.
    name: Crypto RPC
  - description: >-
      Wallet-based API access using the x402 protocol. No API key required —
      authenticate with an Ethereum wallet.


      **How it works:**

      1. **Authenticate** — Send an `X-Sign-In-With-X` header (base64-encoded
      signed SIWE message) with any request. See the `siwx` security scheme for
      the exact format.

      2. **Top up** — `POST /x402/top-up` without a payment header returns
      payment requirements. Sign a USDC transfer on Base using the x402 SDK
      (`npm install x402`) and re-submit with the `X-402-Payment` header.

      3. **Use any endpoint** — All inference endpoints (chat, image, audio,
      video, embeddings) accept `siwx` as an alternative to `BearerAuth`.
      Charges are deducted from your USDC credit balance.

      4. **Monitor balance** — `GET /x402/balance/{walletAddress}` returns your
      current balance. The `X-Balance-Remaining` response header on inference
      calls also reports it.


      **Quick start (5 lines):**

      ```

      import { VeniceClient } from '@venice-ai/x402-client'

      const venice = new VeniceClient(process.env.WALLET_KEY)

      await venice.topUp(10) // $10 USDC on Base

      const res = await venice.chat({ model: 'zai-org-glm-5-1', messages: [{
      role: 'user', content: 'Hello!' }] })

      ```


      **Payment:** USDC on Base (chain ID 8453). Minimum top-up: $5.
      Alternatively, stake DIEM tokens for daily credits (1 DIEM = $1/day).
    name: x402
externalDocs:
  description: Venice.ai API documentation
  url: https://docs.venice.ai
paths:
  /models:
    get:
      tags:
        - Models
      summary: /api/v1/models
      description: >-
        Returns a list of available models supported by the Venice.ai API across
        text, image, audio, video, and related inference types.
      operationId: listModels
      parameters:
        - schema:
            anyOf:
              - type: string
                enum:
                  - asr
                  - embedding
                  - image
                  - music
                  - text
                  - tts
                  - upscale
                  - inpaint
                  - video
              - type: string
                enum:
                  - all
                  - code
            description: Filter models by type. Use "all" to get all model types.
            example: text
          required: false
          name: type
          in: query
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/ModelResponse'
                    description: List of available models
                  object:
                    type: string
                    enum:
                      - list
                  type:
                    anyOf:
                      - type: string
                        enum:
                          - asr
                          - embedding
                          - image
                          - music
                          - text
                          - tts
                          - upscale
                          - inpaint
                          - video
                      - type: string
                        enum:
                          - all
                          - code
                    description: Type of models returned.
                    example: text
                required:
                  - data
                  - object
                  - type
        '500':
          description: An unknown error occurred
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
      security:
        - {}
        - BearerAuth: []
components:
  schemas:
    ModelResponse:
      type: object
      properties:
        context_length:
          type: number
          description: >-
            The context length (maximum input tokens) supported by the model.
            Only present for text models. This is a standard OpenAI-compatible
            field that mirrors model_spec.availableContextTokens for client
            compatibility.
          example: 131072
        created:
          type: number
          description: Release date on Venice API
          example: 1699000000
        id:
          type: string
          description: Model ID
          example: zai-org-glm-5-1
        model_spec:
          type: object
          properties:
            availableContextTokens:
              type: number
              description: >-
                The context length supported by the model. Only applicable for
                text models.
              example: 200000
            maxCompletionTokens:
              type: number
              description: >-
                The maximum number of completion tokens the model can generate.
                Use this to know the upper bound for the max_completion_tokens
                request parameter. Only applicable for text models.
              example: 24000
            beta:
              type: boolean
              description: >-
                Is this model restricted to beta users only? If true, only users
                with beta access can use this model
              example: false
            betaModel:
              type: boolean
              description: Is this model in beta status?
              example: false
            privacy:
              type: string
              enum:
                - private
                - anonymized
              description: >-
                The privacy mode of the model. Private models have zero data
                retention. Anonymized models Venice can not guarantee privacy
                on, but requests are not affiliated with a user
              example: private
            regionRestrictions:
              type: array
              items:
                type: string
              description: >-
                Country codes where this model is intended to be available. Only
                present for models with region restrictions metadata.
              example:
                - US
            deprecation:
              type: object
              properties:
                autoRemap:
                  type: boolean
                  description: >-
                    When true, Venice may automatically remap API requests for
                    this model ID to replacementModelId instead of returning an
                    error.
                  example: false
                date:
                  type: string
                  description: >-
                    Legacy ISO 8601 instant aligned with the deprecation sunset
                    used in response headers
                    (`x-venice-model-deprecation-date`). Prefer startsAt /
                    removesAt for new integrations.
                  example: '2025-03-01T00:00:00.000Z'
                removesAt:
                  type: string
                  description: >-
                    ISO 8601 instant when this model ID is omitted from public
                    GET /models listings (same value as `date` today). Consumers
                    should treat the current wall-clock time as past this
                    instant when deciding whether the model remains listed.
                  example: '2025-04-01T00:00:00.000Z'
                replacementModelId:
                  type: string
                  description: >-
                    Suggested public API model ID to migrate to, when one
                    exists.
                  example: llama-3-3-70b
                startsAt:
                  type: string
                  description: >-
                    ISO 8601 instant when deprecation warnings and documentation
                    should be considered active for this model.
                  example: '2025-03-01T00:00:00.000Z'
              required:
                - autoRemap
                - date
                - removesAt
              description: >-
                Deprecation information for the model. Only present for models
                scheduled to be retired
              example:
                autoRemap: false
                date: '2025-03-01T00:00:00.000Z'
                removesAt: '2025-03-01T00:00:00.000Z'
            capabilities:
              type: object
              properties:
                optimizedForCode:
                  type: boolean
                  description: Is the LLM optimized for coding?
                  example: true
                quantization:
                  type: string
                  enum:
                    - fp4
                    - fp8
                    - fp16
                    - bf16
                    - int8
                    - int4
                    - not-available
                  description: The quantization type of the running model.
                  example: fp8
                supportsFunctionCalling:
                  type: boolean
                  description: Does the LLM model support function calling?
                  example: true
                supportsAudioInput:
                  type: boolean
                  description: Does the LLM support audio input?
                  example: false
                supportsReasoning:
                  type: boolean
                  description: >-
                    Does the model support reasoning with <thinking> blocks of
                    output.
                  example: true
                supportsReasoningEffort:
                  type: boolean
                  description: >-
                    Does the model support the reasoning_effort parameter to
                    control reasoning depth.
                  example: true
                reasoningEffortOptions:
                  type: array
                  items:
                    type: string
                    enum:
                      - none
                      - minimal
                      - low
                      - medium
                      - high
                      - xhigh
                      - max
                  description: >-
                    Supported reasoning_effort values for this model. Only
                    present when supportsReasoningEffort is true. The "none"
                    option means reasoning can be disabled.
                  example:
                    - none
                    - low
                    - medium
                    - high
                defaultReasoningEffort:
                  type: string
                  enum:
                    - none
                    - minimal
                    - low
                    - medium
                    - high
                    - xhigh
                    - max
                  description: >-
                    Default reasoning_effort value used when the request does
                    not specify one. Only present when supportsReasoningEffort
                    is true.
                  example: medium
                supportsResponseSchema:
                  type: boolean
                  description: >-
                    Does the LLM model support response schema? Only models that
                    support function calling can support response_schema.
                  example: true
                supportsMultipleImages:
                  type: boolean
                  description: >-
                    Does the LLM support multiple images in a single request?
                    Only applicable when supportsVision is true.
                  example: true
                maxImages:
                  type: number
                  description: >-
                    Maximum number of images supported per request. Only present
                    when supportsMultipleImages is true.
                  example: 10
                supportsVision:
                  type: boolean
                  description: Does the LLM support vision?
                  example: true
                supportsVideoInput:
                  type: boolean
                  description: Does the LLM support video input?
                  example: true
                supportsWebSearch:
                  type: boolean
                  description: Does the LLM model support web search?
                  example: true
                supportsLogProbs:
                  type: boolean
                  description: Does the LLM model support logprobs parameter?
                  example: true
                supportsTeeAttestation:
                  type: boolean
                  description: >-
                    Does the model run inside a Trusted Execution Environment
                    (TEE) with hardware attestation? When true, use GET
                    /tee/attestation and GET /tee/signature to cryptographically
                    verify that inference occurred inside a genuine TEE.
                  example: false
                supportsE2EE:
                  type: boolean
                  description: >-
                    Does the model support End-to-End Encryption (E2EE)? When
                    true, clients can encrypt prompts using the TEE public key
                    from attestation, and responses are returned encrypted.
                    Requires supportsTeeAttestation to also be true.
                  example: false
                supportsXSearch:
                  type: boolean
                  description: >-
                    Does the model support xAI's native X Search (web +
                    X/Twitter search)? When true, you can use
                    venice_parameters.enable_x_search to activate real-time
                    search powered by xAI.
                  example: false
              required:
                - optimizedForCode
                - quantization
                - supportsFunctionCalling
                - supportsAudioInput
                - supportsReasoning
                - supportsReasoningEffort
                - supportsResponseSchema
                - supportsMultipleImages
                - supportsVision
                - supportsVideoInput
                - supportsWebSearch
                - supportsLogProbs
                - supportsTeeAttestation
                - supportsE2EE
                - supportsXSearch
              additionalProperties: false
              description: Text model specific capabilities.
            constraints:
              anyOf:
                - type: object
                  properties:
                    aspectRatios:
                      type: array
                      items:
                        type: string
                      description: >-
                        Supported aspect ratio options for this model. Only
                        present for models that support aspect ratio selection.
                      example:
                        - '1:1'
                        - '16:9'
                        - '9:16'
                        - '3:2'
                        - '2:3'
                    defaultAspectRatio:
                      type: string
                      description: >-
                        The default aspect ratio for this model. Only present
                        for models that support aspect ratio selection.
                      example: '1:1'
                    defaultResolution:
                      type: string
                      description: >-
                        The default resolution for this model. Only present for
                        models that support resolution selection.
                      example: 1K
                    promptCharacterLimit:
                      type: number
                      description: The maximum supported prompt length.
                      example: 2048
                    resolutions:
                      type: array
                      items:
                        type: string
                      description: >-
                        Supported resolution options for this model. Only
                        present for models that support resolution selection.
                      example:
                        - 1K
                        - 2K
                        - 4K
                    steps:
                      type: object
                      properties:
                        default:
                          type: number
                          description: The default steps value for the model
                          example: 25
                        max:
                          type: number
                          description: The maximum supported steps value for the model
                          example: 50
                      required:
                        - default
                        - max
                    widthHeightDivisor:
                      type: number
                      description: >-
                        The requested width and height of the image generation
                        must be divisible by this value.
                      example: 8
                  required:
                    - promptCharacterLimit
                    - steps
                    - widthHeightDivisor
                  description: Constraints that apply to image models.
                  title: Image Model Constraints
                - type: object
                  properties:
                    temperature:
                      type: object
                      properties:
                        default:
                          type: number
                          description: The default temperature value for the model
                          example: 0.7
                      required:
                        - default
                    top_p:
                      type: object
                      properties:
                        default:
                          type: number
                          description: The default top_p value for the model
                          example: 0.9
                      required:
                        - default
                    frequency_penalty:
                      type: object
                      properties:
                        default:
                          type: number
                          description: The default frequency_penalty value for the model
                          example: 0
                      required:
                        - default
                    presence_penalty:
                      type: object
                      properties:
                        default:
                          type: number
                          description: The default presence_penalty value for the model
                          example: 0
                      required:
                        - default
                    repetition_penalty:
                      type: object
                      properties:
                        default:
                          type: number
                          description: The default repetition_penalty value for the model
                          example: 1.05
                      required:
                        - default
                  required:
                    - temperature
                    - top_p
                  description: Constraints that apply to text models.
                  title: Text Model Constraints
                - type: object
                  properties:
                    aspect_ratios:
                      type: array
                      items:
                        type: string
                      description: >-
                        The aspect ratios supported by the model. Empty array
                        means the model does not support a defined aspect ratio.
                      example:
                        - '16:9'
                        - '9:16'
                    resolutions:
                      type: array
                      items:
                        type: string
                      description: >-
                        The resolutions supported by the model. Empty array
                        means the model does not support a defined resolution.
                      example:
                        - 1080p
                        - 720p
                        - 480p
                    durations:
                      type: array
                      items:
                        type: string
                      description: >-
                        The durations supported by the model. Empty array means
                        the model does not support a defined duration.
                      example:
                        - 5s
                        - 10s
                        - 15s
                        - 20s
                        - 30s
                    model_type:
                      type: string
                      enum:
                        - image-to-video
                        - text-to-video
                        - video
                      description: The type of video model.
                      example: image-to-video
                    audio:
                      type: boolean
                      description: Does the model support audio generation?
                      example: true
                    audio_configurable:
                      type: boolean
                      description: >-
                        Can audio be enabled or disabled for the video
                        generation?
                      example: true
                    prompt_character_limit:
                      type: number
                      description: >-
                        The maximum supported prompt length for this video
                        model. If not specified, the default is 2500 characters.
                      example: 1000
                  required:
                    - aspect_ratios
                    - resolutions
                    - durations
                    - model_type
                    - audio
                    - audio_configurable
                  description: Constraints that apply to video models.
                  title: Video Model Constraints
                - type: object
                  properties:
                    aspectRatios:
                      type: array
                      items:
                        type: string
                      description: >-
                        The aspect ratios supported by this model. Omit the
                        parameter to use the model's default setting.
                      example:
                        - auto
                        - '1:1'
                        - '16:9'
                        - '9:16'
                    promptCharacterLimit:
                      type: number
                      description: The maximum supported prompt length.
                      example: 1500
                    combineImages:
                      type: boolean
                      description: >-
                        Whether this model supports combining multiple input
                        images.
                      example: true
                    singleImageAspectRatio:
                      type: boolean
                      description: >-
                        If false, output dimensions match the input on
                        single-image edits and `aspect_ratio` is ignored.
                        Multi-image edits are unaffected. Defaults to true.
                      example: true
                  required:
                    - aspectRatios
                    - promptCharacterLimit
                    - combineImages
                  description: Constraints that apply to inpaint/edit models.
                  title: Inpaint Model Constraints
              description: Constraints that apply to this model.
            description:
              type: string
              description: A human-readable description of the model and its capabilities.
              example: >-
                Balanced blend of speed and capability. Handles most everyday
                tasks with reliability.
            name:
              type: string
              description: The name of the model.
              example: GLM 5.1
            modelSource:
              type: string
              description: The source of the model, such as a URL to the model repository.
              example: https://huggingface.co/zai-org/GLM-5.1
            offline:
              type: boolean
              default: false
              description: Is this model presently offline?
              example: false
            pricing:
              anyOf:
                - type: object
                  properties:
                    input:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per million input tokens
                          example: 0.7
                        diem:
                          type: number
                          description: Diem cost per million input tokens
                          example: 7
                      required:
                        - usd
                        - diem
                    cache_input:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: >-
                            USD cost per million cached input tokens (discounted
                            rate for cache reads)
                          example: 0.35
                        diem:
                          type: number
                          description: >-
                            Diem cost per million cached input tokens
                            (discounted rate for cache reads)
                          example: 3.5
                      required:
                        - usd
                        - diem
                      description: >-
                        Optional pricing for cached input tokens (cache reads).
                        Only present for models that support context caching.
                    cache_write:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: >-
                            USD cost per million cache creation tokens (cache
                            writes). For some providers this may be higher than
                            input price.
                          example: 7.5
                        diem:
                          type: number
                          description: >-
                            Diem cost per million cache creation tokens (cache
                            writes). For some providers this may be higher than
                            input price.
                          example: 75
                      required:
                        - usd
                        - diem
                      description: >-
                        Optional pricing for cache creation tokens (cache
                        writes). Only present for models where provider charges
                        for cache writes (e.g., Anthropic charges 1.25x input
                        price).
                    output:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per million output tokens
                          example: 2.8
                        diem:
                          type: number
                          description: Diem cost per million output tokens
                          example: 28
                      required:
                        - usd
                        - diem
                    extended:
                      type: object
                      properties:
                        context_token_threshold:
                          type: number
                          description: >-
                            Input token count above which extended pricing
                            applies
                          example: 200000
                        input:
                          type: object
                          properties:
                            usd:
                              type: number
                              description: >-
                                USD cost per million input tokens (extended
                                tier)
                              example: 11
                            diem:
                              type: number
                              description: >-
                                Diem cost per million input tokens (extended
                                tier)
                              example: 11
                          required:
                            - usd
                            - diem
                        output:
                          type: object
                          properties:
                            usd:
                              type: number
                              description: >-
                                USD cost per million output tokens (extended
                                tier)
                              example: 41.25
                            diem:
                              type: number
                              description: >-
                                Diem cost per million output tokens (extended
                                tier)
                              example: 41.25
                          required:
                            - usd
                            - diem
                        cache_input:
                          type: object
                          properties:
                            usd:
                              type: number
                              description: >-
                                USD cost per million cached input tokens
                                (extended tier)
                              example: 1.1
                            diem:
                              type: number
                              description: >-
                                Diem cost per million cached input tokens
                                (extended tier)
                              example: 1.1
                          required:
                            - usd
                            - diem
                        cache_write:
                          type: object
                          properties:
                            usd:
                              type: number
                              description: >-
                                USD cost per million cache write tokens
                                (extended tier)
                              example: 13.75
                            diem:
                              type: number
                              description: >-
                                Diem cost per million cache write tokens
                                (extended tier)
                              example: 13.75
                          required:
                            - usd
                            - diem
                      required:
                        - context_token_threshold
                        - input
                        - output
                      description: >-
                        Extended pricing for long-context requests exceeding the
                        threshold. When input tokens exceed
                        context_token_threshold, extended rates apply to the
                        entire request.
                  required:
                    - input
                    - output
                  description: >-
                    Token-based pricing for chat models. Models supporting
                    context caching will include cache_input (cache read)
                    pricing. Some providers like Anthropic also charge for
                    cache_write (cache creation) at a premium rate.
                  title: LLM Model Pricing
                - type: object
                  properties:
                    generation:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per image generation (base price)
                          example: 0.01
                        diem:
                          type: number
                          description: Diem cost per image generation (base price)
                          example: 0.1
                      required:
                        - usd
                        - diem
                      description: >-
                        Base pricing for image generation. Only present for
                        models without resolution-specific pricing.
                    resolutions:
                      type: object
                      additionalProperties:
                        type: object
                        properties:
                          usd:
                            type: number
                            description: USD cost for this resolution
                            example: 0.18
                          diem:
                            type: number
                            description: Diem cost for this resolution
                            example: 0.18
                        required:
                          - usd
                          - diem
                      description: >-
                        Resolution-specific pricing. Keys are resolution names
                        (e.g., "1K", "2K", "4K"). Only present for models that
                        support resolution selection. When present, "generation"
                        pricing will not be included.
                      example:
                        1K:
                          usd: 0.18
                          diem: 0.18
                        2K:
                          usd: 0.24
                          diem: 0.24
                        4K:
                          usd: 0.35
                          diem: 0.35
                    upscale:
                      type: object
                      properties:
                        2x:
                          type: object
                          properties:
                            usd:
                              type: number
                              description: USD cost for 2x upscale
                              example: 0.02
                            diem:
                              type: number
                              description: Diem cost for 2x upscale
                              example: 0.2
                          required:
                            - usd
                            - diem
                        4x:
                          type: object
                          properties:
                            usd:
                              type: number
                              description: USD cost for 4x upscale
                              example: 0.08
                            diem:
                              type: number
                              description: Diem cost for 4x upscale
                              example: 0.8
                          required:
                            - usd
                            - diem
                      required:
                        - 2x
                        - 4x
                  required:
                    - upscale
                  description: Pricing for image generation and upscaling
                  title: Image Model Pricing
                - type: object
                  properties:
                    input:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per million input characters
                          example: 3.5
                        diem:
                          type: number
                          description: Diem cost per million input characters
                          example: 35
                      required:
                        - usd
                        - diem
                  required:
                    - input
                  description: Pricing for TTS models
                  title: TTS Model Pricing
                - type: object
                  properties:
                    per_audio_second:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per audio second
                          example: 0.0001
                        diem:
                          type: number
                          description: Diem cost per audio second
                          example: 0.0001
                      required:
                        - usd
                        - diem
                  required:
                    - per_audio_second
                  description: Pricing for ASR (speech-to-text) models
                  title: ASR Model Pricing
                - type: object
                  properties:
                    inpaint:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per image edit/inpaint operation
                          example: 0.04
                        diem:
                          type: number
                          description: Diem cost per image edit/inpaint operation
                          example: 0.04
                      required:
                        - usd
                        - diem
                  required:
                    - inpaint
                  description: Pricing for image editing/inpainting models
                  title: Inpaint Model Pricing
                - type: object
                  properties:
                    generation:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per music generation
                          example: 0.02
                        diem:
                          type: number
                          description: Diem cost per music generation
                          example: 0.02
                      required:
                        - usd
                        - diem
                  required:
                    - generation
                - type: object
                  properties:
                    durations:
                      type: object
                      additionalProperties:
                        type: object
                        properties:
                          usd:
                            type: number
                            description: USD cost for this duration tier
                            example: 0.87
                          diem:
                            type: number
                            description: Diem cost for this duration tier
                            example: 0.87
                          min_seconds:
                            type: number
                            description: >-
                              Minimum duration (inclusive) in seconds that falls
                              into this pricing tier
                            example: 1
                          max_seconds:
                            type: number
                            description: >-
                              Maximum duration (inclusive) in seconds that falls
                              into this pricing tier
                            example: 60
                        required:
                          - usd
                          - diem
                          - min_seconds
                          - max_seconds
                  required:
                    - durations
                - type: object
                  properties:
                    per_second:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per second of generated music
                          example: 0.005
                        diem:
                          type: number
                          description: Diem cost per second of generated music
                          example: 0.005
                      required:
                        - usd
                        - diem
                  required:
                    - per_second
                - type: object
                  properties:
                    per_thousand_characters:
                      type: object
                      properties:
                        usd:
                          type: number
                          description: USD cost per thousand characters
                          example: 0.01
                        diem:
                          type: number
                          description: Diem cost per thousand characters
                          example: 0.01
                      required:
                        - usd
                        - diem
                  required:
                    - per_thousand_characters
              description: Pricing details for the model
            traits:
              type: array
              items:
                type: string
              description: >-
                Traits that apply to this model. You can specify a trait to
                auto-select a model vs. specifying the model ID in your request
                to avoid breakage as Venice updates and iterates on its models.
              example:
                - default_code
            embeddingDimensions:
              type: number
              description: >-
                The native/default number of dimensions in the output embedding
                vector. Only present for embedding models.
              example: 1024
            maxInputTokens:
              type: number
              description: >-
                Maximum number of input tokens the model accepts per input
                string. Only present for embedding models.
              example: 8192
            supportsCustomDimensions:
              type: boolean
              description: >-
                Whether the model supports reducing output dimensions via the
                `dimensions` request parameter. Only present for embedding
                models that support it.
              example: true
            supports_lyrics:
              type: boolean
              description: Whether this audio-generation model supports lyrics input.
              example: true
            lyrics_required:
              type: boolean
              description: >-
                Whether lyrics input is required for this audio-generation
                model.
              example: false
            supports_force_instrumental:
              type: boolean
              description: >-
                Whether this audio-generation model supports the
                force_instrumental request parameter.
              example: true
            voices:
              type: array
              items:
                type: string
              description: >-
                The voices available for this model. Applicable for TTS models
                and voice-enabled music models. Note: each model has its own set
                of supported voices.
              example:
                - Achernar
                - Achird
                - Aiden
                - Alex
                - Algenib
            voice_cloning:
              type: object
              properties:
                mode:
                  type: string
                  enum:
                    - zero_shot
                    - persistent
                  description: >-
                    How the upstream provider implements voice cloning.
                    `zero_shot` re-reads the reference audio on every synthesis
                    call and never derives a persistent voice template (e.g.
                    Chatterbox HD). `persistent` derives a custom voice template
                    upstream that survives across synthesis calls (e.g. MiniMax
                    Speech-02 HD).
                  example: zero_shot
                accepted_formats:
                  type: array
                  items:
                    type: string
                  description: >-
                    Audio container formats this model accepts as a reference
                    sample on POST /v1/audio/voices. Samples in other containers
                    are rejected with HTTP 400 before any upload.
                  example:
                    - mp3
                    - wav
                    - flac
                    - mp4
                min_sample_seconds:
                  type: number
                  description: >-
                    Recommended minimum length of the reference audio sample, in
                    seconds, for an intelligible clone.
                  example: 5
                retention_days:
                  type: number
                  description: >-
                    Days a `vv_<id>` voice handle remains valid against this
                    model. For `persistent` models the upstream provider
                    auto-deletes the cloned voice after this many days without
                    use; each successful TTS request resets the window. For
                    `zero_shot` models this is the storage TTL on the uploaded
                    reference audio; the handle stops working when it expires
                    and the user must re-upload.
                  example: 7
              required:
                - mode
                - accepted_formats
                - min_sample_seconds
                - retention_days
              additionalProperties: false
              description: >-
                Voice-cloning capability. Only present for TTS models whose
                cloning endpoint is publicly available — pass the model to POST
                /v1/audio/voices to mint a `vv_<id>` voice handle, then pass
                that handle back as the `voice` parameter on POST
                /v1/audio/speech alongside the same `model`. Models with cloning
                gated behind a private alpha (e.g. MiniMax during the
                biometric-data legal review) omit this field for non-staff
                callers; the model itself still appears in the listing.
              title: TTS Voice Cloning
            default_voice:
              type: string
              description: Default voice for voice-enabled music models.
              example: Aria
            supports_language_code:
              type: boolean
              description: >-
                Whether this music model supports an ISO 639-1 language_code
                parameter.
              example: true
            supports_speed:
              type: boolean
              description: Whether this music model supports speed adjustment.
              example: true
            default_speed:
              type: number
              description: Default speed multiplier for this music model.
              example: 1
            min_speed:
              type: number
              description: Minimum speed multiplier for this music model.
              example: 0.25
            max_speed:
              type: number
              description: Maximum speed multiplier for this music model.
              example: 4
            duration_options:
              type: array
              items:
                type: number
              description: Available duration options in seconds for this music model.
              example:
                - 60
                - 120
                - 180
                - 240
            min_duration:
              type: number
              description: Minimum duration in seconds for this music model.
              example: 60
            max_duration:
              type: number
              description: Maximum duration in seconds for this music model.
              example: 240
            default_duration:
              type: number
              description: Default duration in seconds for this music model.
              example: 60
            supported_formats:
              type: array
              items:
                type: string
              description: Supported audio formats for this music model.
              example:
                - mp3
                - wav
            default_format:
              type: string
              description: Default audio format for this music model.
              example: mp3
            prompt_character_limit:
              type: number
              description: Maximum prompt character limit for this music model.
              example: 500
            min_prompt_length:
              type: number
              description: Minimum prompt length for this music model.
              example: 1
            lyrics_character_limit:
              type: number
              description: Maximum lyrics character limit for this music model.
              example: 3000
          required:
            - privacy
        object:
          type: string
          enum:
            - model
          description: Object type
          example: model
        owned_by:
          type: string
          enum:
            - venice.ai
          description: Who runs the model
          example: venice.ai
        type:
          type: string
          enum:
            - asr
            - embedding
            - image
            - music
            - text
            - tts
            - upscale
            - inpaint
            - video
          description: Model type
          example: text
      required:
        - id
        - model_spec
        - object
        - owned_by
        - type
      description: Response schema for model information
      example:
        created: 1727966436
        id: llama-3.2-3b
        model_spec:
          availableContextTokens: 131072
          capabilities:
            optimizedForCode: false
            quantization: fp16
            supportsAudioInput: false
            supportsFunctionCalling: true
            supportsLogProbs: true
            supportsMultipleImages: false
            supportsReasoning: false
            supportsReasoningEffort: false
            supportsResponseSchema: true
            supportsTeeAttestation: false
            supportsE2EE: false
            supportsVision: false
            supportsVideoInput: false
            supportsWebSearch: true
            supportsXSearch: false
          constraints:
            temperature:
              default: 0.8
            top_p:
              default: 0.9
          description: >-
            Compact and efficient model for quick responses and lighter
            workloads.
          name: Llama 3.2 3B
          modelSource: https://huggingface.co/meta-llama/Llama-3.2-3B
          offline: false
          privacy: private
          pricing:
            input:
              usd: 0.15
              diem: 0.15
            output:
              usd: 0.6
              diem: 0.6
          traits:
            - fastest
        object: model
        owned_by: venice.ai
        type: text
    StandardError:
      type: object
      properties:
        error:
          type: string
          description: A description of the error
      required:
        - error
  securitySchemes:
    BearerAuth:
      bearerFormat: JWT
      scheme: bearer
      type: http

````