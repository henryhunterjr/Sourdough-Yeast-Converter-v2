import { describe, expect, it } from 'vitest';
import { handler, originAllowed, appOriginsFromEnv } from '../src/index.js';

const fake = { name: 'fake', async read() { return JSON.stringify({ title: 'x', language: 'en', components: [], steps: [], uncertainties: [], transcript: '' }); } };
const post = (h: ReturnType<typeof handler>, origin?: string) =>
  h(new Request('https://x.test/api/read', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify({ text: '500g flour\n300g water\n10g salt\n5g yeast\n1. Mix. Rise 1 hour. Bake.' }) }));

describe('/api/read only serves the converter app (Oct 18 work order, item 5)', () => {
  const origins = appOriginsFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'sourdough-yeast-converter-v2.vercel.app', APP_ORIGINS: 'converter.bakinggreatbread.blog' });

  it('builds the allow list from the deployment, with previews and local dev', () => {
    expect(origins).toContain('sourdough-yeast-converter-v2.vercel.app');
    expect(origins).toContain('converter.bakinggreatbread.blog');
    expect(origins).toContain('localhost:5173');
    expect(originAllowed('https://sourdough-yeast-converter-v2.vercel.app', origins)).toBe(true);
    expect(originAllowed('https://sourdough-yeast-converter-v2-git-cbb9a6-henryhunterjrs-projects.vercel.app', origins)).toBe(true);
    expect(originAllowed('https://sourdough-yeast-converter-v2-jot9nfk9q-henryhunterjrs-projects.vercel.app', origins)).toBe(true);
    expect(originAllowed('https://converter.bakinggreatbread.blog', origins)).toBe(true);
    expect(originAllowed('http://localhost:5173', origins)).toBe(true);
    expect(originAllowed('https://evil.example', origins)).toBe(false);
    expect(originAllowed('https://someone-else.vercel.app', origins)).toBe(false);
    expect(originAllowed('https://sourdough-yeast-converter-v2.vercel.app.evil.example', origins)).toBe(false);
    expect(originAllowed('not a url', origins)).toBe(false);
  });

  it('refuses other origins and missing origins with 403, and answers the app', async () => {
    const h = handler({ provider: fake, allowOrigin: origins });
    expect((await post(h, 'https://evil.example')).status).toBe(403);
    expect((await post(h)).status).toBe(403);
    const ok = await post(h, 'https://sourdough-yeast-converter-v2.vercel.app');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://sourdough-yeast-converter-v2.vercel.app');
    const pre = await h(new Request('https://x.test/api/read', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(pre.status).toBe(403);
  });

  it('keeps the open default for callers that pass nothing', async () => {
    const h = handler({ provider: fake });
    expect((await post(h, 'https://anything.example')).status).toBe(200);
  });
});
