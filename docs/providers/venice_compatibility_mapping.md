> ## Documentation Index
> Fetch the complete documentation index at: https://docs.venice.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Compatibility Mapping

> Returns a list of model compatibility mappings and the associated model.

## Postman Collection

For additional examples, please see this [Postman Collection](https://www.postman.com/veniceai/workspace/venice-ai-workspace/folder/38652128-59dfa959-7038-4cd8-b8ba-80cf09f2f026?action=share\&source=copy-link\&creator=38652128\&ctx=documentation).

***


## OpenAPI

````yaml GET /models/compatibility_mapping
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
  /models/compatibility_mapping:
    get:
      tags:
        - Models
      summary: /api/v1/models/compatibility_mapping
      description: Returns a list of model compatibility mappings and the associated model.
      operationId: listModelCompatibilityMapping
      parameters:
        - schema:
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
            default: text
            description: Filter models by type.
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
                    $ref: '#/components/schemas/ModelCompatibilitySchema'
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
        '401':
          description: Authentication failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StandardError'
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
    ModelCompatibilitySchema:
      type: object
      additionalProperties:
        type: string
      description: List of available models
      example:
        gpt-4o: zai-org-glm-5-1
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