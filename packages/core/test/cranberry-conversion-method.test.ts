import { describe, expect, it } from 'vitest';
import { analyze, convertToSourdough, convertToYeast, parseRecipeText } from '../src/index.js';

const SOURDOUGH = [
'Cranberry Walnut Bread',
'Levain',
'50g active sourdough starter',
'100g water',
'100g bread flour',
'Dough',
'all of the levain',
'375g water',
'500g bread flour',
'10g fine sea salt',
'75g dried cranberries',
'75g walnuts',
'Instructions',
'1. Build Your Levain',
'2. Mix 50g active sourdough starter with 100g water and 100g bread flour in a clean jar.',
'3. Combine starter and water',
'4. Mix 50g active sourdough starter with 100g water in a clean jar.',
'5. Add flour',
'6. Add 100g bread flour and stir until combined.',
'7. Rest overnight',
'8. Cover loosely and let sit overnight for 8-10 hours.',
'9. Prepare Inclusions',
'10. Toast walnuts at 350°F for 5-7 minutes.',
'11. Soak dried cranberries in warm water for 15 minutes. Drain well.',
'12. Mix the Dough',
'13. Dissolve levain',
'14. In a large bowl, stir all of the levain into 375g water.',
'15. Add flour',
'16. Add 500g bread flour and mix until no dry flour remains.',
'17. Autolyse',
'18. Cover and let rest for 45 minutes.',
'19. Add Salt and Develop Strength',
'20. Sprinkle 10g salt over the dough.',
'21. Rest for 30 minutes.',
'22. Stretch and Folds with Inclusions',
'23. First set of folds without inclusions. Rest 30 minutes.',
'24. Fold in half the cranberries and walnuts. Rest 30 minutes.',
'25. Fold in remaining cranberries and walnuts.',
'26. Bulk Fermentation',
'27. Let dough ferment for 4 to 5 hours until visibly puffy.',
'28. Shape Your Loaf',
'29. Pre-shape and bench rest for 20 minutes.',
'30. Shape into a boule; place into a floured banneton.',
'31. Cold Proof',
'32. Refrigerate for 8-14 hours.',
'33. Bake Your Loaf',
'34. Preheat a Dutch oven to 450°F. Leave the loaf in the fridge until ready to load it.',
'35. Turn the cold loaf onto parchment, score, and place into hot Dutch oven.',
'36. Bake covered at 450°F for 20 minutes.',
'37. Remove lid and bake at 425°F for 20 to 25 minutes until 205°F internally.',
'38. Cool on a rack.',
].join('\n');

const YEASTED = [
'Cranberry Walnut Bread',
'Dough',
'500g bread flour',
'350g water',
'10g fine sea salt',
'2g instant yeast',
'75g dried cranberries',
'75g walnuts',
'Instructions',
'1. Prepare Inclusions',
'2. Toast walnuts at 350°F for 5-7 minutes.',
'3. Soak dried cranberries in warm water for 15 minutes. Drain well.',
'4. Mix the Dough',
'5. Dissolve yeast',
'6. In a large bowl stir 2g instant yeast into 350g water.',
'7. Add flour',
'8. Add 500g bread flour and mix until no dry flour remains.',
'9. Rest for 30 minutes.',
'10. Add Salt and Build Strength',
'11. Sprinkle 10g salt over the dough.',
'12. Stretch and Folds with Inclusions',
'13. First set of folds without inclusions. Rest 30 minutes.',
'14. Fold in half the cranberries and walnuts. Rest 30 minutes.',
'15. Fold in remaining cranberries and walnuts.',
'16. Bulk Fermentation',
'17. Let rise 3 1/2 to 4 hours, until puffy.',
'18. Shape Your Loaf',
'19. Pre-shape and let rest 20 minutes.',
'20. Final shape and place seam up in banneton.',
'21. Cold Proof',
'22. Refrigerate 8 to 14 hours before baking.',
'23. Bake Your Loaf',
'24. Preheat Dutch oven to 450°F.',
'25. Turn the cold loaf onto parchment, score and bake covered for 20 minutes.',
'26. Remove lid and bake at 425°F for 20–25 minutes.',
'27. Cool on a rack.',
].join('\n');

describe('Cranberry Walnut Pantry export: coherent formula and instructions', () => {
  it('sourdough to yeast removes the whole starter build, never substitutes 50g or 250g yeast, and updates mixing grams', () => {
    const original = parseRecipeText(SOURDOUGH, 100).recipe;
    expect(analyze(original).leavening).toBe('sourdough');
    const converted = convertToYeast(original);
    const a = analyze(converted.recipe);
    expect(a.leavening).toBe('yeast');
    expect(a.totalFlour).toBeCloseTo(625, 5);
    const method = converted.recipe.steps.map(s => s.text).join('\n');
    expect(method).toMatch(/6(?:\.25|\.3|\.5)g instant yeast/i);
    expect(method).toMatch(/500g water/i);
    expect(method).toMatch(/625g bread flour/i);
    expect(method).not.toMatch(/(?:50|250)g (?:instant )?yeast/i);
    expect(method).not.toMatch(/(?:build your|feed|dissolve|mix .*?) (?:levain|starter)/i);
    expect(method).not.toMatch(/(?:jar|doubled by morning)/i);
    expect(method).not.toMatch(/Add 500g bread flour/i);
    expect(method).not.toMatch(/375g water/i);
    expect(method).not.toMatch(/leave the loaf in the fridge|cold loaf/i);
    expect(method).toMatch(/walnuts|cranberries/);
    expect(method).toMatch(/450°F|425°F/);
    expect(method).toMatch(/Final proof:/i);
    expect(converted.recipe.steps.length).toBeGreaterThan(10);
  });

  it('yeasted to sourdough updates mixing flour/water to the reduced dough quantities', () => {
    const original = parseRecipeText(YEASTED, 100).recipe;
    expect(analyze(original).leavening).toBe('yeast');
    const converted = convertToSourdough(original);
    const a = analyze(converted.recipe);
    expect(a.leavening).toBe('sourdough');
    expect(a.totalFlour).toBeCloseTo(500, 5);
    const method = converted.recipe.steps.map(s => s.text).join('\n');
    expect(method).toMatch(/Build the levain:/);
    expect(method).toMatch(/40g active sourdough starter/i);
    expect(method).toMatch(/200g all of the levain/i);
    expect(method).toMatch(/250g water/i);
    expect(method).toMatch(/400g bread flour/i);
    expect(method).not.toMatch(/Add 500g bread flour/i);
    expect(method).not.toMatch(/350g water/i);
    expect(method).not.toMatch(/2g instant yeast/i);
    expect(method).toMatch(/Cold proof:/i);
    expect(method).toMatch(/450°F/i);
    expect(method).toMatch(/walnuts|cranberries/);
  });

  it('keeps original methods completely unchanged for comparison', () => {
    const original = parseRecipeText(SOURDOUGH, 100).recipe;
    const saved = JSON.stringify(original.steps);
    convertToYeast(original);
    expect(JSON.stringify(original.steps)).toBe(saved);
  });
});
