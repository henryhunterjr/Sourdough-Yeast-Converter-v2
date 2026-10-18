import { describe, expect, it } from 'vitest';
import { convertToSourdough, convertToYeast, parseRecipeText } from '../src/index.js';

const texts = (r: { steps: { text: string }[] }) => r.steps.map(s => s.text);

describe('Oct 18 work order, item 1: yeast goes in after the autolyse', () => {
  const country = 'Country Sourdough\n100g active starter\n375g water\n450g bread flour\n50g whole wheat flour\n10g salt\n\nMethod\n1. Mix starter and water, add flour, rest 1 hour.\n2. Add salt. Bulk ferment 4 to 5 hours with folds every 30 minutes.\n3. Shape and refrigerate overnight.\n4. Bake at 500F covered 20 minutes, uncovered 25 minutes.';

  it('keeps the 1-hour rest yeast-free and adds the yeast after it', () => {
    const steps = texts(convertToYeast(parseRecipeText(country, 100).recipe).recipe);
    const mix = steps.findIndex(t => /^Mix the water, add flour, rest 1 hour\./.test(t));
    expect(mix).toBeGreaterThan(0);
    expect(steps[mix + 1]).toMatch(/^After the rest, add the instant yeast .*Bulk fermentation counts from here/);
    expect(steps.join('\n')).not.toMatch(/Mix yeast and water/);
    expect(steps.join('\n')).toMatch(/Bulk ferment 70 to 85 minutes/);
  });

  it('handles "dissolve the levain in the water" the same way', () => {
    const t = 'Loaf\n100g levain\n350g water\n500g bread flour\n10g salt\nMethod\n1. Dissolve the levain in the water. Add the flour and mix. Autolyse 45 minutes.\n2. Add salt. Bulk 5 hours.\n3. Shape, proof 2 hours, bake.';
    const steps = texts(convertToYeast(parseRecipeText(t, 100).recipe).recipe);
    expect(steps[1]).toBe('Add the water. Add the flour and mix. Autolyse 45 minutes.');
    expect(steps[2]).toMatch(/^After the rest, add the instant yeast/);
  });

  it('still swaps the starter for yeast when there is no rest in the step', () => {
    const t = 'Loaf\n100g starter\n350g water\n500g bread flour\n10g salt\nMethod\n1. Mix the starter, water, flour and salt until combined. Bulk 5 hours.\n2. Shape, proof 2 hours, bake.';
    const steps = texts(convertToYeast(parseRecipeText(t, 100).recipe).recipe);
    expect(steps[1]).toMatch(/^Mix the yeast, water, flour and salt/);
    expect(steps.join('\n')).not.toMatch(/After the rest/);
  });
});

describe('Oct 18 work order, item 2: two rises in one step count as bulk then proof', () => {
  const one = 'Rolls\n500g flour\n300g water\n10g salt\n5g instant yeast\nMethod\n1. Mix. Let rise 1 hour. Shape, proof 1 hour. Bake.';

  it('to sourdough: 3.5 hours then 3 hours', () => {
    const sd = convertToSourdough(parseRecipeText(one, 100).recipe).recipe;
    expect(texts(sd)[1]).toBe('Mix. Let rise 3.5 hours. Shape, proof 3 hours. Bake.');
  });

  it('and back to yeast: about 1 hour then 1 hour, with one time note and one levain line', () => {
    const sd = convertToSourdough(parseRecipeText(one, 100).recipe).recipe;
    const back = texts(convertToYeast(sd).recipe);
    expect(back[1]).toBe('Mix. Let rise 60 minutes. Shape, proof 60 minutes. Bake.');
    expect(back.filter(t => /Fermentation times are estimates/.test(t))).toHaveLength(1);
    expect(back.filter(t => /levain/i.test(t))).toHaveLength(1);
    expect(back[0]).toMatch(/^The levain build is no longer needed\. This version uses instant yeast/);
    expect(back.join('\n')).not.toMatch(/until domed and about doubled/);
  });

  it('to yeast: two rises in one sourdough step', () => {
    const t = 'Loaf\n100g starter\n350g water\n500g bread flour\n10g salt\nMethod\n1. Mix everything. Bulk ferment 5 hours, then shape and proof 3 hours. Bake.';
    const steps = texts(convertToYeast(parseRecipeText(t, 100).recipe).recipe);
    expect(steps[1]).toMatch(/Bulk ferment 85 minutes, then shape and proof 60 minutes/);
  });
});
