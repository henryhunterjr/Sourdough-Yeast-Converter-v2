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
import { providerFromEnv, type Provider } from './providers.js';

export interface HandlerOptions {
  provider?: Provider | null;
  /** Allowed origins for CORS. Default: '*'. */
  allowOrigin?: string;
  /** Hard cap on pasted text, in characters. Default 20,000. */
  maxChars?: number;
}

export function handler(opts: HandlerOptions = {}) {
  const provider = opts.provider === undefined ? providerFromEnv() : opts.provider;
  const origin = opts.allowOrigin ?? '*';
  const maxChars = opts.maxChars ?? 20_000;
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

    if (path.endsWith('/read')) {
      const text = typeof body.text === 'string' ? body.text : '';
      if (!text.trim()) return json({ error: 'text is required' }, 400);
      if (text.length > maxChars) return json({ error: `text is over ${maxChars} characters` }, 413);
      const result = await readRecipe(text, provider, { starterHydration });
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
      } else if (typeof body.text === 'string' && body.text.trim()) {
        if (body.text.length > maxChars) return json({ error: `text is over ${maxChars} characters` }, 413);
        read = await readRecipe(body.text, provider, { starterHydration });
        recipe = read.recipe;
      } else {
        return json({ error: 'text or recipe is required' }, 400);
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
