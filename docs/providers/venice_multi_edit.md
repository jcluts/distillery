> ## Documentation Index
> Fetch the complete documentation index at: https://docs.venice.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Multi-Edit Image

> Edit or modify an image using up to three layered inputs (base image plus masks/overlays).

**Supported input formats by Content-Type:**

- **multipart/form-data**: Only file uploads are supported. Send images as form file fields.

- **application/json**: Base64 strings and URLs are supported:
  - Raw base64 string: `"iVBORw0KGgoAAAANSUhEUgAA..."`
  - Data URL: `"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."`
  - HTTP/HTTPS URL: `"https://example.com/image.png"`

For models with resolution tiers that require explicit dimensions, omit `aspect_ratio` or set it to `auto` to infer the closest supported aspect ratio from the first input image. Provide `aspect_ratio` directly when exact output dimensions are required. Use `output_format` to request jpeg, jpg, png, or webp output.


**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

<Info>
  **Pricing:** Multi-edit pricing varies by model. See the [Pricing overview](/overview/pricing)
  for current per-edit prices.
</Info>


## OpenAPI

````yaml POST /image/multi-edit
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
  /image/multi-edit:
    post:
      tags:
        - Image
      summary: /api/v1/image/multi-edit
      description: >-
        Edit or modify an image using up to three layered inputs (base image
        plus masks/overlays).


        **Supported input formats by Content-Type:**


        - **multipart/form-data**: Only file uploads are supported. Send images
        as form file fields.


        - **application/json**: Base64 strings and URLs are supported:
          - Raw base64 string: `"iVBORw0KGgoAAAANSUhEUgAA..."`
          - Data URL: `"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."`
          - HTTP/HTTPS URL: `"https://example.com/image.png"`

        For models with resolution tiers that require explicit dimensions, omit
        `aspect_ratio` or set it to `auto` to infer the closest supported aspect
        ratio from the first input image. Provide `aspect_ratio` directly when
        exact output dimensions are required. Use `output_format` to request
        jpeg, jpg, png, or webp output.



        **Authentication:** This endpoint accepts either a Bearer API key or an
        `X-Sign-In-With-X` header for x402 wallet-based authentication. When
        using x402, a `402 Payment Required` response indicates insufficient
        balance and includes top-up instructions.
      operationId: multiEditImage
      requestBody:
        content:
          application/json:
            schema:
              allOf:
                - $ref: '#/components/schemas/MultiEditImageRequest'
                - type: object
                  properties:
                    modelId:
                      type: string
                      enum:
                        - firered-image-edit
                        - qwen-edit
                        - grok-imagine-edit
                        - grok-imagine-quality-edit
                        - qwen-image-2-edit
                        - qwen-image-2-pro-edit
                        - wan-2-7-pro-edit
                        - flux-2-max-edit
                        - gpt-image-2-edit
                        - gpt-image-1-5-edit
                        - nano-banana-2-edit
                        - nano-banana-pro-edit
                        - seedream-v5-lite-edit
                        - seedream-v4-edit
          multipart/form-data:
            schema:
              allOf:
                - $ref: '#/components/schemas/MultiEditImageMultipartRequest'
                - type: object
                  properties:
                    modelId:
                      type: string
                      enum:
                        - firered-image-edit
                        - qwen-edit
                        - grok-imagine-edit
                        - grok-imagine-quality-edit
                        - qwen-image-2-edit
                        - qwen-image-2-pro-edit
                        - wan-2-7-pro-edit
                        - flux-2-max-edit
                        - gpt-image-2-edit
                        - gpt-image-1-5-edit
                        - nano-banana-2-edit
                        - nano-banana-pro-edit
                        - seedream-v5-lite-edit
                        - seedream-v4-edit
      responses:
        '200':
          description: OK
          headers:
            X-Balance-Remaining:
              description: >-
                Remaining x402 credit balance in USD after this request (only
                present for x402 auth).
              required: false
              schema:
                type: string
                example: '4.230000'
            x-venice-is-content-violation:
              description: >-
                Indicates if the generated image does not meet Venice terms of
                service.
              required: false
              schema:
                type: boolean
            x-venice-model-deprecation-warning:
              description: A warning that the model is scheduled for deprecation
              required: false
              schema:
                type: string
            x-venice-model-deprecation-date:
              description: The date the model is scheduled for deprecation
              required: false
              schema:
                type: string
                format: date-time
          content:
            image/png:
              schema:
                type: string
                format: binary
            image/jpeg:
              schema:
                type: string
                format: binary
            image/webp:
              schema:
                type: string
                format: binary
        '400':
          description: Invalid request parameters
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DetailedError'
        '401':
          description: Authentication failed
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
        '415':
          description: Invalid request content-type
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
        '429':
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
        '500':
          description: Inference processing failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
        '503':
          description: The model is at capacity. Please try again later.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
      security:
        - BearerAuth: []
        - siwx: []
components:
  schemas:
    MultiEditImageRequest:
      type: object
      properties:
        aspect_ratio:
          type: string
          enum:
            - auto
            - '1:1'
            - '3:2'
            - '16:9'
            - '21:9'
            - '9:16'
            - '2:3'
            - '3:4'
            - '4:5'
          description: >-
            The aspect ratio for the output image. Use 'auto' or omit this
            parameter to infer the closest supported aspect ratio from the first
            input image when explicit sizing is required by the model.
          example: '16:9'
        modelId:
          type: string
          minLength: 1
          default: firered-image-edit
          description: The model ID to use for multi-edit.
        output_format:
          type: string
          enum:
            - jpeg
            - png
            - webp
          description: >-
            Output format for the edited image. Accepts jpeg, jpg, png, or webp.
            When omitted, the format is inferred from resolution: PNG for 1K
            edits and JPEG for 2K/4K edits.
          example: png
        prompt:
          type: string
          minLength: 1
          maxLength: 32768
          description: >-
            The text directions to edit or modify the image. Short, descriptive
            prompts work best (e.g., "remove the tree", "change the sky to
            sunrise"). Character limit is model specific and is listed in the
            promptCharacterLimit setting in the model list endpoint.
        images:
          type: array
          items:
            anyOf:
              - type: string
                format: uri
              - type: string
            description: >-
              Image as a base64-encoded string or a URL starting with http:// or
              https://
          minItems: 1
          maxItems: 3
          description: >-
            Array of 1 to 3 images used for multi-editing. The first image is
            treated as the base image, and the remaining images are used as edit
            layers/masks. Each image can be a base64-encoded string or a URL
            starting with http:// or https://. Image dimensions must be at least
            65536 pixels and must not exceed 33177600 pixels. File size must be
            less than 25MB.
        resolution:
          type: string
          minLength: 1
          maxLength: 10
          description: >-
            Resolution tier for the output image (e.g. "1K", "2K", "4K").
            Supported values vary by model - check GET /api/v1/models for
            model-specific options. Defaults to "1K" when not specified.
          example: 1K
        safe_mode:
          type: boolean
          default: true
          description: >-
            Whether to use safe mode. If enabled, this will blur images that are
            classified as having adult content.
          example: false
      required:
        - prompt
        - images
      additionalProperties: false
      description: >-
        Edit an image by compositing up to three layered images with a single
        prompt. Supports base64-encoded strings and URLs.
    MultiEditImageMultipartRequest:
      type: object
      properties:
        aspect_ratio:
          type: string
          enum:
            - auto
            - '1:1'
            - '3:2'
            - '16:9'
            - '21:9'
            - '9:16'
            - '2:3'
            - '3:4'
            - '4:5'
          description: >-
            The aspect ratio for the output image. Use 'auto' or omit this
            parameter to infer the closest supported aspect ratio from the first
            input image when explicit sizing is required by the model.
          example: '16:9'
        modelId:
          type: string
          minLength: 1
          default: firered-image-edit
          description: The model ID to use for multi-edit.
        output_format:
          type: string
          enum:
            - jpeg
            - png
            - webp
          description: >-
            Output format for the edited image. Accepts jpeg, jpg, png, or webp.
            When omitted, the format is inferred from resolution: PNG for 1K
            edits and JPEG for 2K/4K edits.
          example: png
        prompt:
          type: string
          minLength: 1
          maxLength: 32768
          description: >-
            The text directions to edit or modify the image. Short, descriptive
            prompts work best (e.g., "remove the tree", "change the sky to
            sunrise"). Character limit is model specific and is listed in the
            promptCharacterLimit setting in the model list endpoint.
        images:
          type: array
          items:
            type: string
            format: binary
          minItems: 1
          maxItems: 3
          description: >-
            Array of 1 to 3 image files. The first image is treated as the base
            image, and the remaining images are used as edit layers/masks.
        resolution:
          type: string
          minLength: 1
          maxLength: 10
          description: >-
            Resolution tier for the output image (e.g. "1K", "2K", "4K").
            Supported values vary by model - check GET /api/v1/models for
            model-specific options. Defaults to "1K" when not specified.
          example: 1K
        safe_mode:
          type: boolean
          default: true
          description: >-
            Whether to use safe mode. If enabled, this will blur images that are
            classified as having adult content.
          example: false
      required:
        - prompt
        - images
      description: >-
        Edit an image by compositing up to three layered image files with a
        single prompt. Only file uploads are supported with multipart/form-data.
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