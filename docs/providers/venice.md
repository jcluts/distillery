# Grok Imagine

VENICE_INFERENCE_KEY_iAXgCdVmlAoM3v9DRrjRDXiOjeiGbrSLaqQRk3AQ3f

## CURL

curl https://api.venice.ai/api/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-imagine-image","prompt":"","size":"1024x1024","response_format":"b64_json"}'

## JS
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'YOUR_API_KEY',
  baseURL: 'https://api.venice.ai/api/v1',
});

const response = await client.images.generate({
  model: 'grok-imagine-image',
  prompt: "",
  size: '1024x1024',
  response_format: 'b64_json',
});

// Response contains base64 image data
console.log(response.data[0].b64_json.slice(0, 100) + '...');