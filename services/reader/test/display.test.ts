import { describe, expect, it } from 'vitest';
import { analyze, convertToSourdough, convertToYeast } from '@bgb/dough-core';
import { readRecipe, originalLine, formatAmount, toRecipe, anthropicProvider } from '../src/index.js';
import { DISPLAY_FIXTURES, PREP_FIXTURES } from './fixtures/display.js';

describe('display preservation with deterministic provider fixtures', () => {
  for (const { text, read } of DISPLAY_FIXTURES) {
    it(`preserves ${read.title}: actual built-in sample, exact weights, analysis and conversion`, async () => {
      const ai = await readRecipe(text, { name: 'fixture', async read() { return JSON.stringify(read); } });
      const parser = await readRecipe(text, null);
      const display = (r: typeof ai) => r.recipe.components.map(c => ({
        name: c.name, kind: c.kind, lines: c.ingredients.map(i => [i.grams, i.original?.text ?? i.name]),
      }));
      expect(ai.source).toBe('model');
      expect(parser.source).toBe('parser');
      expect(display(ai)).toEqual(display(parser));
      expect(ai.recipe.steps).toEqual(parser.recipe.steps);
      expect(analyze(ai.recipe)).toEqual(analyze(parser.recipe));
      const convert = read.language === 'es' ? convertToYeast : convertToSourdough;
      const numbers = (r: typeof ai.recipe) => r.components.map(c => c.ingredients.map(i => i.grams));
      expect(numbers(convert(ai.recipe).recipe)).toEqual(numbers(convert(parser.recipe).recipe));
      expect(ai.flags.filter(f => f.level !== 'info')).toEqual([]);
    });
  }

  it('removes only notes solely about originally empty sections and never mutates the reading', async () => {
    const read = structuredClone(DISPLAY_FIXTURES[0]!.read);
    read.components.push({ kind: 'other', name: '', ingredients: [] });
    const keep = [
      'For the pan: grease quantity is unclear.',
      '"For the pan" is empty; the yeast amount is smudged.',
      'The salt amount was hard to read.',
    ];
    read.uncertainties = ['"For the pan" may be a transcription artifact.', 'For the pan has no ingredients.', ...keep];
    const before = structuredClone(read);
    toRecipe(read, DISPLAY_FIXTURES[0]!.text, 100, []);
    expect(read).toEqual(before);
    const result = await readRecipe(DISPLAY_FIXTURES[0]!.text, { name: 'fixture', async read() { return JSON.stringify(read); } });
    expect(result.uncertainties).toEqual(keep);
    expect(result.recipe.components.map(c => c.name)).toEqual(['Dough']);
    expect(result.recipe.steps[2]!.text).toContain('greased 9x5 pan');
  });

  it('keeps warnings when an ingredient section becomes empty because a line cannot be converted', async () => {
    const read = structuredClone(DISPLAY_FIXTURES[0]!.read);
    read.components.push({ kind: 'other', name: 'Extras', ingredients: [{
      amount: 1, unit: 'bucket', name: 'mystery powder', note: '', role: 'other', isFinishing: false, isReference: false,
    }] });
    read.uncertainties = ['Extras has no ingredients.'];
    const result = await readRecipe(DISPLAY_FIXTURES[0]!.text, { name: 'fixture', async read() { return JSON.stringify(read); } });
    expect(result.uncertainties).toEqual(read.uncertainties);
    expect(result.flags.some(f => f.level === 'error' && f.where?.component === 'Extras')).toBe(true);
    expect(result.recipe.components.some(c => c.name === 'Extras')).toBe(false);
  });

  it('keeps a section note when a populated section has the same name as an empty one', async () => {
    const read = structuredClone(DISPLAY_FIXTURES[0]!.read);
    read.components.push({ kind: 'dough', name: 'Dough', ingredients: [] });
    read.uncertainties = ['Dough is empty.'];
    const result = await readRecipe(DISPLAY_FIXTURES[0]!.text, { name: 'fixture', async read() { return JSON.stringify(read); } });
    expect(result.uncertainties).toEqual(read.uncertainties);
  });

  for (const [note, name, language] of PREP_FIXTURES) {
    it(`preserves the schema note ${note}, with and without a source line`, async () => {
      const ri = { amount: 75, unit: 'g', name, note, role: 'fat', isReference: false, isFinishing: false } as const;
      const text = `75g ${name}, ${note}`;
      expect(originalLine(ri, text)).toBe(text);
      expect(originalLine(ri, '')).toBe(`75 g ${name}, ${note}`);
      const read = { title: null, language, components: [{ kind: 'dough', name: 'Dough', ingredients: [ri] }], steps: [], uncertainties: [], transcript: '' };
      const r = await readRecipe(text, { name: 'fixture', async read() { return JSON.stringify(read); } });
      expect(r.recipe.components[0]!.ingredients[0]!.original!.text).toBe(text);
    });
  }

  it('matches full ingredient identity, amount and unit, and keeps repeated lines separate', () => {
    const flour = { amount: 1, unit: 'cup', name: 'bread flour', note: '', role: 'flour', isReference: false, isFinishing: false } as const;
    expect(originalLine(flour, '1 cup rye flour\n1 cup bread flour')).toBe('1 cup bread flour');
    expect(originalLine(flour, '• 1   cup bread flour')).toBe('• 1   cup bread flour');
    const salt = { ...flour, amount: 1.5, unit: 'teaspoons', name: 'salt', role: 'salt' } as const;
    expect(originalLine(salt, '1 1/2 cups salt\nMix salt for 1 1/2 minutes.')).toBe('1 1/2 teaspoons salt');
    const butter = { ...flour, amount: 75, unit: 'g', name: 'butter', role: 'fat' } as const;
    const used = new Set<number>();
    const source = '75g butter, melted\n75g butter, softened';
    expect(originalLine(butter, source, used)).toBe('75g butter, melted');
    expect(originalLine(butter, source, used)).toBe('75g butter, softened');
    const egg = { ...flour, amount: 1, unit: '', name: 'egg', role: 'egg' } as const;
    expect(originalLine(egg, '1. Beat the egg until smooth.')).toBe('1 egg');
  });

  it('formats exact baker fractions while preserving arbitrary decimals', () => {
    for (const [n, expected] of [[1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'], [3.5, '3 1/2'], [1.25, '1 1/4']] as const) {
      expect(formatAmount(n)).toBe(expected);
    }
    for (const n of [0.001, 1.009, 0.24, 0.32, 0.333, 0.49, 0.667, 1.23456789, 2.667]) {
      expect(formatAmount(n)).toBe(String(n));
      const line = { amount: n, unit: 'cups', name: 'bread flour', note: 'divided', role: 'flour', isReference: false, isFinishing: false } as const;
      expect(originalLine(line, '')).toBe(`${n} cups bread flour, divided`);
    }
  });

  it('keeps the Anthropic request free of temperature (mock transport, no live API call)', async () => {
    let body: Record<string, unknown> = {};
    const provider = anthropicProvider({ apiKey: 'test-placeholder', fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ content: [{ type: 'text', text: '{}' }] });
    } });
    await provider.read({ text: '500g flour' });
    expect(body).not.toHaveProperty('temperature');
  });
});

describe('long Pantry prints no longer get cut off (Oct 18 work order, item 4)', () => {
  it('asks for enough output tokens and reports a cut-off answer instead of returning half-written JSON', async () => {
    const { MAX_OUTPUT_TOKENS, ProviderError } = await import('../src/providers.js');
    let body: Record<string, unknown> = {};
    const ok = anthropicProvider({ apiKey: 'test-placeholder', fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' });
    } });
    await ok.read({ text: '500g flour' });
    expect(body.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(12000);

    const cut = anthropicProvider({ apiKey: 'test-placeholder', fetchImpl: async () =>
      Response.json({ content: [{ type: 'text', text: '{"title":"Cranberry' }], stop_reason: 'max_tokens' }) });
    await expect(cut.read({ text: '500g flour' })).rejects.toBeInstanceOf(ProviderError);
    await expect(cut.read({ text: '500g flour' })).rejects.toThrow(/cut off/);
  });
});
