import { describe, expect, it } from 'vitest';
import { analyze, approxVolume, convertToSourdough, convertToYeast, parseRecipeText } from '../src/index.js';

describe('launch blockers (Oct 18, 2026 audit)', () => {
  it('reads "1,000g" as a thousand grams, and "1,5 kg" as a Spanish decimal', () => {
    const { recipe } = parseRecipeText('Big batch\n1,000g bread flour\n700g water\n20g salt\n10g instant yeast\n1. Mix. Rise 1 hour. Bake.', 100);
    expect(analyze(recipe).totalFlour).toBe(1000);
    const es = parseRecipeText('Pan\n1,5 kg harina de fuerza\n1 l agua\n30 g sal\n10 g levadura instantánea\n1. Mezcla.', 100).recipe;
    expect(analyze(es).totalFlour).toBe(1500);
  });

  it('never reads a European kilo or litre decimal as a thousand', () => {
    const cases: [string, number][] = [
      ['0,250 kg harina de fuerza', 250],
      ['1,250 kg harina de fuerza', 1250],
      ['1,500 kg harina de fuerza', 1500],
      ['2,5 kg harina de fuerza', 2500],
      ['1,000 g harina de fuerza', 1000],
      ['2,500g bread flour', 2500],
      ['bread flour 1,000g', 1000],
      ['1 cup (1,000g) bread flour', 1000],
    ];
    for (const [line, grams] of cases) {
      const r = parseRecipeText(`Pan\n${line}\n10 g sal\n1. Mezcla.`, 100).recipe;
      expect(analyze(r).totalFlour, line).toBe(grams);
    }
    const water = parseRecipeText('Pan\n500 g harina\n0,350 l agua\n10 g sal\n1. Mezcla.', 100).recipe;
    expect(analyze(water).hydration).toBeCloseTo(70, 0);
  });

  it('marks every line a conversion changes, so the UI never shows a stale cup measure as current', () => {
    const { recipe } = parseRecipeText('Loaf\n4 cups all-purpose flour\n1 1/2 cups water\n2 tsp salt\n2 1/4 tsp instant yeast\n1. Mix. Rise 1 hour. Bake.', 100);
    const sd = convertToSourdough(recipe).recipe;
    const dough = sd.components.find(c => c.kind === 'dough')!;
    const flour = dough.ingredients.find(i => i.role === 'flour')!;
    const water = dough.ingredients.find(i => i.role === 'liquid')!;
    const salt = dough.ingredients.find(i => i.role === 'salt')!;
    expect(flour.adjustedFrom).toBe(480);
    expect(flour.grams).toBeLessThan(480);
    expect(water.adjustedFrom).toBeGreaterThan(water.grams);
    expect(salt.adjustedFrom).toBeUndefined();
    const back = convertToYeast(sd).recipe.components.find(c => c.kind === 'dough')!;
    expect(back.ingredients.find(i => i.role === 'flour')!.adjustedFrom).toBeDefined();
  });

  it('gives kitchen volumes for adjusted amounts', () => {
    expect(approxVolume('all-purpose flour', 384)).toBe('3¼ cups');
    expect(approxVolume('warm milk', 189)).toBe('¾ cup');
    expect(approxVolume('water', 30)).toBe('2 tbsp');
    expect(approxVolume('harina de fuerza', 381, 'es')).toBe('3 tazas');
  });

  it('the yeast intro sentence never mentions a levain or a build', () => {
    for (const lang of ['en', 'es'] as const) {
      const text = lang === 'en'
        ? 'Loaf\n100g active starter\n350g water\n500g bread flour\n10g salt\n1. Mix all. Bulk 5 hours. Shape. Proof 2 hours. Bake.'
        : 'Pan\n100 g masa madre activa\n350 g agua\n500 g harina de fuerza\n10 g sal\n1. Mezcla todo. Deja levar 5 horas. Forma. Deja levar 2 horas. Hornea.';
      const y = convertToYeast(parseRecipeText(text, 100).recipe).recipe;
      expect(y.steps[0]!.text).not.toMatch(/levain|build|masa madre/i);
    }
  });

  it('only instant yeast is told to skip proofing; active dry and fresh get their own steps', () => {
    const text = 'Loaf\n100g active starter\n350g water\n500g bread flour\n10g salt\n1. Mix all. Bulk 5 hours. Shape. Proof 2 hours. Bake.';
    const recipe = parseRecipeText(text, 100).recipe;
    const instant = convertToYeast(recipe, { kind: 'instant' }).recipe.steps[0]!.text;
    const ady = convertToYeast(recipe, { kind: 'active-dry' }).recipe.steps[0]!.text;
    const fresh = convertToYeast(recipe, { kind: 'fresh' }).recipe.steps[0]!.text;
    expect(instant).toMatch(/instant yeast.*No proofing step needed/);
    expect(ady).toMatch(/105 to 110°F.*5 minutes/);
    expect(ady).not.toMatch(/No proofing|straight into the dry flour/);
    expect(fresh).toMatch(/Crumble the fresh yeast/);
    expect(fresh).not.toMatch(/No proofing|straight into the dry flour/);
  });
});
