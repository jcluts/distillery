> ## Documentation Index
> Fetch the complete documentation index at: https://docs.venice.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Queue Video Generation

> Queue a new video generation request.

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

Call `/video/quote` to get a price estimate, then poll `/video/retrieve` with the returned `queue_id` until complete.

### Video upscaling

For the `topaz-video-upscale` model, use `upscale_factor` (1, 2, or 4) instead of `resolution`, and provide a `video_url`. Duration and FPS are detected automatically from the video file. See the [Video Upscaling Guide](/guides/media/video-upscaling) for full details and examples.

***


## OpenAPI

````yaml POST /video/queue
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
  /video/queue:
    post:
      tags:
        - Video
      summary: /api/v1/video/queue
      description: >-
        Queue a new video generation request.


        **Authentication:** This endpoint accepts either a Bearer API key or an
        `X-Sign-In-With-X` header for x402 wallet-based authentication. When
        using x402, a `402 Payment Required` response indicates insufficient
        balance and includes top-up instructions.
      operationId: queueVideo
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/QueueVideoRequest'
      responses:
        '200':
          description: Video generation request queued successfully
          headers:
            X-Balance-Remaining:
              description: >-
                Remaining x402 credit balance in USD after this request (only
                present for x402 auth).
              required: false
              schema:
                type: string
                example: '4.230000'
          content:
            application/json:
              schema:
                type: object
                properties:
                  model:
                    type: string
                    description: The ID of the model used for video generation.
                    example: video-model-123
                  queue_id:
                    type: string
                    description: The ID of the video generation request.
                    example: 123e4567-e89b-12d3-a456-426614174000
                  download_url:
                    type: string
                    description: >-
                      Pre-signed URL to download the completed video. Only
                      present for VPS-backed models. When provided, the retrieve
                      endpoint returns JSON status only (no video stream). Fetch
                      this URL after status is COMPLETED to get the video/mp4
                      file. Valid for 24 hours.
                required:
                  - model
                  - queue_id
                additionalProperties: false
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DetailedError'
        '401':
          description: |-
            - Authentication failed
            - This model is only available to Pro users
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
        '402':
          description: >-
            Insufficient balance. Response varies by authentication method:


            **API Key users:** Standard error response with
            `INSUFFICIENT_BALANCE` code. Top up your Venice balance at
            venice.ai.


            **x402 wallet users:** Structured response with `PAYMENT_REQUIRED`
            code containing:

            - `topUpInstructions`: Step-by-step guide to top up via x402
            protocol

            - `siwxChallenge`: Sign-In-With-X challenge template for
            authentication

            - `supportedTokens` / `supportedChains`: Accepted payment methods


            The `PAYMENT-REQUIRED` header also contains a base64-encoded JSON
            object with the same payment requirements for protocol-level
            discovery (x402 v2 spec).
          headers:
            PAYMENT-REQUIRED:
              description: >-
                Base64-encoded JSON with x402 payment requirements and SIWX
                challenge. Present only for x402 wallet authentication. Decode
                to get payment instructions programmatically.
              required: false
              schema:
                type: string
          content:
            application/json:
              schema:
                oneOf:
                  - $ref: '#/components/schemas/StandardError'
                  - $ref: '#/components/schemas/X402InferencePaymentRequired'
                discriminator:
                  propertyName: code
        '403':
          description: >-
            The specified model is unavailable in your region. Use of Tor, VPNs,
            proxies, or other means to circumvent this restriction is a
            violation of our Terms of Service.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
        '413':
          description: >-
            The request payload is too large. Please reduce the size of your
            request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PayloadTooLargeError'
        '422':
          description: >-
            Your prompt violates the content policy of Venice.ai or the model
            provider
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ContentViolationError'
        '500':
          description: Inference processing failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
      security:
        - BearerAuth: []
        - siwx: []
components:
  schemas:
    QueueVideoRequest:
      type: object
      properties:
        model:
          type: string
          description: The model to use for video generation.
          example: seedance-2-0-text-to-video
        prompt:
          type: string
          minLength: 1
          maxLength: 10000
          description: >-
            The prompt to use for video generation. Required for most models.
            The maximum length varies by model (default 2500 characters, up to
            10000 for some models such as Seedance 2.0).
          example: Commerce being conducted in the city of Venice, Italy.
        negative_prompt:
          type: string
          maxLength: 10000
          description: >-
            Optional negative prompt. The maximum length varies by model
            (default 2500 characters, up to 10000 for some models).
          example: low resolution, error, worst quality, low quality, defects
        duration:
          type: string
          enum:
            - 2s
            - 3s
            - 4s
            - 5s
            - 6s
            - 7s
            - 8s
            - 9s
            - 10s
            - 11s
            - 12s
            - 13s
            - 14s
            - 15s
            - 16s
            - 18s
            - 20s
            - 25s
            - 30s
            - 1 gen
            - Auto
          description: >-
            The duration of the video to generate. Available options vary by
            model.
          example: 5s
        aspect_ratio:
          type: string
          enum:
            - '1:1'
            - '2:3'
            - '3:2'
            - '3:4'
            - '4:3'
            - '9:16'
            - '16:9'
            - '21:9'
          description: >-
            The aspect ratio of the video. Available options vary by model. Some
            models do not support aspect_ratio.
          example: '16:9'
        resolution:
          type: string
          enum:
            - 256p
            - 360p
            - 480p
            - 540p
            - 580p
            - 720p
            - 1080p
            - 1440p
            - 2160p
            - 4k
            - 2x
            - 4x
            - true_1080p
          description: >-
            The resolution of the video. Available options vary by model. Some
            models do not support resolution. Use upscale_factor for upscale
            models.
          example: 720p
        upscale_factor:
          type: integer
          description: >-
            For upscale models only. 1 = quality enhancement, 2 = double
            resolution (default), 4 = quadruple.
          enum:
            - 1
            - 2
            - 4
          default: 2
          example: 2
        audio:
          type: boolean
          default: true
          description: >-
            For models which support audio generation and configuration.
            Defaults to true.
          example: true
        image_url:
          type: string
          description: >-
            For image-to-video models, the reference image. Must be a URL
            (http/https) or a data URL (data:image/...).
          example: data:image/png;base64,iVBORw0K...
        end_image_url:
          type: string
          description: >-
            For models that support end images or transitions, the end frame
            image. Must be a URL or data URL.
          example: data:image/png;base64,iVBORw0K...
        audio_url:
          type: string
          description: >-
            For models that support audio input, background music. Must be a URL
            or data URL. Supported: WAV, MP3. Max: 30s, 15MB.
          example: data:audio/mpeg;base64,SUQzBAA...
        video_url:
          type: string
          description: >-
            For models that support video input (video-to-video, upscale). Must
            be a URL or data URL. Supported: MP4, MOV, WebM.
          example: data:video/mp4;base64,AAAAFGZ0eXA...
        reference_image_urls:
          type: array
          items:
            type: string
          maxItems: 9
          description: >-
            For models with reference image support, up to 9 images for
            character/style consistency. Each must be a URL or data URL.
          example:
            - data:image/png;base64,iVBORw0K...
        reference_video_urls:
          type: array
          items:
            type: string
          maxItems: 3
          description: >-
            For models with reference video support (e.g. Seedance 2.0 R2V), up
            to 3 reference video URLs (`role: "reference_video"`) used to
            inherit subject motion, camera movement, and overall style. Per-clip
            2–15 s, .mp4 or .mov, ≤50 MB; aggregate duration ≤15 s. Each must be
            a URL or data URL.
          example:
            - https://example.com/reference-clip.mp4
        elements:
          type: array
          items:
            type: object
            properties:
              frontal_image_url:
                type: string
              reference_image_urls:
                type: array
                items:
                  type: string
                maxItems: 3
              video_url:
                type: string
          maxItems: 4
          description: >-
            For models with advanced element support (e.g., Kling O3 R2V). Up to
            4 elements defining characters/objects. Reference in prompt as
            @Element1, @Element2, etc.
          example:
            - frontal_image_url: data:image/png;base64,iVBORw0K...
              reference_image_urls:
                - data:image/png;base64,iVBORw0K...
        scene_image_urls:
          type: array
          items:
            type: string
          maxItems: 4
          description: >-
            For models with advanced element support. Up to 4 scene reference
            images. Reference in prompt as @Image1, @Image2, etc.
          example:
            - data:image/png;base64,iVBORw0K...
      required:
        - model
        - prompt
        - duration
      description: >-
        Request body for video generation. Available fields and valid values
        vary by model.
    DetailedError:
      type: object
      properties:
        details:
          type: object
          properties: {}
          description: Details about the incorrect input
          example:
            _errors: []
            field:
              _errors:
                - Field is required
        error:
          type: string
          description: A description of the error
      required:
        - error
    StandardError:
      type: object
      properties:
        error:
          type: string
          description: A description of the error
      required:
        - error
    X402InferencePaymentRequired:
      type: object
      properties:
        error:
          type: string
          enum:
            - Payment required
          description: Error message indicating payment is required.
        code:
          type: string
          enum:
            - PAYMENT_REQUIRED
          description: Machine-readable error code.
        message:
          type: string
          description: Human-readable context about the payment requirement.
          example: Insufficient x402 balance
        suggestedTopUpUsd:
          type: number
          description: Suggested amount to top up in USD.
          example: 10
        minimumTopUpUsd:
          type: number
          description: Minimum allowed top-up amount in USD.
          example: 5
        supportedTokens:
          type: array
          items:
            type: string
          description: List of supported token symbols for payment.
          example:
            - USDC
        supportedChains:
          type: array
          items:
            type: string
          description: List of supported blockchain networks.
          example:
            - base
        topUpInstructions:
          type: object
          properties:
            step1:
              type: string
              description: 'First step: get payment requirements.'
              example: >-
                POST /api/v1/x402/top-up with no payment header to get payment
                requirements
            step2:
              type: string
              description: 'Second step: sign the payment.'
              example: >-
                Sign a USDC transfer authorization using the x402 SDK
                (createPaymentHeader)
            step3:
              type: string
              description: 'Third step: submit the payment.'
              example: POST /api/v1/x402/top-up with the signed X-402-Payment header
            receiverWallet:
              type: string
              description: Venice receiver wallet address.
              example: <RECEIVER_WALLET_ADDRESS>
            tokenAddress:
              type: string
              description: USDC token contract address.
              example: <USDC_TOKEN_ADDRESS>
            tokenDecimals:
              type: number
              description: Token decimal places.
              example: 6
            network:
              type: string
              description: Target blockchain network.
              example: eip155:8453
            minimumAmountUsd:
              type: number
              description: Minimum top-up amount in USD.
              example: 5
          required:
            - step1
            - step2
            - step3
            - receiverWallet
            - tokenAddress
            - tokenDecimals
            - network
            - minimumAmountUsd
          additionalProperties: false
        siwxChallenge:
          type: object
          properties:
            domain:
              type: string
              description: Domain for the SIWX challenge.
              example: api.venice.ai
            address:
              type: string
              description: Placeholder for wallet address.
              example: '{{walletAddress}}'
            uri:
              type: string
              description: Resource URI for the challenge.
              example: https://api.venice.ai/api/v1/x402/top-up
            version:
              type: string
              description: SIWX version.
              example: '1'
            chainId:
              type: number
              description: Chain ID for the signature.
              example: 8453
            nonce:
              type: string
              description: Unique nonce for replay protection.
              example: '{{nonce}}'
            issuedAt:
              type: string
              description: ISO timestamp when the challenge was issued.
              example: '2026-04-09T12:00:00.000Z'
            expirationTime:
              type: string
              description: ISO timestamp when the challenge expires.
              example: '2026-04-09T12:05:00.000Z'
            statement:
              type: string
              description: Human-readable statement for the signature.
              example: Sign in with your wallet to access Venice x402 API
          required:
            - domain
            - address
            - uri
            - version
            - chainId
            - nonce
            - issuedAt
            - expirationTime
            - statement
          additionalProperties: false
      required:
        - error
        - code
        - suggestedTopUpUsd
        - minimumTopUpUsd
        - supportedTokens
        - supportedChains
        - topUpInstructions
        - siwxChallenge
    PayloadTooLargeError:
      type: object
      properties:
        code:
          type: string
          enum:
            - PAYLOAD_TOO_LARGE
          description: Machine-readable error code.
          example: PAYLOAD_TOO_LARGE
        error:
          type: string
          description: A description of the error
          example: File exceeds the maximum allowed size of 25 MB.
      required:
        - code
        - error
    ContentViolationError:
      type: object
      properties:
        error:
          type: string
          description: A description of the error
        suggested_prompt:
          type: string
          description: >-
            An optional provider-suggested replacement prompt that complies with
            content policy.
          example: >-
            A cinematic instrumental track inspired by stormy weather and
            dramatic tension.
      required:
        - error
  securitySchemes:
    BearerAuth:
      bearerFormat: JWT
      scheme: bearer
      type: http
    siwx:
      description: >-
        Wallet-based authentication using the x402 protocol (Sign-In-With-X /
        EIP-4361 SIWE).


        **Header format:** Base64-encoded JSON object with the following fields:

        - `address` — Ethereum wallet address (checksummed)

        - `message` — EIP-4361 SIWE message string (created with
        `SiweMessage.prepareMessage()`)

        - `signature` — Hex-encoded signature of the message, signed by the
        wallet's private key

        - `timestamp` — Unix timestamp in milliseconds

        - `chainId` — Chain ID (use `8453` for Base)


        **SIWE message fields:**

        - `domain`: `outerface.venice.ai`

        - `uri`: `https://outerface.venice.ai`

        - `version`: `"1"`

        - `chainId`: `8453`

        - `nonce`: Random 16-character hex string

        - `issuedAt` / `expirationTime`: ISO timestamps (recommended TTL: 10
        minutes)

        - `statement`: `"Sign in to Venice API"`


        **Example (TypeScript):**

        ```

        import { Wallet } from 'ethers'

        import { SiweMessage } from 'siwe'


        const wallet = new Wallet(PRIVATE_KEY)

        const msg = new SiweMessage({ domain: 'outerface.venice.ai', address:
        wallet.address, statement: 'Sign in to Venice API', uri:
        'https://outerface.venice.ai', version: '1', chainId: 8453, nonce:
        crypto.randomUUID().replace(/-/g, '').slice(0, 16), issuedAt: new
        Date().toISOString(), expirationTime: new Date(Date.now() +
        600000).toISOString() })

        const signature = await wallet.signMessage(msg.prepareMessage())

        const header = btoa(JSON.stringify({ address: wallet.address, message:
        msg.prepareMessage(), signature, timestamp: Date.now(), chainId: 8453
        }))

        // Set header: X-Sign-In-With-X: <header>

        ```


        **SDK:** `npm install @venice-ai/x402-client` provides `VeniceClient`
        and `createAuthFetch` which handle this automatically.


        **Billing:** x402 users pay from a prepaid USDC credit balance. Top up
        via `POST /x402/top-up`. When balance is insufficient, endpoints return
        `402` with structured top-up instructions.
      in: header
      name: X-Sign-In-With-X
      type: apiKey

````