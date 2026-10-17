import { describe, expect, it } from 'vitest';
import type { Recipe } from '@bgb/dough-core';
import { conversionSafety } from '../src/conversionSafety';

const base = (steps: string[], yeast = 6.5): Recipe => ({
  title: 'Cranberry Walnut Bread',
  language: 'en',
  starterHydration: 100,
  components: [{ name: 'Dough', kind: 'dough', ingredients: [
    { name: 'bread flour', grams: 625, role: 'flour' },
    { name: 'water', grams: 517, role: 'liquid' },
    { name: 'fine sea salt', grams: 10, role: 'salt' },
    { name: 'instant yeast', grams: yeast, role: 'yeast' },
  ] }],
  steps: steps.map(text => ({ text })),
});

describe('conversion safety blocks misleading adapted methods', () => {
  it('rejects the member-supplied 50g yeast instructions with a 6.5g yeast ingredient', () => {
    const warnings = conversionSafety(base([
      'Build Your yeast',
      'Mix 50g yeast with 100g water and 100g bread flour in a clean jar. Cover overnight.',
      'Add 500g bread flour.',
    ]), 'to-yeast');
    expect(warnings.some(w => w.includes('50g yeast'))).toBe(true);
    expect(warnings.some(w => w.includes('starter-building'))).toBe(true);
    expect(warnings.some(w => w.includes('starter'))).toBe(true);
  });

  it('flags stale 500g flour and 350g water when dough now has 400g flour and 250g water', () => {
    const recipe = base(['In a large bowl, stir the levain into 350g water.', 'Add 500g bread flour.'], 0);
    recipe.components[0]!.ingredients[0]!.grams = 400;
    recipe.components[0]!.ingredients[1]!.grams = 250;
    const warnings = conversionSafety(recipe, 'to-sourdough');
    expect(warnings.some(w => w.includes('350g water'))).toBe(true);
    expect(warnings.some(w => w.includes('500g flour'))).toBe(true);
  });

  it('allows a coherent yeasted method and ordinary soaking steps', () => {
    expect(conversionSafety(base(['Stir 6.5g instant yeast into 517g water.', 'Mix in 625g bread flour.', 'Soak cranberries in warm water for 15 minutes.']), 'to-yeast')).toEqual([]);
  });

  it('does not confuse oven temperatures with ingredient quantities', () => {
    expect(conversionSafety(base(['Preheat to 450°F. Bake covered for 20 minutes, then at 425°F.']), 'to-yeast')).toEqual([]);
  });
});
