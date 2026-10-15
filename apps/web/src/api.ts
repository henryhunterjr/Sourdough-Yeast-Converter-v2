import { parseRecipeText, type Recipe } from '@bgb/dough-core';

export interface Flag { level: 'error' | 'warning' | 'info'; message: string; where?: { component: string; ingredient?: string } }
export interface ReadResult {
  recipe: Recipe;
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
export async function readRecipe(text: string, starterHydration: number, signal?: AbortSignal): Promise<ReadResult> {
  try {
    const res = await fetch('/api/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, starterHydration }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ReadResult;
    if (!data?.recipe?.components) throw new Error('bad payload');
    return data;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { ...readLocally(text, starterHydration), offline: true };
  }
}
