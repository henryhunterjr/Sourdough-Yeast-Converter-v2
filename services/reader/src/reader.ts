/**
 * readRecipe: text in, dough-core Recipe out.
 *
 *   1. Ask the model for the ReadRecipe shape (what the baker wrote).
 *   2. Validate it against the schema in code. Reject anything off-shape.
 *   3. Convert every amount to grams with dough-core's unit table. The model
 *      never supplies a weight.
 *   4. Ground-check: every number the model reported must appear in the
 *      source text. One that doesn't is flagged, not trusted.
 *   5. Compare with the deterministic parser. Where they disagree on a
 *      dough-side ingredient by more than 10%, flag it for the baker.
 *   6. If the model fails for any reason, return the deterministic parse,
 *      labelled as such.
 */
import {
  parseRecipeText, toGrams, classify, cleanName,
  type Recipe, type Component, type Ingredient, type Role, type ComponentKind,
} from '@bgb/dough-core';
import { COMPONENT_KINDS, ROLES, type ReadRecipe, type ReadIngredient } from './schema.js';
import type { Provider, ReadInput } from './providers.js';

export interface Flag {
  level: 'error' | 'warning' | 'info';
  message: string;
  /** Component and ingredient the flag is about, when it is about one line. */
  where?: { component: string; ingredient?: string };
}

export interface ReadResult {
  recipe: Recipe;
  /** 'model' when the model's reading was used; 'parser' when it fell back. */
  source: 'model' | 'parser';
  providerName?: string;
  flags: Flag[];
  /** What the model said it was unsure about, verbatim. */
  uncertainties: string[];
  /** For photo or scan input: the model's transcription, so the baker can compare. */
  transcript?: string;
}

export interface ReadOptions {
  starterHydration?: number;
  /** When set, the deterministic parser is also run and the two are compared. Default true. */
  crossCheck?: boolean;
}

export async function readRecipe(input: string | ReadInput, provider: Provider | null, opts: ReadOptions = {}): Promise<ReadResult> {
  const starterHydration = opts.starterHydration ?? 100;
  const inp: ReadInput = typeof input === 'string' ? { text: input } : input;
  const hasImages = !!inp.images?.length;
  const text = inp.text ?? '';

  const fallback = () => {
    const p = parseRecipeText(text, starterHydration);
    return {
      recipe: p.recipe,
      source: 'parser' as const,
      flags: p.issues.map(i => ({ level: 'warning' as const, message: `${i.reason} ("${i.line}")` })),
      uncertainties: [],
    };
  };
  const empty = (message: string): ReadResult => ({
    recipe: { components: [], steps: [], starterHydration },
    source: 'parser', flags: [{ level: 'error', message }], uncertainties: [],
  });

  if (!provider) {
    if (hasImages && !text.trim()) return empty('Reading a photo or scan needs the AI reader, which is not configured. Paste the recipe as text instead.');
    return { ...fallback(), flags: [{ level: 'info', message: 'No AI reader configured; used the built-in parser.' }, ...fallback().flags] };
  }

  let raw: string;
  try {
    raw = await provider.read(inp);
  } catch (e) {
    if (hasImages && !text.trim()) return empty(`AI reader unavailable (${(e as Error).message}). Try again, or paste the recipe as text.`);
    const fb = fallback();
    return { ...fb, flags: [{ level: 'warning', message: `AI reader unavailable (${(e as Error).message}); used the built-in parser.` }, ...fb.flags] };
  }

  const parsed = parseModelJson(raw);
  if (!parsed.ok) {
    if (hasImages && !text.trim()) return empty(`AI reader returned an unusable answer (${parsed.error}). Try a clearer photo, or paste the recipe as text.`);
    const fb = fallback();
    return { ...fb, flags: [{ level: 'warning', message: `AI reader returned an unusable answer (${parsed.error}); used the built-in parser.` }, ...fb.flags] };
  }

  // For images the model's own transcription stands in for the source text:
  // amounts are checked against it and the deterministic parser runs on it.
  const sourceText = text.trim() ? text : parsed.value.transcript;
  const flags: Flag[] = [];
  if (hasImages) {
    flags.push({ level: 'info', message: sourceText.trim()
      ? 'Read from a photo or scan. Amounts were checked against the transcription; compare the lines below with your original.'
      : 'Read from a photo or scan with no transcription, so amounts could not be checked. Compare every line with your original.' });
  }
  const recipe = toRecipe(parsed.value, sourceText, starterHydration, flags);

  if (opts.crossCheck !== false && sourceText.trim()) {
    const det = parseRecipeText(sourceText, starterHydration).recipe;
    flags.push(...crossCheck(recipe, det));
  }

  return { recipe, source: 'model', providerName: provider.name, flags, uncertainties: parsed.value.uncertainties, transcript: hasImages ? parsed.value.transcript : undefined };
}

// ---------------------------------------------------------------------------

type Validated = { ok: true; value: ReadRecipe } | { ok: false; error: string };

export function parseModelJson(raw: string): Validated {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1]!;
  let obj: unknown;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'not valid JSON' }; }
  return validateReadRecipe(obj);
}

/** Hand-rolled validation so the service has no runtime dependencies. */
export function validateReadRecipe(obj: unknown): Validated {
  if (!isObj(obj)) return { ok: false, error: 'top level is not an object' };
  const title = obj.title;
  if (!(title === null || typeof title === 'string')) return { ok: false, error: 'title must be string or null' };
  if (obj.language !== 'en' && obj.language !== 'es') return { ok: false, error: 'language must be en or es' };
  if (!Array.isArray(obj.components) || obj.components.length === 0) return { ok: false, error: 'components must be a non-empty array' };
  if (!Array.isArray(obj.steps) || !obj.steps.every(s => typeof s === 'string')) return { ok: false, error: 'steps must be string[]' };
  if (!Array.isArray(obj.uncertainties) || !obj.uncertainties.every(s => typeof s === 'string')) return { ok: false, error: 'uncertainties must be string[]' };
  if (obj.transcript === undefined) obj.transcript = '';
  if (typeof obj.transcript !== 'string') return { ok: false, error: 'transcript must be a string' };

  for (const [ci, c] of obj.components.entries()) {
    if (!isObj(c)) return { ok: false, error: `component ${ci} is not an object` };
    if (!(COMPONENT_KINDS as readonly string[]).includes(String(c.kind))) return { ok: false, error: `component ${ci} has bad kind "${String(c.kind)}"` };
    if (typeof c.name !== 'string') return { ok: false, error: `component ${ci} has no name` };
    if (!Array.isArray(c.ingredients)) return { ok: false, error: `component ${ci} ingredients is not an array` };
    for (const [ii, ing] of c.ingredients.entries()) {
      if (!isObj(ing)) return { ok: false, error: `ingredient ${ci}.${ii} is not an object` };
      if (!(ing.amount === null || (typeof ing.amount === 'number' && Number.isFinite(ing.amount) && ing.amount >= 0))) return { ok: false, error: `ingredient ${ci}.${ii} amount is bad` };
      if (typeof ing.unit !== 'string' || typeof ing.name !== 'string' || !ing.name.trim()) return { ok: false, error: `ingredient ${ci}.${ii} unit or name is bad` };
      if (!(ROLES as readonly string[]).includes(String(ing.role))) return { ok: false, error: `ingredient ${ci}.${ii} has bad role "${String(ing.role)}"` };
      // Tolerate missing booleans and notes from looser providers.
      if (ing.note === undefined) ing.note = '';
      if (ing.isReference === undefined) ing.isReference = false;
      if (ing.isFinishing === undefined) ing.isFinishing = false;
      if (typeof ing.note !== 'string' || typeof ing.isReference !== 'boolean' || typeof ing.isFinishing !== 'boolean') return { ok: false, error: `ingredient ${ci}.${ii} flags are bad` };
    }
  }
  return { ok: true, value: obj as unknown as ReadRecipe };
}

function isObj(x: unknown): x is Record<string, any> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// ---------------------------------------------------------------------------

/** Build the engine's Recipe from the model's reading. All grams come from dough-core. */
export function toRecipe(read: ReadRecipe, sourceText: string, starterHydration: number, flags: Flag[]): Recipe {
  const components: Component[] = [];
  let finishing: Component | null = null;

  for (const c of read.components) {
    const comp: Component = { kind: c.kind as ComponentKind, name: c.name, ingredients: [] };
    for (const ri of c.ingredients) {
      const ing = toIngredient(ri, c, read.components, sourceText, flags);
      if (!ing) continue;
      if (ri.isFinishing && (c.kind === 'dough' || c.kind === 'preferment' || c.kind === 'tangzhong' || c.kind === 'soaker')) {
        if (!finishing) finishing = { kind: 'topping', name: read.language === 'es' ? 'Para terminar' : 'Finishing', ingredients: [] };
        finishing.ingredients.push(ing);
        continue;
      }
      comp.ingredients.push(ing);
    }
    components.push(comp);
  }
  if (finishing) components.push(finishing);

  if (!components.some(c => c.kind === 'dough')) {
    const first = components.find(c => c.ingredients.length > 0);
    if (first) { first.kind = 'dough'; flags.push({ level: 'info', message: `No section was marked as the dough; treating "${first.name}" as the dough.` }); }
  }

  return {
    title: read.title ?? undefined,
    components,
    steps: read.steps.map(text => ({ text })),
    starterHydration,
    language: read.language,
  };
}

function toIngredient(ri: ReadIngredient, comp: { name: string; kind: string }, all: ReadRecipe['components'], sourceText: string, flags: Flag[]): Ingredient | null {
  const where = { component: comp.name, ingredient: ri.name };
  const name = cleanName(ri.name);
  const cls = classify(name);
  // The model's role wins only when the class table has no opinion.
  const role: Role = cls.role === 'other' ? (ri.role as Role) : cls.role;

  if (ri.isReference) {
    const built = all.filter(c => c.kind === 'preferment').flatMap(c => c.ingredients);
    // The reference's weight is the preferment's weight; resolve it from the built lines.
    let grams = 0;
    for (const b of built) {
      const g = gramsFor(b, flags, { component: 'preferment', ingredient: b.name });
      if (g !== null) grams += g;
    }
    return { name, grams, role: 'starter', isReference: true };
  }

  if (ri.amount === null) {
    if (/pinch|pizca/i.test(ri.unit + ' ' + ri.name + ' ' + ri.note)) return { name, grams: 0.3, role };
    flags.push({ level: 'warning', message: `"${ri.name}" has no amount; left out of the math.`, where });
    return null;
  }

  const grams = gramsFor(ri, flags, where);
  if (grams === null) return null;

  // Ground check: the amount the model reported must appear in the source.
  if (!amountAppearsInText(ri.amount, sourceText)) {
    flags.push({ level: 'warning', message: `The reader reported ${ri.amount} ${ri.unit} ${ri.name}, but that number is not in the recipe text. Check it.`, where });
  }

  const ing: Ingredient = { name, grams, role, original: { amount: ri.amount, unit: ri.unit, text: `${ri.amount} ${ri.unit} ${ri.name}`.trim() } };
  if (cls.yeastKind) ing.yeastKind = cls.yeastKind;
  return ing;
}

function gramsFor(ri: ReadIngredient, flags: Flag[], where: Flag['where']): number | null {
  if (ri.amount === null) return null;
  const unit = normalizeUnit(ri.unit);
  const r = toGrams({ amount: ri.amount, unit, name: ri.name, text: '' });
  if (!r) {
    flags.push({ level: 'error', message: `Can't convert "${ri.amount} ${ri.unit} ${ri.name}" to grams. Enter it in grams.`, where });
    return null;
  }
  return r.grams;
}

/** Map the model's free-text unit onto what dough-core's table knows. */
function normalizeUnit(u: string): string {
  const s = u.trim().toLowerCase().replace(/\.$/, '');
  if (!s) return 'each';
  if (/^(large|medium|small|extra[- ]large|xl|jumbo|whole|grande|mediano|pequeño)$/.test(s)) return 'each';
  if (/^(c|cup|cups)$/.test(s)) return 'cup';
  if (/^(tbsp?|tbs|tablespoons?|t)$/i.test(u.trim()) && u.trim() !== 't') return 'tbsp';
  if (/^(tsp|teaspoons?|t)$/.test(s) && u.trim() !== 'T') return 'tsp';
  if (/^(g|gr|gram|grams|gramos?)$/.test(s)) return 'g';
  if (/^(ml|milliliters?|millilitres?|mililitros?)$/.test(s)) return 'ml';
  if (/^(oz|ounces?|onzas?)$/.test(s)) return 'oz';
  if (/^(lb|lbs|pounds?|libras?)$/.test(s)) return 'lb';
  if (/^(kg|kilos?|kilograms?)$/.test(s)) return 'kg';
  return s;
}

/** True if the number (or a fraction that equals it) is written in the text. */
export function amountAppearsInText(amount: number, text: string): boolean {
  // Strip step numbers ("1." / "2)") so "4" is not found in "4. Bake...".
  const t = text.replace(/,/g, '.').replace(/^\s*\d+[.)]\s+/gm, ' ');
  const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  // A match must stand alone: not inside a larger number or a fraction.
  const standalone = (c: string) => new RegExp(`(^|[^\\d\\/.])${esc(c)}(?![\\d\\/]|\\.\\d)`).test(t);
  const candidates = new Set<string>();
  candidates.add(String(amount));
  candidates.add(amount.toFixed(1).replace(/\.0$/, ''));
  candidates.add(amount.toFixed(2).replace(/\.?0+$/, ''));
  const whole = Math.floor(amount);
  const frac = amount - whole;
  const fracs: Record<string, string[]> = {
    '0.5': ['1/2', '½'], '0.25': ['1/4', '¼'], '0.75': ['3/4', '¾'],
    '0.33': ['1/3', '⅓'], '0.67': ['2/3', '⅔'], '0.125': ['1/8', '⅛'], '0.375': ['3/8'], '0.625': ['5/8'], '0.875': ['7/8'],
  };
  for (const [k, forms] of Object.entries(fracs)) {
    if (Math.abs(Number(k) - frac) < 0.01) for (const f of forms) candidates.add(whole ? `${whole} ${f}` : f).add(whole ? `${whole}${f}` : f);
  }
  return [...candidates].some(c => c && standalone(c));
}

// ---------------------------------------------------------------------------

/** Compare the model's reading with the deterministic parser on dough-side ingredients. */
function crossCheck(model: Recipe, det: Recipe): Flag[] {
  const flags: Flag[] = [];
  const doughKinds = new Set(['dough', 'preferment', 'tangzhong', 'soaker']);
  const sum = (r: Recipe, role: Role) =>
    r.components.filter(c => doughKinds.has(c.kind)).flatMap(c => c.ingredients).filter(i => i.role === role && !i.isReference).reduce((s, i) => s + i.grams, 0);
  for (const role of ['flour', 'liquid', 'dairy', 'starter', 'salt', 'yeast', 'fat', 'sweetener', 'egg'] as Role[]) {
    const a = sum(model, role), b = sum(det, role);
    if (a === 0 && b === 0) continue;
    const diff = Math.abs(a - b) / Math.max(a, b);
    if (diff > 0.10) {
      flags.push({ level: 'warning', message: `The AI reader and the built-in parser disagree on ${role}: ${Math.round(a)}g vs ${Math.round(b)}g. Check the ${role} lines.` });
    }
  }
  return flags;
}
