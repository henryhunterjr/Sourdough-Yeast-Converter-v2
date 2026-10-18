import { handler, appOriginsFromEnv } from '@bgb/recipe-reader';
export const config = { runtime: 'edge' };
// Only the converter's own pages may call this; it runs on a paid API key.
// The known hosts are listed as a fallback in case the system env vars are
// not exposed to the edge runtime.
const h = handler({ allowOrigin: [...appOriginsFromEnv(), 'sourdough-yeast-converter-v2.vercel.app', 'sourdough-yeast-converter-v2-*.vercel.app'] });
export default (req: Request) => h(req);
