/**
 * One HTTP handler, framework-free: (Request) => Promise<Response>.
 * Works as a Vercel Edge/Serverless function, a Supabase edge function, a
 * Cloudflare worker, or behind any Node server that speaks the Fetch API.
 *
 *   POST /read      { text, starterHydration? }           -> ReadResult
 *   POST /convert   { text | recipe, direction, starterHydration?, options? } -> { read?, conversion, analysis, checks }
 */
import { analyze, convertToSourdough, convertToYeast, sanityCheck, type Recipe } from '@bgb/dough-core';
import { readRecipe } from './reader.js';
import { providerFromEnv, type Provider, type ReadInput, type ReadImage } from './providers.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface HandlerOptions {
  provider?: Provider | null;
  /** Allowed origins for CORS. Default: '*'. */
  allowOrigin?: string;
  /** Hard cap on pasted text, in characters. Default 20,000. */
  maxChars?: number;
  /** Max images per request and max base64 characters per image. Defaults 4 and 6,000,000 (~4.5MB). */
  maxImages?: number;
  maxImageChars?: number;
}

export function handler(opts: HandlerOptions = {}) {
  const provider = opts.provider === undefined ? providerFromEnv() : opts.provider;
  const origin = opts.allowOrigin ?? '*';
  const maxChars = opts.maxChars ?? 20_000;
  const maxImages = opts.maxImages ?? 4;
  const maxImageChars = opts.maxImageChars ?? 6_000_000;
  const cors = {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }

    const starterHydration = clampHydration(body.starterHydration);

    const pickInput = (): ReadInput | { error: string; status: number } => {
      const text = typeof body.text === 'string' ? body.text : '';
      if (text.length > maxChars) return { error: `text is over ${maxChars} characters`, status: 413 };
      const images: ReadImage[] = [];
      if (body.images !== undefined) {
        if (!Array.isArray(body.images)) return { error: 'images must be an array', status: 400 };
        if (body.images.length > maxImages) return { error: `at most ${maxImages} images`, status: 413 };
        for (const im of body.images) {
          if (!im || typeof im.data !== 'string' || !IMAGE_TYPES.has(im.mediaType)) return { error: 'each image needs base64 data and a mediaType of image/jpeg, image/png, image/webp or image/gif', status: 400 };
          if (im.data.length > maxImageChars) return { error: 'image too large', status: 413 };
          images.push({ data: im.data, mediaType: im.mediaType });
        }
      }
      if (!text.trim() && images.length === 0) return { error: 'text or images is required', status: 400 };
      return { text, images };
    };

    if (path.endsWith('/read')) {
      const input = pickInput();
      if ('error' in input) return json({ error: input.error }, input.status);
      const result = await readRecipe(input, provider, { starterHydration });
      return json(result);
    }

    if (path.endsWith('/convert')) {
      const direction = body.direction;
      if (direction !== 'to-sourdough' && direction !== 'to-yeast') return json({ error: 'direction must be to-sourdough or to-yeast' }, 400);
      let recipe: Recipe;
      let read;
      if (body.recipe) {
        recipe = body.recipe as Recipe;
        recipe.starterHydration = starterHydration;
      } else {
        const input = pickInput();
        if ('error' in input) return json({ error: input.error }, input.status);
        read = await readRecipe(input, provider, { starterHydration });
        recipe = read.recipe;
      }
      const checks = sanityCheck(recipe);
      if (checks.some(c => c.level === 'error')) return json({ read, checks, error: 'Recipe failed sanity checks' }, 422);
      try {
        const conversion = direction === 'to-sourdough' ? convertToSourdough(recipe, body.options ?? {}) : convertToYeast(recipe, body.options ?? {});
        return json({ read, conversion, analysis: analyze(conversion.recipe), checks: sanityCheck(conversion.recipe) });
      } catch (e) {
        return json({ read, checks, error: (e as Error).message }, 422);
      }
    }

    return json({ error: 'Unknown route. Use /read or /convert.' }, 404);
  };
}

function clampHydration(h: unknown): number {
  const n = typeof h === 'number' ? h : Number(h);
  if (!Number.isFinite(n)) return 100;
  return Math.min(200, Math.max(40, n));
}
