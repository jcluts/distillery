> ## Documentation Index
> Fetch the complete documentation index at: https://docs.venice.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Generate Images

> Generate an image based on input parameters

**Authentication:** This endpoint accepts either a Bearer API key or an `X-Sign-In-With-X` header for x402 wallet-based authentication. When using x402, a `402 Payment Required` response indicates insufficient balance and includes top-up instructions.

## Sizing Options

Image models use model-specific sizing parameters:

* Pixel-based models accept `width` and `height`, for example `venice-sd35` and `qwen-image`.
* Aspect-ratio models accept `aspect_ratio`, for example `qwen-image-2`.
* Resolution-tier models accept both `aspect_ratio` and `resolution`.

For example, `gpt-image-2`, `nano-banana-2`, and `nano-banana-pro` support `resolution` values of `1K`, `2K`, and `4K`:

```json theme={"system"}
{
  "model": "gpt-image-2",
  "prompt": "a cinematic wide shot of Venice at sunset",
  "aspect_ratio": "16:9",
  "resolution": "4K",
  "format": "png"
}
```

The same resolution-tier sizing pattern also applies to Nano Banana models:

```json theme={"system"}
{
  "model": "nano-banana-pro",
  "prompt": "a serene canal in venice at sunset",
  "aspect_ratio": "16:9",
  "resolution": "2K"
}
```

For models that accept aspect ratio but do not expose resolution tiers, send `aspect_ratio` without `resolution`:

```json theme={"system"}
{
  "model": "qwen-image-2",
  "prompt": "a serene canal in venice at sunset",
  "aspect_ratio": "16:9"
}
```

For models that use direct pixel dimensions, send `width` and `height` instead:

```json theme={"system"}
{
  "model": "venice-sd35",
  "prompt": "a serene canal in venice at sunset",
  "width": 1024,
  "height": 1024
}
```

Check [Image Models](/models/image) or the [Models endpoint](/api-reference/endpoint/models/list) for each model's supported sizing options before mixing sizing fields across models.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-0adc004d-2edf-4b88-a3bb-0f868c791c9c?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


## OpenAPI

````yaml POST /image/generate
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
  /image/generate:
    post:
      tags:
        - Image
      summary: /api/v1/image/generate
      description: >-
        Generate an image based on input parameters


        **Authentication:** This endpoint accepts either a Bearer API key or an
        `X-Sign-In-With-X` header for x402 wallet-based authentication. When
        using x402, a `402 Payment Required` response indicates insufficient
        balance and includes top-up instructions.
      operationId: generateImage
      parameters:
        - description: >-
            Supported compression encodings (gzip, br). Only applied when
            return_binary is false.
          in: header
          name: Accept-Encoding
          required: false
          schema:
            example: gzip, br
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/GenerateImageRequest'
      responses:
        '200':
          description: Successfully generated image
          headers:
            X-Balance-Remaining:
              description: >-
                Remaining x402 credit balance in USD after this request (only
                present for x402 auth).
              required: false
              schema:
                type: string
                example: '4.230000'
            Content-Encoding:
              description: The encoding used to compress the response
              schema:
                enum:
                  - gzip
                  - br
                type: string
            x-venice-is-blurred:
              description: >-
                Indicates if the generated image is blurred. When Safe Venice is
                enabled, adult material will be returned blurred.
              required: false
              schema:
                type: boolean
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
            application/json:
              schema:
                type: object
                properties:
                  id:
                    type: string
                    description: The ID of the request.
                    example: generate-image-1234567890
                  images:
                    type: array
                    items:
                      type: string
                    description: Base64 encoded image data.
                  request:
                    nullable: true
                    description: The original request data sent to the API.
                  timing:
                    type: object
                    properties:
                      inferenceDuration:
                        type: number
                        description: Duration of inference in milliseconds
                      inferencePreprocessingTime:
                        type: number
                        description: Duration of preprocessing in milliseconds
                      inferenceQueueTime:
                        type: number
                        description: Duration of queueing in milliseconds
                      total:
                        type: number
                        description: Total duration of the request in milliseconds
                    required:
                      - inferenceDuration
                      - inferencePreprocessingTime
                      - inferenceQueueTime
                      - total
                required:
                  - id
                  - images
                  - timing
            image/jpeg:
              schema:
                description: Raw image data when return_binary is true and format is jpeg
                format: binary
                type: string
            image/png:
              schema:
                description: Raw image data when return_binary is true and format is png
                format: binary
                type: string
            image/webp:
              schema:
                description: Raw image data when return_binary is true and format is webp
                format: binary
                type: string
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
    GenerateImageRequest:
      type: object
      properties:
        cfg_scale:
          type: number
          minimum: 0
          exclusiveMinimum: true
          maximum: 20
          description: >-
            CFG scale parameter. Higher values lead to more adherence to the
            prompt.
          example: 7.5
        embed_exif_metadata:
          type: boolean
          default: false
          description: Embed prompt generation information into the image's EXIF metadata.
          example: false
        format:
          type: string
          enum:
            - jpeg
            - png
            - webp
          default: webp
          description: >-
            The image format to return. WebP are smaller and optimized for web
            use. PNG are higher quality but larger in file size. 
          example: webp
        height:
          type: integer
          minimum: 0
          exclusiveMinimum: true
          maximum: 1280
          default: 1024
          description: Height of the generated image.
          example: 1024
        hide_watermark:
          type: boolean
          default: false
          description: >-
            Whether to hide the Venice watermark. Venice may ignore this
            parameter for certain generated content.
          example: false
        inpaint:
          nullable: true
          description: >-
            This feature is deprecated and was disabled on May 19th, 2025. A
            revised in-painting API will be launched in the near future.
          deprecated: true
        lora_strength:
          type: integer
          minimum: 0
          maximum: 100
          description: >-
            Lora strength for the model. Only applies if the model uses
            additional Loras.
          example: 50
        model:
          type: string
          description: The model to use for image generation.
          example: grok-imagine-image
        negative_prompt:
          type: string
          maxLength: 7500
          description: >-
            A description of what should not be in the image. Character limit is
            model specific and is listed in the promptCharacterLimit constraint
            in the model list endpoint.
          example: Clouds, Rain, Snow
        prompt:
          type: string
          minLength: 1
          maxLength: 7500
          description: >-
            The description for the image. Character limit is model specific and
            is listed in the promptCharacterLimit setting in the model list
            endpoint.
          example: A beautiful sunset over a mountain range
        return_binary:
          type: boolean
          default: false
          description: Whether to return binary image data instead of base64.
          example: false
        variants:
          type: integer
          minimum: 1
          maximum: 4
          description: >-
            Number of images to generate (1–4). Only supported when
            return_binary is false.
          example: 3
        safe_mode:
          type: boolean
          default: true
          description: >-
            Whether to use safe mode. If enabled, this will blur images that are
            classified as having adult content.
          example: false
        seed:
          type: integer
          minimum: -999999999
          maximum: 999999999
          default: 0
          description: >-
            Random seed for generation. If not provided, a random seed will be
            used.
          example: 123456789
        steps:
          type: integer
          default: 8
          description: >-
            Number of inference steps. This model does not support steps - this
            field is ignored.
          example: 8
        style_preset:
          type: string
          description: >-
            An image style to apply to the image. Visit
            https://docs.venice.ai/api-reference/endpoint/image/styles for more
            details.
          example: 3D Model
        aspect_ratio:
          type: string
          description: >-
            Aspect ratio (utilized by certain image models including Nano
            Banana). Examples: "1:1", "16:9".
          example: '1:1'
        resolution:
          type: string
          description: >-
            Resolution (utilized by certain image models including Nano Banana).
            Examples: "1K", "2K", "4K".
          example: 1K
        enable_web_search:
          type: boolean
          description: >-
            Enable web search for the image generation task. This will allow the
            model to use the latest information from the web to generate the
            image. Only supported by certain models. If web search is used,
            additional credits are getting charged.
          example: false
        width:
          type: integer
          minimum: 0
          exclusiveMinimum: true
          maximum: 1280
          default: 1024
          description: Width of the generated image.
          example: 1024
      required:
        - model
        - prompt
      additionalProperties: false
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