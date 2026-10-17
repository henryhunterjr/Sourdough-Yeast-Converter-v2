/**
 * The two conversions. Pure functions: recipe in, recipe out, plus notes.
 * All arithmetic is exact; rounding happens only in format.ts.
 */
import { ROUND } from './units.js';
import { analyze, resolveFractions, starterFlourFraction, starterWaterFraction } from './analyze.js';
import type { Component, Ingredient, Recipe, YeastKind } from './model.js';
import { editMethodToSourdough, editMethodToYeast } from './method.js';
import { composeStructuredMethod } from './structuredMethod.js';

export interface Note { level: 'info' | 'warning'; message: string }

export interface ToSourdoughOptions {
  /** Share of total flour that ferments in the levain. Default 0.20. */
  prefermentedFlour?: number;
  /**
   * Hydration of the finished levain, percent. 'liquid' = 100, 'stiff' = 50.
   * Default: liquid for lean doughs, stiff for enriched and sweet doughs.
   */
  levainHydration?: number | 'liquid' | 'stiff';
  /** Seed starter as a share of levain flour. Default 0.40. */
  seedRatio?: number;
}

export interface Conversion {
  recipe: Recipe;
  notes: Note[];
  /** Present for yeast-to-sourdough: the build as separate numbers. */
  levain?: { seed: number; flour: number; water: number; total: number; hydration: number; prefermentedFlourPct: number };
  /** Present for sourdough-to-yeast. */
  yeast?: { instant: number; activeDry: number; fresh: number; pct: number };
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function convertToSourdough(input: Recipe, opts: ToSourdoughOptions = {}): Conversion {
  const recipe = clone(input);
  const notes: Note[] = [];
  const a = analyze(recipe);
  if (a.leavening === 'sourdough') {
    return { recipe, notes: [{ level: 'info', message: 'This recipe is already sourdough. Nothing was changed.' }] };
  }
  if (a.leavening === 'both') notes.push({ level: 'info', message: 'The recipe used both a preferment and yeast. The yeast was removed and a levain built; any yeasted poolish or biga is left as written.' });

  const h = recipe.starterHydration;
  const pct = opts.prefermentedFlour ?? 0.20;
  const seedRatio = opts.seedRatio ?? 0.40;
  const levainHyd =
    opts.levainHydration === 'liquid' ? 100 :
    opts.levainHydration === 'stiff' ? 50 :
    typeof opts.levainHydration === 'number' ? opts.levainHydration :
    a.richness === 'lean' ? 100 : 50;

  const F = a.totalFlour;
  const L = F * pct;                                   // levain flour, total
  const seed = L * seedRatio;                          // grams of the baker's starter
  const seedFlour = seed * starterFlourFraction(h);
  const seedWater = seed * starterWaterFraction(h);
  const addFlour = L - seedFlour;
  let addWater = L * (levainHyd / 100) - seedWater;
  if (addWater < 0) {
    notes.push({ level: 'warning', message: `Your ${h}% starter is wetter than a ${levainHyd}% levain allows. Water in the levain build was set to 0; the dough water absorbs the difference.` });
    addWater = 0;
  }
  const levainWaterTotal = seedWater + addWater;

  // --- Take flour out of the dough, proportionally across its flours ------
  const dough = recipe.components.filter(c => c.kind === 'dough');
  const doughFlours = dough.flatMap(c => c.ingredients.filter(i => i.role === 'flour' && !i.isReference));
  const doughFlourTotal = doughFlours.reduce((s, i) => s + i.grams, 0);
  if (doughFlourTotal < L) {
    throw new Error(`The dough holds ${doughFlourTotal}g of flour but the levain needs ${L.toFixed(1)}g. Lower the prefermented-flour share.`);
  }
  // The whole levain flour (the seed's flour plus what we add) comes out of the
  // dough, so total flour stays exactly what the recipe had.
  const levainFlourLines: Ingredient[] = doughFlours.map(f => {
    const share = f.grams / doughFlourTotal;
    f.grams -= L * share;
    return { name: f.name, grams: addFlour * share, role: 'flour' };
  });

  // --- Take water out of the dough: water first, then liquid dairy --------
  let remaining = levainWaterTotal;
  const take = (ings: Ingredient[]) => {
    for (const i of ings) {
      if (remaining <= 1e-9) break;
      const wf = resolveFractions(i, h).waterFraction;
      if (wf <= 0) continue;
      const available = i.grams * wf;
      const used = Math.min(available, remaining);
      i.grams -= used / wf;
      remaining -= used;
    }
  };
  take(dough.flatMap(c => c.ingredients.filter(i => i.role === 'liquid')));
  take(dough.flatMap(c => c.ingredients.filter(i => i.role === 'dairy')));
  if (remaining > 0.5) {
    notes.push({ level: 'warning', message: `The levain holds ${levainWaterTotal.toFixed(0)}g of water but the dough only had ${(levainWaterTotal - remaining).toFixed(0)}g of liquid to give up. Hydration will rise by about ${((remaining / F) * 100).toFixed(1)} points. A stiffer levain would avoid this.` });
  }
  for (const c of dough) c.ingredients = c.ingredients.filter(i => i.grams > 0.25);

  // --- Drop the yeast, add the levain reference ---------------------------
  const removedYeast: string[] = [];
  for (const c of recipe.components) {
    c.ingredients = c.ingredients.filter(i => {
      if (i.role === 'yeast') { removedYeast.push(i.name); return false; }
      return true;
    });
  }

  const levain: Component = {
    kind: 'preferment',
    name: 'Levain',
    ingredients: ([
      { name: recipe.language === 'es' ? `masa madre activa (${h}% hidratación)` : `active sourdough starter (${h}% hydration)`, grams: seed, role: 'starter' },
      ...levainFlourLines,
      { name: recipe.language === 'es' ? 'agua' : 'water', grams: addWater, role: 'liquid' },
    ] as Ingredient[]).filter(i => i.grams > 0.25),
  };
  // The total is the sum of the lines as the baker will see them (whole grams),
  // so "36g + 71g + 27g" always adds up to the figure shown.
  const levainTotal = levain.ingredients.reduce((a, i) => a + ROUND.grams(i.grams), 0);
  const mainDough = dough[0];
  if (!mainDough) throw new Error('No dough component found.');
  mainDough.ingredients.unshift({
    name: recipe.language === 'es' ? 'todo el levain' : 'all of the levain',
    grams: levainTotal,
    role: 'starter',
    isReference: true,
  });
  recipe.components.unshift(levain);

  if (a.richness !== 'lean' && levainHyd <= 65) notes.push({ level: 'info', message: `Enriched dough: the levain is built stiff (${levainHyd}%) to keep the flavor mild and the dough workable. Expect bulk fermentation to run 4 to 7 hours.` });
  if (removedYeast.length === 0) notes.push({ level: 'info', message: 'No yeast was found to remove.' });

  recipe.steps = composeStructuredMethod(input, recipe, 'to-sourdough') ?? editMethodToSourdough(recipe.steps, {
    language: recipe.language ?? 'en',
    richness: a.richness,
    levain: { seed, flour: addFlour, water: addWater, hydration: h },
  });

  return {
    recipe, notes,
    levain: { seed, flour: addFlour, water: addWater, total: levainTotal, hydration: levainHyd, prefermentedFlourPct: pct * 100 },
  };
}

export interface ToYeastOptions {
  /** Instant yeast as a share of total flour. Default 0.01. */
  yeastPct?: number;
  kind?: YeastKind;
}

export function convertToYeast(input: Recipe, opts: ToYeastOptions = {}): Conversion {
  const recipe = clone(input);
  const notes: Note[] = [];
  const h = recipe.starterHydration;
  const before = analyze(recipe);
  if (before.leavening === 'yeast') {
    return { recipe, notes: [{ level: 'info', message: 'This recipe already uses yeast. Nothing was changed.' }] };
  }
  // Hybrid: drop the existing yeast so it isn't doubled.
  for (const c of recipe.components) c.ingredients = c.ingredients.filter(i => i.role !== 'yeast');

  const doughs = recipe.components.filter(c => c.kind === 'dough');
  const mainDough = doughs[0];
  if (!mainDough) throw new Error('No dough component found.');

  // Collect flour and water that currently live in starters and preferments.
  let flourBack = 0, waterBack = 0;
  const flourByName = new Map<string, number>();

  for (const c of recipe.components) {
    if (c.kind === 'preferment') {
      for (const i of c.ingredients) {
        if (i.isReference) continue;
        const f = resolveFractions(i, h);
        if (i.role === 'flour') { flourByName.set(i.name, (flourByName.get(i.name) ?? 0) + i.grams); }
        else if (i.role === 'starter') { flourBack += i.grams * f.flourFraction; waterBack += i.grams * f.waterFraction; }
        else if (i.role === 'liquid') { waterBack += i.grams * f.waterFraction; }
        else { mainDough.ingredients.push(i); } // salt or sugar in a levain: carry it over
      }
      continue;
    }
    if (c.kind === 'dough') {
      c.ingredients = c.ingredients.filter(i => {
        if (i.role !== 'starter') return true;
        if (!i.isReference) {
          const f = resolveFractions(i, h);
          flourBack += i.grams * f.flourFraction;
          waterBack += i.grams * f.waterFraction;
        }
        return false;
      });
    }
  }
  recipe.components = recipe.components.filter(c => c.kind !== 'preferment');

  // Put named preferment flours back by name, the starter's flour proportionally.
  const doughFlours = doughs.flatMap(c => c.ingredients.filter(i => i.role === 'flour'));
  for (const [name, g] of flourByName) {
    const match = doughFlours.find(f => f.name.toLowerCase() === name.toLowerCase());
    if (match) match.grams += g;
    else { const ing: Ingredient = { name, grams: g, role: 'flour' }; mainDough.ingredients.push(ing); doughFlours.push(ing); }
  }
  const doughFlourTotal = doughFlours.reduce((s, i) => s + i.grams, 0);
  if (flourBack > 0) {
    if (doughFlourTotal > 0) for (const f of doughFlours) f.grams += flourBack * (f.grams / doughFlourTotal);
    else mainDough.ingredients.push({ name: recipe.language === 'es' ? 'harina' : 'flour', grams: flourBack, role: 'flour' });
  }
  if (waterBack > 0) {
    const water = doughs.flatMap(c => c.ingredients).find(i => i.role === 'liquid');
    if (water) water.grams += waterBack;
    else mainDough.ingredients.push({ name: recipe.language === 'es' ? 'agua' : 'water', grams: waterBack, role: 'liquid' });
  }

  // Yeast.
  const after = analyze(recipe);
  const pct = opts.yeastPct ?? 0.01;
  const instant = after.totalFlour * pct;
  const r2 = (n: number) => Math.round(n * 2) / 2;
  const yeast = { instant: r2(instant), activeDry: r2(instant * 1.25), fresh: Math.round(instant * 3), pct: Math.round(pct * 1000) / 10 };
  const kind = opts.kind ?? 'instant';
  const grams = kind === 'instant' ? instant : kind === 'active-dry' ? yeast.activeDry : yeast.fresh;
  const name =
    recipe.language === 'es'
      ? kind === 'instant' ? 'levadura instantánea' : kind === 'active-dry' ? 'levadura seca activa' : 'levadura fresca'
      : kind === 'instant' ? 'instant yeast' : kind === 'active-dry' ? 'active dry yeast' : 'fresh yeast';
  mainDough.ingredients.push({ name, grams, role: 'yeast', yeastKind: kind });

  const Name = name[0]!.toUpperCase() + name.slice(1);
  notes.push({ level: 'info', message: recipe.language === 'es'
    ? `${Name} al ${(grams / after.totalFlour * 100).toFixed(1)}% de la harina (instantánea ${yeast.instant}g, seca activa ${yeast.activeDry}g o fresca ${yeast.fresh}g son intercambiables).`
    : `${Name} at ${(grams / after.totalFlour * 100).toFixed(1)}% of flour (instant ${yeast.instant}g, active dry ${yeast.activeDry}g, fresh ${yeast.fresh}g are interchangeable).` });

  recipe.steps = composeStructuredMethod(input, recipe, 'to-yeast') ?? editMethodToYeast(recipe.steps, { language: recipe.language ?? 'en', richness: after.richness, yeastKind: kind });

  return { recipe, notes, yeast };
}
