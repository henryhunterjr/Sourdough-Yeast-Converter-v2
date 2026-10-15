/**
 * Baker's math. One function, one definition of every number.
 *
 * Only components in DOUGH_COMPONENTS take part. Reference lines
 * ("all of the levain") are skipped so a preferment is never counted twice.
 */
import { DOUGH_COMPONENTS, type Analysis, type Ingredient, type Leavening, type Recipe } from './model.js';
import { waterFractionOf } from './ingredients.js';

/** Flour share of a starter at hydration h (percent). */
export function starterFlourFraction(hydrationPct: number): number {
  return 100 / (100 + hydrationPct);
}

/** Water share of a starter at hydration h (percent). */
export function starterWaterFraction(hydrationPct: number): number {
  return hydrationPct / (100 + hydrationPct);
}

/** Fill in flour and water fractions for one ingredient. */
export function resolveFractions(ing: Ingredient, starterHydration: number): Required<Pick<Ingredient, 'flourFraction' | 'waterFraction'>> {
  if (ing.role === 'starter') {
    return {
      flourFraction: starterFlourFraction(starterHydration),
      waterFraction: starterWaterFraction(starterHydration),
    };
  }
  return {
    flourFraction: ing.flourFraction ?? (ing.role === 'flour' ? 1 : 0),
    waterFraction: ing.waterFraction ?? waterFractionOf(ing.name, ing.role),
  };
}

/** Ingredients that count toward the dough formula. */
export function doughIngredients(recipe: Recipe): Ingredient[] {
  return recipe.components
    .filter(c => DOUGH_COMPONENTS.has(c.kind))
    .flatMap(c => c.ingredients)
    .filter(i => !i.isReference);
}

export function analyze(recipe: Recipe): Analysis {
  const h = recipe.starterHydration;
  const items = doughIngredients(recipe);

  let totalFlour = 0, totalWater = 0, prefermentedFlour = 0;
  let salt = 0, yeast = 0, sugar = 0, fat = 0, eggs = 0, dairy = 0;

  for (const i of items) {
    const f = resolveFractions(i, h);
    totalFlour += i.grams * f.flourFraction;
    totalWater += i.grams * f.waterFraction;
    if (i.role === 'starter') prefermentedFlour += i.grams * f.flourFraction;
    switch (i.role) {
      case 'salt': salt += i.grams; break;
      case 'yeast': yeast += i.grams; break;
      case 'sweetener': sugar += i.grams; break;
      case 'fat': fat += i.grams; break;
      case 'egg': eggs += i.grams; break;
      case 'dairy': dairy += i.grams; break;
    }
  }

  // Flour in a preferment component counts as prefermented even when it is
  // listed as plain flour (a levain build section).
  for (const c of recipe.components) {
    if (c.kind !== 'preferment') continue;
    for (const i of c.ingredients) {
      if (i.isReference || i.role === 'starter') continue;
      prefermentedFlour += i.grams * resolveFractions(i, h).flourFraction;
    }
  }

  const pct = (x: number) => (totalFlour > 0 ? (x / totalFlour) * 100 : 0);
  const sugarPct = pct(sugar);
  const fatPct = pct(fat);
  const richness: Analysis['richness'] =
    sugarPct > 15 || fatPct > 15 ? 'sweet' : sugarPct > 5 || fatPct > 5 || pct(dairy) > 20 ? 'enriched' : 'lean';

  const hasStarter = items.some(i => i.role === 'starter') || recipe.components.some(c => c.kind === 'preferment');
  const hasYeast = yeast > 0;
  const leavening: Leavening = hasStarter && hasYeast ? 'both' : hasStarter ? 'sourdough' : hasYeast ? 'yeast' : 'none';

  return {
    totalFlour, totalWater,
    hydration: pct(totalWater),
    prefermentedFlour, prefermentedFlourPct: pct(prefermentedFlour),
    salt, saltPct: pct(salt),
    yeast, yeastPct: pct(yeast),
    sugar, sugarPct,
    fat, fatPct,
    eggs, dairy,
    richness, leavening,
  };
}

export interface Check { level: 'error' | 'warning' | 'info'; message: string }

/** Sanity checks on a recipe before or after conversion. Plain facts, no coaching. */
export function sanityCheck(recipe: Recipe): Check[] {
  const a = analyze(recipe);
  const out: Check[] = [];
  if (a.totalFlour < 100) out.push({ level: 'error', message: `Only ${Math.round(a.totalFlour)}g of flour found. A dough needs at least 100g.` });
  if (a.totalFlour > 5000) out.push({ level: 'warning', message: `${Math.round(a.totalFlour)}g of flour is a bakery-sized batch. Check the amounts.` });
  if (a.saltPct > 3.5) out.push({ level: 'error', message: `Salt is ${a.saltPct.toFixed(1)}% of flour. Above 3.5% is almost certainly a typo.` });
  if (a.saltPct > 0 && a.saltPct < 1) out.push({ level: 'info', message: `Salt is ${a.saltPct.toFixed(1)}% of flour. Most bread sits between 1.8% and 2.2%.` });
  const hasTangzhong = recipe.components.some(c => c.kind === 'tangzhong');
  if (a.hydration > 110 && !hasTangzhong) out.push({ level: 'error', message: `Hydration works out to ${a.hydration.toFixed(0)}%. That is batter, not dough. Check flour and liquid.` });
  if (a.hydration < 50 && a.richness === 'lean') out.push({ level: 'warning', message: `Hydration is ${a.hydration.toFixed(0)}%, very stiff for a lean dough.` });
  if (a.leavening === 'both') out.push({ level: 'warning', message: 'Both yeast and starter are present. Hybrid recipes convert as sourdough; the yeast is dropped.' });
  if (a.leavening === 'none') out.push({ level: 'error', message: 'No yeast or starter found.' });
  if (a.yeastPct > 2.5) out.push({ level: 'warning', message: `Yeast is ${a.yeastPct.toFixed(1)}% of flour, far above the usual 0.5% to 1.5%.` });
  return out;
}
