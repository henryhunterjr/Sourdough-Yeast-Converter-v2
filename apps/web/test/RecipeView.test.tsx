import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readRecipe } from '@bgb/recipe-reader';
import { convertToSourdough, convertToYeast } from '@bgb/dough-core';
import { RecipeView } from '../src/components/RecipeView';
import { t } from '../src/i18n';
import { DISPLAY_FIXTURES, PREP_FIXTURES } from '../../../services/reader/test/fixtures/display';

describe('RecipeView display parity (deterministic fixtures, no live AI)', () => {
  for (const { text, read } of DISPLAY_FIXTURES) {
    it(`renders the actual ${read.title} sample identically for model and parser data`, async () => {
      const model = await readRecipe(text, { name: 'fixture', async read() { return JSON.stringify(read); } });
      const parser = await readRecipe(text, null);
      const show = (recipe: typeof model.recipe) => renderToStaticMarkup(<RecipeView recipe={recipe} s={t(read.language)} />);
      expect(show(model.recipe)).toBe(show(parser.recipe));
      const convert = read.language === 'es' ? convertToYeast : convertToSourdough;
      expect(show(convert(model.recipe).recipe)).toBe(show(convert(parser.recipe).recipe));
      expect(show(model.recipe)).not.toContain('For the pan');
      const lines = model.recipe.components.flatMap(c => c.ingredients.flatMap(i => i.original ? [i.original.text] : []));
      for (const line of lines) expect(show(model.recipe)).toContain(line);
    });
  }

  for (const [note, name, language] of PREP_FIXTURES) {
    it(`renders gram-only prep notes: ${note}`, async () => {
      const text = `75g ${name}, ${note}`;
      const reading = { title: null, language, transcript: '', uncertainties: [], steps: [], components: [{
        kind: 'dough', name: 'Dough', ingredients: [{ amount: 75, unit: 'g', name, note, role: 'fat', isReference: false, isFinishing: false }],
      }] };
      const model = await readRecipe(text, { name: 'fixture', async read() { return JSON.stringify(reading); } });
      const parser = await readRecipe(text, null);
      for (const { recipe } of [model, parser]) {
        recipe.components.push({ kind: 'other', name: 'Empty artifact', ingredients: [] });
        const html = renderToStaticMarkup(<RecipeView recipe={recipe} s={t(language)} />);
        expect(html).toContain(text);
        expect(html).not.toContain('Empty artifact');
      }
    });
  }

  it('retains meaningful source wording when AI moves warm from the name into its prep note', async () => {
    const { read, text } = DISPLAY_FIXTURES[0]!;
    const reading = structuredClone(read);
    const water = reading.components[0]!.ingredients[1]!;
    water.name = 'water'; water.note = 'warm';
    const model = await readRecipe(text, { name: 'fixture', async read() { return JSON.stringify(reading); } });
    const html = renderToStaticMarkup(<RecipeView recipe={model.recipe} s={t('en')} />);
    expect(html).toContain('1 1/4 cups warm water');
    expect(html).toContain('2 tablespoons butter, softened');
    expect(html).not.toContain('For the pan');
    const parser = await readRecipe(text, null);
    expect(model.recipe.components[0]!.ingredients.map(i => i.grams)).toEqual(parser.recipe.components[0]!.ingredients.map(i => i.grams));
  });
});

describe('changed lines never show the old cup measure as current (Oct 18 audit)', () => {
  it('labels the original measure and gives the new one', async () => {
    const { parseRecipeText } = await import('@bgb/dough-core');
    const { recipe } = parseRecipeText('Rolls\n4 cups all-purpose flour\n1 cup warm milk\n1 packet active dry yeast\n1 tsp salt\n1. Mix. Rise 1 hour. Bake.', 100);
    const html = renderToStaticMarkup(<RecipeView recipe={convertToSourdough(recipe).recipe} s={t('en')} />);
    expect(html).toContain('about 3¼ cups · was: 4 cups all-purpose flour');
    expect(html).toContain('was: 1 cup warm milk');
    expect(html).toContain('1 tsp salt');
    expect(html).not.toContain('was: 1 tsp salt');
  });
});
