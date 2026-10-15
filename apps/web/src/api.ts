import { parseRecipeText, type Recipe } from '@bgb/dough-core';

export interface Flag { level: 'error' | 'warning' | 'info'; message: string; where?: { component: string; ingredient?: string } }
export interface ReadInput { text?: string; images?: { data: string; mediaType: string }[] }
export interface ReadResult {
  recipe: Recipe;
  transcript?: string;
  source: 'model' | 'parser';
  providerName?: string;
  flags: Flag[];
  uncertainties: string[];
  /** True when the server could not be reached and the parser ran in the browser. */
  offline?: boolean;
}

/** Read in the browser with the deterministic parser. Always available. */
export function readLocally(text: string, starterHydration: number): ReadResult {
  const p = parseRecipeText(text, starterHydration);
  return {
    recipe: p.recipe,
    source: 'parser',
    flags: p.issues.map(i => ({ level: 'warning' as const, message: `${i.reason}: "${i.line}"` })),
    uncertainties: [],
  };
}

/** Ask the server (AI reader with code checks). Falls back to the local parser on any failure. */
export async function readRecipe(input: ReadInput, starterHydration: number, signal?: AbortSignal): Promise<ReadResult> {
  const text = input.text ?? '';
  const hasImages = !!input.images?.length;
  try {
    const res = await fetch('/api/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, images: input.images, starterHydration }),
      signal,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* keep */ }
      throw new Error(msg);
    }
    const data = (await res.json()) as ReadResult;
    if (!data?.recipe?.components) throw new Error('bad payload');
    return data;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    if (hasImages && !text.trim()) {
      return { recipe: { components: [], steps: [], starterHydration }, source: 'parser', flags: [{ level: 'error', message: (e as Error).message }], uncertainties: [], offline: true };
    }
    return { ...readLocally(text, starterHydration), offline: true };
  }
}
