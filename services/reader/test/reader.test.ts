import { describe, expect, it } from 'vitest';
import { analyze } from '@bgb/dough-core';
import { readRecipe, validateReadRecipe, amountAppearsInText, originalLine, formatAmount, handler, type Provider } from '../src/index.js';
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
  uncertainties: [], transcript: '',
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
      steps: [], uncertainties: [], transcript: '',
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

describe('photo and scan input', () => {
  const IMG = { data: 'AAAA', mediaType: 'image/jpeg' as const };
  const read = {
    title: 'Loaf', language: 'en',
    components: [{ kind: 'dough', name: 'Dough', ingredients: [
      { amount: 500, unit: 'g', name: 'bread flour', note: '', role: 'flour', isReference: false, isFinishing: false },
      { amount: 350, unit: 'g', name: 'water', note: '', role: 'liquid', isReference: false, isFinishing: false },
      { amount: 10, unit: 'g', name: 'salt', note: '', role: 'salt', isReference: false, isFinishing: false },
      { amount: 7, unit: 'g', name: 'instant yeast', note: '', role: 'yeast', isReference: false, isFinishing: false },
    ] }],
    steps: ['Mix. Rise 1 hour. Bake 40 minutes.'], uncertainties: ['The yeast amount was smudged; read as 7g.'],
    transcript: 'Loaf\n500g bread flour\n350g water\n10g salt\n7g instant yeast\nMix. Rise 1 hour. Bake 40 minutes.',
  };

  it('sends images to the provider and grounds amounts against the transcript', async () => {
    let seen: any;
    const p: Provider = { name: 'fake', async read(input) { seen = input; return JSON.stringify(read); } };
    const r = await readRecipe({ images: [IMG] }, p);
    expect(seen.images).toHaveLength(1);
    expect(r.source).toBe('model');
    expect(r.transcript).toMatch(/500g bread flour/);
    expect(Math.round(analyze(r.recipe).hydration)).toBe(70);
    expect(r.uncertainties[0]).toMatch(/smudged/);
    expect(r.flags.some(f => /Read from a photo/.test(f.message))).toBe(true);
    expect(r.flags.filter(f => f.level === 'warning')).toEqual([]);
  });

  it('flags an amount missing from the transcript and a parser disagreement', async () => {
    const bad = structuredClone(read); bad.components[0]!.ingredients[1]!.amount = 420;
    const r = await readRecipe({ images: [IMG] }, fake(JSON.stringify(bad)));
    expect(r.flags.some(f => /not in the recipe text/.test(f.message))).toBe(true);
    expect(r.flags.some(f => /disagree on liquid/.test(f.message))).toBe(true);
  });

  it('cannot read a photo without a provider, and says so', async () => {
    const r = await readRecipe({ images: [IMG] }, null);
    expect(r.recipe.components).toEqual([]);
    expect(r.flags[0]).toMatchObject({ level: 'error' });
    expect(r.flags[0]!.message).toMatch(/needs the AI reader/);
  });

  it('http: accepts images, rejects bad ones', async () => {
    const h = handler({ provider: fake(JSON.stringify(read)) });
    const post = (body: unknown) => h(new Request('https://x.test/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    expect((await post({ images: [IMG] })).status).toBe(200);
    expect((await post({ images: [{ data: 'AAAA', mediaType: 'image/bmp' }] })).status).toBe(400);
    expect((await post({ images: [IMG, IMG, IMG, IMG, IMG] })).status).toBe(200);
    expect((await post({ images: Array(13).fill(IMG) })).status).toBe(413);
    expect((await post({ images: [{ ...IMG, data: 'A'.repeat(4_000_001) }] })).status).toBe(413);
    expect((await post({})).status).toBe(400);
  });
});

describe('display parity with the built-in parser (work order: AI reader cleanup)', () => {
  const withPan = structuredClone(CUPS_READ);
  withPan.components.push({ kind: 'other', name: 'For the pan', ingredients: [] });
  withPan.uncertainties = ['"For the pan" may be a transcription artifact.'];

  it('hides a section with no ingredients', async () => {
    const r = await readRecipe(CUPS_TEXT, fake(JSON.stringify(withPan)));
    expect(r.recipe.components.map(c => c.name)).toEqual(['Dough']);
    expect(r.uncertainties).toEqual([]);
  });

  it('shows the recipe\'s own wording, fractions and prep notes included', async () => {
    const r = await readRecipe(CUPS_TEXT, fake(JSON.stringify(withPan)));
    const lines = r.recipe.components[0]!.ingredients.map(i => i.original!.text);
    expect(lines).toContain('3 1/2 cups bread flour');
    expect(lines).toContain('1 1/4 cups warm water');
    expect(lines).toContain('2 tablespoons butter, softened');
    expect(lines).toContain('1 1/2 teaspoons salt');
    // Same lines the parser shows.
    const det = await readRecipe(CUPS_TEXT, null);
    expect(lines).toEqual(det.recipe.components[0]!.ingredients.map(i => i.original!.text));
    // Numbers unchanged.
    expect(r.recipe.components[0]!.ingredients.map(i => Math.round(i.grams))).toEqual(det.recipe.components[0]!.ingredients.map(i => Math.round(i.grams)));
  });

  it('rebuilds a line with baker\'s fractions and the note when the source line is not found', () => {
    const ri = { amount: 3.5, unit: 'cups', name: 'bread flour', note: 'sifted', role: 'flour', isReference: false, isFinishing: false } as const;
    expect(originalLine(ri, 'nothing here')).toBe('3 1/2 cups bread flour, sifted');
    expect(formatAmount(0.25)).toBe('1/4');
    expect(formatAmount(2 + 2 / 3)).toBe('2 2/3');
    expect(formatAmount(2)).toBe('2');
    expect(formatAmount(1.3)).toBe('1.3');
  });

  it('holds for the cinnamon rolls and the Spanish loaf: AI and parser show the same lines', async () => {
    const { parseRecipeText } = await import('@bgb/dough-core');
    const rolls = `Cinnamon Rolls\n\nDough\n4 cups (500g) all-purpose flour\n1 cup (240g) whole milk, warm\n1/3 cup (67g) sugar\n1 large egg\n1/3 cup (75g) butter, melted\n1 teaspoon salt\n2 1/4 teaspoons instant yeast\n\nFilling\n1/2 cup (113g) butter, softened\n3/4 cup (150g) brown sugar\n2 tablespoons cinnamon\n\nMethod\n1. Mix. Rise 1 1/2 hours.\n2. Bake at 350°F for 25 minutes.`;
    const es = `Pan de masa madre\n\nLevain\n20g masa madre activa\n50g harina de fuerza\n50g agua\n\nMasa\ntodo el levain\n450g harina de fuerza\n300g agua\n10g sal\n\nMétodo\n1. Forma y deja levar 2 horas.`;
    // Build the "AI reading" from the parser's own output so the only variable is the display path.
    const fromParser = (text: string, lang: 'en' | 'es'): ReadRecipe => {
      const p = parseRecipeText(text, 100).recipe;
      return {
        title: p.title ?? null, language: lang, transcript: '', uncertainties: [],
        steps: p.steps.map(s => s.text),
        components: p.components.map(c => ({ kind: c.kind, name: c.name, ingredients: c.ingredients.map(i => ({
          amount: i.isReference ? null : (i.original?.amount ?? i.grams), unit: i.isReference ? '' : (i.original?.unit ?? 'g'), name: i.name, note: '', role: i.role, isReference: !!i.isReference, isFinishing: false,
        })) })),
      };
    };
    for (const [text, lang] of [[rolls, 'en'], [es, 'es']] as const) {
      const ai = await readRecipe(text, fake(JSON.stringify(fromParser(text, lang))));
      const det = await readRecipe(text, null);
      const show = (r: typeof ai) => r.recipe.components.map(c => [c.name, ...c.ingredients.map(i => `${Math.round(i.grams)} ${i.original?.text ?? i.name}`)]);
      expect(show(ai)).toEqual(show(det));
    }
  });
});
