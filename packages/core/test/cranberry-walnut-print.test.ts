import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze, convertToYeast, parseRecipeText } from '../src/index.js';

// Text extracted from Henry's Recipe Pantry print of Cranberry Walnut Bread,
// the same way the web app reads an uploaded PDF (Oct 18, 2026 launch test).
const text = readFileSync(new URL('./fixtures/pantry-pdf/cranberry-walnut-print.txt', import.meta.url), 'utf8');

describe('Cranberry Walnut Bread Pantry print, sourdough to yeast (Oct 18 launch test)', () => {
  const { recipe, issues } = parseRecipeText(text, 100);
  const yeasted = convertToYeast(recipe).recipe;
  const method = yeasted.steps.map(s => s.text);
  const all = method.join('\n');

  it('reads "~250g Levain (all of it)" as the levain, with nothing left unread', () => {
    expect(issues).toEqual([]);
    const lv = recipe.components.find(c => c.kind === 'dough')!.ingredients.find(i => i.isReference)!;
    expect(lv.role).toBe('starter');
    expect(lv.grams).toBe(250);
  });

  it('keeps every gram of flour and water from the levain in the yeasted dough', () => {
    const before = analyze(recipe), after = analyze(yeasted);
    expect(after.totalFlour).toBe(625);
    expect(after.totalFlour).toBe(before.totalFlour);
    expect(after.hydration).toBeCloseTo(before.hydration, 1);
    const dough = yeasted.components.find(c => c.kind === 'dough')!.ingredients;
    expect(dough.find(i => i.role === 'liquid')!.grams).toBe(500);
    expect(dough.find(i => i.role === 'flour')!.grams).toBe(625);
  });

  it('drops the levain build and never turns starter or levain into yeast', () => {
    expect(all).not.toMatch(/levain|sourdough starter|clean jar|doubled by morning/i);
    expect(all).not.toMatch(/\b(?:50|250)g\s+yeast\b/i);
    expect(all).toMatch(/Stir 6\.5g instant yeast into 500g Water\. Add 625g Bread flour/);
  });

  it('tells the baker to add the salt exactly once', () => {
    expect(method.filter(t => /\b10g\b.*\bsalt\b/i.test(t))).toHaveLength(1);
  });

  it('counts the folds as bulk time, since yeast starts working at mixing', () => {
    const note = method.findIndex(t => /Yeast works faster than sourdough/.test(t));
    const firstFold = method.findIndex(t => /First set of folds/.test(t));
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(firstFold);
    expect(all).toMatch(/Count from when you mixed in the yeast/);
    expect(all).not.toMatch(/start checking after about 60–90 minutes/);
  });

  it('keeps the inclusions, shaping and Dutch oven bake', () => {
    expect(all).toMatch(/Toast walnuts/);
    expect(all).toMatch(/Soak dried cranberries/);
    expect(all).toMatch(/Add the remaining cranberries and walnuts/);
    expect(all).toMatch(/Bake covered at 450°F \(230°C\) for 20 minutes/);
    expect(all).not.toMatch(/cold loaf|in the fridge/i);
  });
});

describe('a removed levain title takes its paragraph with it (simple method editor)', () => {
  it('drops "Mix 38g active starter..." under a "BUILD LEVAIN (NIGHT BEFORE)" title', () => {
    const text = 'Rolls\nLevain\n38g active starter\n77g water\n77g flour\nDough\nall of the levain\n200g water\n400g flour\n8g salt\nMethod\n1. BUILD LEVAIN (NIGHT BEFORE)\nMix 38g active starter, 77g water, and 77g flour. Cover and rest overnight until doubled.\n2. MIX DOUGH (MORNING)\nIn a large bowl, mix the water and flour until shaggy. Rest 30 minutes.\n3. BULK\nLet rise until doubled, about 4 hours.\n4. BAKE\nBake at 375F for 30 minutes.';
    const steps = convertToYeast(parseRecipeText(text, 100).recipe).recipe.steps.map(s => s.text);
    expect(steps.join('\n')).not.toMatch(/38g|active starter|yeast, 77g/i);
    // One levain line, folded into the intro (Oct 18 work order, item 10).
    expect(steps.filter(s => /levain/i.test(s))).toHaveLength(1);
    expect(steps[0]).toMatch(/^The levain build is no longer needed\. /);
    expect(steps).toContain('MIX DOUGH (MORNING)');
  });
});
