/** Cases from the first code review. Each one was broken once. */
import { describe, expect, it } from 'vitest';
import { analyze, convertToSourdough, convertToYeast, parseAmount, parseRecipeText, rescaleTimes, toGrams, type Recipe } from '../src/index.js';

const g = (line: string) => { const p = parseAmount(line)!; const r = toGrams(p); return { name: p.name, grams: r ? Math.round(r.grams * 10) / 10 : null, role: r?.cls.role }; };

describe('ingredient lines', () => {
  it('reads a spread of real-world lines', () => {
    expect(g('2 ¼ tsp active dry yeast')).toMatchObject({ grams: 7, role: 'yeast' });
    expect(g('1 1/2 cups (180g) bread flour')).toMatchObject({ grams: 180, name: 'bread flour' });
    expect(g('4 Tbsp. unsalted butter, melted')).toMatchObject({ grams: 56.8, name: 'unsalted butter' });
    expect(g('1 stick butter')).toMatchObject({ grams: 113 });
    expect(g('2 large eggs, beaten')).toMatchObject({ grams: 100, role: 'egg', name: 'eggs' });
    expect(g('1/4 cup honey')).toMatchObject({ grams: 85 });
    expect(g('500 g harina 000')).toMatchObject({ grams: 500, role: 'flour' });
    expect(g('2 cucharaditas de sal')).toMatchObject({ grams: 12, role: 'salt' });
    expect(g('1 packet yeast')).toMatchObject({ grams: 7 });
    expect(g('1 cup milk, warmed to 110°F')).toMatchObject({ grams: 244, role: 'dairy', name: 'milk' });
    expect(g('Bread flour 500g')).toMatchObject({ grams: 500 });
    expect(g('1 cup milk chocolate chips')).toMatchObject({ role: 'inclusion' });
    expect(g('1 tsp instant espresso powder')).toMatchObject({ role: 'liquid' });
    expect(g('2 tbsp wheat germ')).toMatchObject({ role: 'inclusion' });
    expect(g('1 T peanut butter')).toMatchObject({ role: 'fat', grams: 16.1 });
  });
});

describe('parser', () => {
  it('does not turn "Pinch of salt" or "Salt to taste" into a section', () => {
    const { recipe, issues } = parseRecipeText(`Loaf
500g bread flour
Pinch of salt
Salt to taste
350g water
5g instant yeast`);
    expect(recipe.components).toHaveLength(1);
    const a = analyze(recipe);
    expect(a.totalFlour).toBe(500);
    expect(a.totalWater).toBe(350);
    expect(issues.some(i => /to taste/.test(i.reason))).toBe(true);
  });

  it('routes egg wash to a topping and keeps optional lines', () => {
    const { recipe } = parseRecipeText(`Rolls
500g bread flour
300g water
5g instant yeast
10g salt
optional: 50g raisins
1 egg white for egg wash`);
    const dough = recipe.components.find(c => c.kind === 'dough')!;
    expect(dough.ingredients.some(i => /raisins/.test(i.name))).toBe(true);
    expect(dough.ingredients.some(i => /egg/.test(i.name))).toBe(false);
    expect(recipe.components.find(c => c.kind === 'topping')!.ingredients[0]!.grams).toBe(33);
  });

  it('Spanish "pan" headings are not the pan-grease section', () => {
    const { recipe } = parseRecipeText(`Masa de pan
500g harina de fuerza
350g agua
10g sal
5g levadura instantánea`);
    expect(recipe.components.map(c => c.kind)).toEqual(['dough']);
  });
});

describe('conversions', () => {
  const sd: Recipe = parseRecipeText(`Loaf
450g bread flour
300g water
100g sourdough starter
10g salt`).recipe;
  const yeasted: Recipe = parseRecipeText(`Loaf
500g bread flour
350g water
5g instant yeast
10g salt`).recipe;

  it('leaves an already-converted recipe alone', () => {
    expect(convertToSourdough(sd).recipe).toEqual(sd);
    expect(convertToYeast(yeasted).recipe).toEqual(yeasted);
  });

  it('does not double the yeast on a hybrid recipe', () => {
    const hybrid = parseRecipeText(`Loaf
500g bread flour
350g water
50g sourdough starter
2g instant yeast
10g salt`).recipe;
    const r = convertToYeast(hybrid).recipe;
    const yeast = r.components[0]!.ingredients.filter(i => i.role === 'yeast');
    expect(yeast).toHaveLength(1);
    expect(Math.round(yeast[0]!.grams * 2) / 2).toBe(5.5);
  });
});

describe('method editor', () => {
  it('scales only the rise clause, not kneading, folds, baking or the fridge', () => {
    const steps = [
      { text: 'Knead 10 minutes until smooth, then let rise 90 minutes until doubled.' },
      { text: 'Fold every 30 minutes during the first hour of the bulk rise, then rest 2 hours.' },
      { text: 'Proof 45 minutes, and preheat the oven to 450°F for 30 minutes.' },
      { text: 'Or proof in the fridge overnight, 12 to 16 hours.' },
    ];
    const out = convertToSourdough({ ...yeastedBase(), steps }).recipe.steps.map(s => s.text);
    expect(out[1]).toBe('Knead 10 minutes until smooth, then let rise 5.5 hours until doubled.');
    expect(out[2]).toBe('Fold every 30 minutes during the first hour of the bulk rise, then rest 2 hours.');
    expect(out[3]).toBe('Proof 2.5 hours, and preheat the oven to 450°F for 30 minutes.');
    expect(out[4]).toBe('Or proof in the fridge overnight, 12 to 16 hours.');
  });

  it('replaces only the yeast-proofing sentence and keeps the rest of the step', () => {
    const steps = [{ text: 'Proof the yeast in the water until foamy. Mix in the flour. Let rise 1 hour. Bake 30 minutes at 450°F.' }];
    const out = convertToSourdough({ ...yeastedBase(), steps }).recipe.steps[1]!.text;
    expect(out).toMatch(/^Tear the levain into pieces/);
    expect(out).toMatch(/Mix in the flour\. Let rise 3\.5 hours\. Bake 30 minutes at 450°F\./);
  });

  it('turns "5g yeast" into "all of the levain", not "5g levain"', () => {
    const steps = [{ text: 'Mix 5g yeast with the water, then add the flour.' }];
    const out = convertToSourdough({ ...yeastedBase(), steps }).recipe.steps[1]!.text;
    expect(out).toBe('Mix all of the levain with the water, then add the flour.');
  });

  it('removes only the build sentence when converting to yeast', () => {
    const steps = [{ text: 'Feed your starter 12 hours before so it is ripe. Mix the levain with the water and bulk ferment 5 to 6 hours.' }];
    const out = convertToYeast(parseRecipeText(`Loaf\n450g bread flour\n300g water\n100g sourdough starter\n10g salt`).recipe && { ...sdBase(), steps }).recipe.steps[1]!.text;
    expect(out).toBe('The levain build is no longer needed. Mix the yeast with the water and bulk ferment 85 to 105 minutes.');
  });

  it('handles mixed fractions, "an hour and a half", and the 5-minute floor', () => {
    expect(rescaleTimes('rise 1 1/2 hours', 2).text).toBe('rise 3 hours');
    expect(rescaleTimes('rise an hour and a half', 2).text).toBe('rise 3 hours');
    expect(rescaleTimes('rest 5 minutes', 1 / 4).text).toBe('rest 5 minutes');
    expect(rescaleTimes('fermentar 2 horas y media', 2).text).toBe('fermentar 5 horas');
  });
});

function yeastedBase(): Recipe {
  return parseRecipeText(`Loaf\n500g bread flour\n350g water\n5g instant yeast\n10g salt`).recipe;
}
function sdBase(): Recipe {
  return parseRecipeText(`Loaf\n450g bread flour\n300g water\n100g sourdough starter\n10g salt`).recipe;
}
