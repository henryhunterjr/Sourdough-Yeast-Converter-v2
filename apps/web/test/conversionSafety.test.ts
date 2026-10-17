import { describe, expect, it } from 'vitest';
import type { Recipe } from '@bgb/dough-core';
import { conversionSafety } from '../src/conversionSafety';
import { convertToYeast, convertToSourdough, parseRecipeText } from '@bgb/dough-core';

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
  it('allows printing the corrected PDF-style sourdough-to-yeast conversion', () => {
    const original = parseRecipeText([
      'Cranberry Walnut Bread', 'Levain', '50g sourdough starter', '100g water', '100g bread flour',
      'Dough', 'all of the levain', '375g water', '500g bread flour', '10g salt',
      '75g cranberries', '75g walnuts', 'Instructions',
      '1. Build Your Levain', '2. Mix 50g starter with 100g water and 100g flour overnight.',
      '3. Prepare Inclusions', '4. Toast walnuts.',
      '5. Mix the Dough', '6. Combine 250g levain and 375g water.', '7. Add 500g bread flour.',
      '8. Add Salt and Build Strength', '9. Sprinkle 10g salt.',
      '10. Bulk Fermentation', '11. Ferment 4 hours.',
      '12. Shape Your Loaf', '13. Pre-shape then shape.',
      '14. Cold Proof', '15. Refrigerate 12 hours.',
      '16. Bake Your Loaf', '17. Preheat Dutch oven to 450°F.',
      '18. Score loaf and bake covered for 20 minutes.',
    ].join('\n')).recipe;
    const adapted = convertToYeast(original).recipe;
    expect(conversionSafety(adapted, 'to-yeast')).toEqual([]);
    expect(adapted.steps.map(st => st.text).join(' ')).not.toMatch(/50g yeast|250g yeast|250g levain/);
  });

  it('allows printing the corrected yeasted-to-sourdough conversion', () => {
    const source = parseRecipeText([
      'Cranberry Walnut Bread', 'Dough', '500g bread flour', '350g water', '10g salt', '2g instant yeast',
      '75g cranberries', '75g walnuts', 'Instructions',
      '1. Prepare Inclusions', '2. Toast walnuts.',
      '3. Mix the Dough', '4. Stir 2g yeast into 350g water; add 500g flour.',
      '5. Add Salt and Build Strength', '6. Sprinkle 10g salt.',
      '7. Bulk Fermentation', '8. Bulk ferment 1 hour.',
      '9. Shape Your Loaf', '10. Shape a boule.',
      '11. Cold Proof', '12. Refrigerate overnight.',
      '13. Bake Your Loaf', '14. Preheat Dutch oven to 450°F.',
      '15. Score and bake.',
    ].join('\n')).recipe;
    const adapted = convertToSourdough(source).recipe;
    expect(conversionSafety(adapted, 'to-sourdough')).toEqual([]);
    expect(adapted.steps.map(st => st.text).join(' ')).toMatch(/400g bread flour/);
  });

});
