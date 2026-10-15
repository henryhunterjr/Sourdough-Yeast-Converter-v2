import { describe, expect, it } from 'vitest';
import { analyze } from '@bgb/dough-core';
import { readRecipe, validateReadRecipe, amountAppearsInText, handler, type Provider } from '../src/index.js';
import type { ReadRecipe } from '../src/schema.js';

const fake = (answer: string | (() => string)): Provider => ({
  name: 'fake',
  async read() { return typeof answer === 'function' ? answer() : answer; },
});

const CUPS_TEXT = `Sandwich Loaf
3 1/2 cups bread flour
1 1/4 cups warm water
2 tablespoons butter, softened
2 tablespoons sugar
1 1/2 teaspoons salt
2 1/4 teaspoons instant yeast
Instructions
1. Mix and knead 10 minutes.
2. Rise 1 hour.
3. Shape and proof 45 minutes.
4. Bake at 375°F for 30 minutes.`;

const CUPS_READ: ReadRecipe = {
  title: 'Sandwich Loaf',
  language: 'en',
  components: [{
    kind: 'dough', name: 'Dough', ingredients: [
      { amount: 3.5, unit: 'cups', name: 'bread flour', note: '', role: 'flour', isReference: false, isFinishing: false },
      { amount: 1.25, unit: 'cups', name: 'warm water', note: '', role: 'liquid', isReference: false, isFinishing: false },
      { amount: 2, unit: 'tablespoons', name: 'butter', note: 'softened', role: 'fat', isReference: false, isFinishing: false },
      { amount: 2, unit: 'tablespoons', name: 'sugar', note: '', role: 'sweetener', isReference: false, isFinishing: false },
      { amount: 1.5, unit: 'teaspoons', name: 'salt', note: '', role: 'salt', isReference: false, isFinishing: false },
      { amount: 2.25, unit: 'teaspoons', name: 'instant yeast', note: '', role: 'yeast', isReference: false, isFinishing: false },
    ],
  }],
  steps: ['Mix and knead 10 minutes.', 'Rise 1 hour.', 'Shape and proof 45 minutes.', 'Bake at 375°F for 30 minutes.'],
  uncertainties: [],
};

describe('readRecipe with the model', () => {
  it('converts the model reading to grams through dough-core, never trusting a model weight', async () => {
    const r = await readRecipe(CUPS_TEXT, fake(JSON.stringify(CUPS_READ)));
    expect(r.source).toBe('model');
    const dough = r.recipe.components[0]!;
    const g = (re: RegExp) => Math.round(dough.ingredients.find(i => re.test(i.name))!.grams);
    expect(g(/flour/)).toBe(445);
    expect(g(/water/)).toBe(296);
    expect(g(/butter/)).toBe(28);
    expect(g(/salt/)).toBe(9);
    expect(g(/yeast/)).toBe(7);
    expect(r.recipe.steps).toHaveLength(4);
    expect(r.flags.filter(f => f.level !== 'info')).toEqual([]);
  });

  it('flags an amount the model made up', async () => {
    const bad = structuredClone(CUPS_READ);
    bad.components[0]!.ingredients[0]!.amount = 4;   // text says 3 1/2
    const r = await readRecipe(CUPS_TEXT, fake(JSON.stringify(bad)));
    expect(r.flags.some(f => /not in the recipe text/.test(f.message))).toBe(true);
    expect(r.flags.some(f => /disagree on flour/.test(f.message))).toBe(true);
  });

  it('moves finishing lines out of the dough and resolves levain references', async () => {
    const read: ReadRecipe = {
      title: null, language: 'en',
      components: [
        { kind: 'preferment', name: 'Levain', ingredients: [
          { amount: 20, unit: 'g', name: 'sourdough starter', note: '', role: 'starter', isReference: false, isFinishing: false },
          { amount: 50, unit: 'g', name: 'bread flour', note: '', role: 'flour', isReference: false, isFinishing: false },
          { amount: 50, unit: 'g', name: 'water', note: '', role: 'liquid', isReference: false, isFinishing: false },
        ] },
        { kind: 'dough', name: 'Dough', ingredients: [
          { amount: null, unit: '', name: 'all of the levain', note: '', role: 'starter', isReference: true, isFinishing: false },
          { amount: 450, unit: 'g', name: 'bread flour', note: '', role: 'flour', isReference: false, isFinishing: false },
          { amount: 300, unit: 'g', name: 'water', note: '', role: 'liquid', isReference: false, isFinishing: false },
          { amount: 10, unit: 'g', name: 'salt', note: '', role: 'salt', isReference: false, isFinishing: false },
          { amount: 1, unit: '', name: 'egg', note: 'beaten, for egg wash', role: 'egg', isReference: false, isFinishing: true },
        ] },
      ],
      steps: [], uncertainties: [],
    };
    const text = 'Levain\n20g sourdough starter\n50g bread flour\n50g water\nDough\nall of the levain\n450g bread flour\n300g water\n10g salt\n1 egg, beaten, for egg wash';
    const r = await readRecipe(text, fake(JSON.stringify(read)));
    const a = analyze(r.recipe);
    expect(a.totalFlour).toBeCloseTo(510, 6);
    expect(a.totalWater).toBeCloseTo(360, 6);
    const ref = r.recipe.components[1]!.ingredients.find(i => i.isReference)!;
    expect(ref.grams).toBe(120);
    expect(r.recipe.components.find(c => c.kind === 'topping')!.ingredients[0]!.grams).toBe(50);
    expect(r.recipe.components[1]!.ingredients.some(i => /egg/.test(i.name))).toBe(false);
  });

  it('accepts a fenced answer and tolerates missing optional flags', async () => {
    const loose = { title: null, language: 'en', components: [{ kind: 'dough', name: 'Dough', ingredients: [
      { amount: 500, unit: 'g', name: 'flour', role: 'flour' },
      { amount: 350, unit: 'g', name: 'water', role: 'liquid' },
      { amount: 5, unit: 'g', name: 'yeast', role: 'yeast' },
    ] }], steps: [], uncertainties: [] };
    const r = await readRecipe('500g flour\n350g water\n5g yeast', fake('```json\n' + JSON.stringify(loose) + '\n```'));
    expect(r.source).toBe('model');
    expect(Math.round(analyze(r.recipe).hydration)).toBe(70);
  });
});

describe('fallbacks', () => {
  it('uses the built-in parser when there is no provider', async () => {
    const r = await readRecipe(CUPS_TEXT, null);
    expect(r.source).toBe('parser');
    expect(Math.round(r.recipe.components[0]!.ingredients[0]!.grams)).toBe(445);
  });
  it('uses the built-in parser when the model throws', async () => {
    const r = await readRecipe(CUPS_TEXT, { name: 'down', async read() { throw new Error('503'); } });
    expect(r.source).toBe('parser');
    expect(r.flags[0]!.message).toMatch(/unavailable/);
  });
  it('uses the built-in parser when the model returns junk', async () => {
    const r = await readRecipe(CUPS_TEXT, fake('Sure! Here is the recipe: flour, water...'));
    expect(r.source).toBe('parser');
    expect(r.flags[0]!.message).toMatch(/unusable/);
  });
});

describe('validation', () => {
  it('rejects off-shape answers with a reason', () => {
    expect(validateReadRecipe({})).toMatchObject({ ok: false });
    expect(validateReadRecipe({ title: null, language: 'fr', components: [], steps: [], uncertainties: [] })).toMatchObject({ ok: false, error: /language/ });
    expect(validateReadRecipe({ title: null, language: 'en', components: [{ kind: 'sauce', name: 'x', ingredients: [] }], steps: [], uncertainties: [] })).toMatchObject({ ok: false, error: /kind/ });
    expect(validateReadRecipe({ title: null, language: 'en', components: [{ kind: 'dough', name: 'x', ingredients: [{ amount: -1, unit: 'g', name: 'flour', role: 'flour' }] }], steps: [], uncertainties: [] })).toMatchObject({ ok: false, error: /amount/ });
  });
  it('ground-checks fractions in several spellings', () => {
    expect(amountAppearsInText(3.5, '3 1/2 cups flour')).toBe(true);
    expect(amountAppearsInText(3.5, '3½ cups flour')).toBe(true);
    expect(amountAppearsInText(0.25, '¼ cup honey')).toBe(true);
    expect(amountAppearsInText(2.25, '2 1/4 tsp yeast')).toBe(true);
    expect(amountAppearsInText(120, '1 cup (120g) flour')).toBe(true);
    expect(amountAppearsInText(4, '3 1/2 cups flour')).toBe(false);
  });
});

describe('http handler', () => {
  const h = handler({ provider: fake(JSON.stringify(CUPS_READ)) });
  const post = (path: string, body: unknown) => h(new Request(`https://x.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

  it('reads', async () => {
    const res = await post('/read', { text: CUPS_TEXT });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.source).toBe('model');
    expect(data.recipe.components).toHaveLength(1);
  });
  it('converts text to sourdough in one call', async () => {
    const res = await post('/convert', { text: CUPS_TEXT, direction: 'to-sourdough' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversion.levain.prefermentedFlourPct).toBe(20);
    expect(Math.round(data.analysis.totalFlour)).toBe(445);
    expect(data.conversion.recipe.steps.map((s: any) => s.text).join('\n')).toMatch(/Bake at 375°F for 30 minutes/);
  });
  it('rejects bad input plainly', async () => {
    expect((await post('/convert', { text: CUPS_TEXT, direction: 'sideways' })).status).toBe(400);
    expect((await post('/read', { text: '' })).status).toBe(400);
    expect((await h(new Request('https://x.test/read', { method: 'GET' }))).status).toBe(405);
  });
});
