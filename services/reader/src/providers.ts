/**
 * Model providers. Each one takes the recipe text and returns the raw JSON
 * string the model produced. Swapping providers is a one-line change in the
 * caller. Keys come from the environment; nothing here logs them.
 */
import { READ_RECIPE_JSON_SCHEMA, SYSTEM_PROMPT } from './schema.js';

export interface ReadImage { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
export interface ReadInput { text?: string; images?: ReadImage[] }

export interface Provider {
  name: string;
  read(input: ReadInput): Promise<string>;
}

const userText = (input: ReadInput) =>
  input.images?.length
    ? `Read the recipe in ${input.images.length > 1 ? 'these images' : 'this image'} and return the JSON object. Transcribe the text faithfully into "transcript".${input.text ? `\n\nAdditional text:\n${input.text}` : ''}`
    : `Read this recipe and return the JSON object.\n\n<recipe>\n${input.text ?? ''}\n</recipe>`;

/** Anthropic Messages API with constrained JSON output. */
export function anthropicProvider(opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch } ): Provider {
  const model = opts.model ?? 'claude-haiku-5-5';
  const f = opts.fetchImpl ?? fetch;
  return {
    name: `anthropic:${model}`,
    async read(input) {
      const content: unknown[] = (input.images ?? []).map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } }));
      content.push({ type: 'text', text: userText(input) });
      const res = await f('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
          output_config: { format: { type: 'json_schema', schema: READ_RECIPE_JSON_SCHEMA } },
        }),
      });
      if (!res.ok) throw new ProviderError(`Anthropic ${res.status}: ${await safeText(res)}`, res.status);
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const block = data.content?.find(b => b.type === 'text');
      if (!block?.text) throw new ProviderError('Anthropic returned no text block', 502);
      return block.text;
    },
  };
}

/** Google Gemini with a response schema. */
export function geminiProvider(opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): Provider {
  const model = opts.model ?? 'gemini-2.5-flash';
  const f = opts.fetchImpl ?? fetch;
  return {
    name: `gemini:${model}`,
    async read(input) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const parts: unknown[] = (input.images ?? []).map(im => ({ inlineData: { mimeType: im.mediaType, data: im.data } }));
      parts.push({ text: userText(input) });
      const res = await f(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseJsonSchema: READ_RECIPE_JSON_SCHEMA,
          },
        }),
      });
      if (!res.ok) throw new ProviderError(`Gemini ${res.status}: ${await safeText(res)}`, res.status);
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const out = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
      if (!out) throw new ProviderError('Gemini returned no text', 502);
      return out;
    },
  };
}

/** Pick a provider from environment variables. ANTHROPIC_API_KEY wins if both are set. */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): Provider | null {
  if (env.ANTHROPIC_API_KEY) return anthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.READER_MODEL });
  if (env.GEMINI_API_KEY) return geminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.READER_MODEL });
  return null;
}

export class ProviderError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ProviderError'; }
}

async function safeText(res: Response): Promise<string> {
  try { return (await res.text()).slice(0, 300); } catch { return ''; }
}
