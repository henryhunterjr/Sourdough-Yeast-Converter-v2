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
  /**
   * Allowed origins. A single '*' allows every site (the old default). A
   * list allows only those origins: a browser request from any other origin
   * (or with no Origin header at all) is refused with 403, since the AI
   * reader runs on a paid API key. Entries may use a leading '*.' wildcard.
   */
  allowOrigin?: string | string[];
  /** Hard cap on pasted text, in characters. Default 20,000. */
  maxChars?: number;
  /** Up to 12 PDF pages/images, with a bounded combined request size. */
  maxImages?: number;
  maxImageChars?: number;
}

export function handler(opts: HandlerOptions = {}) {
  const provider = opts.provider === undefined ? providerFromEnv() : opts.provider;
  const allowed = opts.allowOrigin ?? '*';
  const maxChars = opts.maxChars ?? 20_000;
  const maxImages = opts.maxImages ?? 12;
  const maxImageChars = opts.maxImageChars ?? 6_000_000;

  return async (req: Request): Promise<Response> => {
    const requestOrigin = req.headers.get('origin');
    const permitted = allowed === '*' || (requestOrigin !== null && originAllowed(requestOrigin, allowed));
    const cors = {
      'access-control-allow-origin': allowed === '*' ? '*' : (permitted ? requestOrigin! : 'null'),
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'vary': 'origin',
    };
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

    if (req.method === 'OPTIONS') return new Response(null, { status: permitted ? 204 : 403, headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!permitted) return json({ error: 'This endpoint only serves the converter app.' }, 403);
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
      if (text.length + images.reduce((n, image) => n + image.data.length, 0) > 4_000_000) return { error: 'Combined input is too large. Split the PDF or use its print version.', status: 413 };
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

/** "https://converter.example.com" against ["converter.example.com", "myapp-*.vercel.app"]. */
export function originAllowed(origin: string, allowed: string | string[]): boolean {
  if (allowed === '*') return true;
  let host: string;
  try { host = new URL(origin).host.toLowerCase(); } catch { return false; }
  for (const entry of Array.isArray(allowed) ? allowed : [allowed]) {
    const e = entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!e) continue;
    if (e === '*') return true;
    // '*' in an entry matches one hostname label or part of one: "*.vercel.app", "myapp-*.vercel.app".
    const re = new RegExp('^' + e.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*') + '$');
    if (re.test(host)) return true;
  }
  return false;
}

/**
 * The origins the converter is served from: production domains, this
 * project's Vercel preview hosts, and local dev. Read from the environment
 * so the list follows the deployment instead of a hard-coded hostname.
 */
export function appOriginsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const out = new Set<string>(['localhost:4173', 'localhost:5173', '127.0.0.1:4173', '127.0.0.1:5173']);
  for (const v of [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL]) if (v) out.add(v);
  for (const v of (env.APP_ORIGINS ?? '').split(',')) if (v.trim()) out.add(v.trim());
  // Every preview of this project lives under <project>-*.vercel.app.
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL ?? '';
  const project = prod.replace(/\.vercel\.app$/, '');
  if (project && project !== prod) out.add(`${project}-*.vercel.app`), out.add(`${project}-git-*.vercel.app`);
  return [...out];
}

function clampHydration(h: unknown): number {
  const n = typeof h === 'number' ? h : Number(h);
  if (!Number.isFinite(n)) return 100;
  return Math.min(200, Math.max(40, n));
}
