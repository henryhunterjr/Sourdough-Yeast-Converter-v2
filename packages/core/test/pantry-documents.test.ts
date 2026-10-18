import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRecipeText, analyze, convertToSourdough, convertToYeast, recipeDocument } from '../src/index.js';
const fixture = (name: string) => readFileSync(new URL(`./fixtures/pantry-pdf/${name}.txt`, import.meta.url), 'utf8');

describe('actual PDF text and matching Pantry export formats', () => {
  it('reads the name-first cinnamon-roll table once, excluding subtotal and percentage columns', () => {
    const { recipe, issues } = parseRecipeText(fixture('einkorn-table'));
    expect(recipe.title).toBe('Einkorn & Spelt Cinnamon Rolls');
    expect(recipe.components.map(c => [c.name, c.ingredients.length])).toEqual([['Levain / Starter', 3], ['Dough', 19]]);
    expect(recipe.components[0]!.ingredients.map(i => i.grams)).toEqual([38, 77, 54]);
    expect(recipe.components[1]!.ingredients.map(i => i.grams)).toEqual([23,192,269,115,116,58,50,50,88,8,56,130,14,1,115,40,60,4,10]);
    // Each section title ("BULK FERMENTATION") is its own step, ahead of its paragraph.
    expect(recipe.steps).toHaveLength(16);
    expect(recipe.steps[6]!.text).toBe('BULK FERMENTATION');
    expect(recipe.steps.at(-1)!.text).toContain('Cool on wire rack');
    expect(recipe.steps.map(s => s.text).join(' ')).not.toContain('Substitutions');
    expect(recipe.sourceNotes?.join(' ')).toContain('Tangzhong Detected');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.reason).toContain('192g of preferment');
    expect(issues[0]!.reason).toContain('169g');
    expect(analyze(recipe).totalFlour).toBe(480);
    expect(recipe.components[1]!.ingredients.find(i=>i.isReference)?.grams).toBe(192);
  });

  it('preserves the authored print sections, exact grams, prep notes and all method pages', () => {
    const { recipe, issues } = parseRecipeText(fixture('pantry-print'));
    expect(issues).toEqual([]);
    expect(recipe.components.map(c => [c.kind, c.ingredients.length])).toEqual([['tangzhong',2],['dough',8],['filling',5],['glaze',6],['other',1]]);
    expect(recipe.components[1]!.ingredients.map(i=>i.grams)).toEqual([300,144,90,50,50,60,6,7]);
    expect(recipe.components[1]!.ingredients[3]!.original!.text).toContain('room temperature');
    expect(recipe.components[2]!.ingredients[1]!.original!.text).toContain('packed');
    const method=recipe.steps.map(s=>s.text).join(' ');
    expect(method).toContain('Lower the oven to 325');
    expect(method).not.toContain('https://');
    expect(method).not.toContain('10/15/26');
    expect(method).not.toContain('FAQ');
    expect(recipe.sourceNotes?.join(' ')).toContain('gentler knead');
    const after=convertToSourdough(recipe);
    expect(analyze(after.recipe).totalFlour).toBe(480);
    expect(analyze(after.recipe).hydration).toBeCloseTo(analyze(recipe).hydration,10);
    expect(after.recipe.components.find(c=>c.kind==='filling')!.ingredients).toEqual(recipe.components[2]!.ingredients);
    expect(convertToYeast(after.recipe).recipe.sourceNotes).toEqual(recipe.sourceNotes);
  });

  it('keeps one-sheet metric and volume lines together and retains the yeasted variant', () => {
    const { recipe, issues }=parseRecipeText(fixture('cranberry-one-sheet'));
    expect(issues).toEqual([]);
    expect(recipe.title).toBe('Cranberry Orange Loaf');
    expect(recipe.components.map(c=>[c.name,c.ingredients.length])).toEqual([['DOUGH (YEASTED VERSION)',8],['CRANBERRIES',2],['ORANGE GLAZE (OPTIONAL)',3]]);
    const lines=recipe.components.flatMap(c=>c.ingredients.map(i=>i.original!.text)).join('\n');
    for(const wording of ['2/3 cup','1/2 cup + 1 tbsp','3 1/2 tbsp','softened','room temperature','sifted']) expect(lines).toContain(wording);
    expect(analyze(recipe).totalFlour).toBe(500);
    expect(analyze(recipe).yeast).toBe(7);
    expect(recipe.components.flatMap(c=>c.ingredients).some(i=>/hydration|total flour|equipment/i.test(i.name))).toBe(false);
    expect(recipe.steps.map(s=>s.text).join(' ')).toContain('190°F (88°C) internal');
    expect(recipe.steps.map(s=>s.text).join(' ')).not.toContain('ProveWorth');
    expect(recipe.steps.map(s=>s.text).join(' ')).not.toContain('recipepantry.app');
    expect(recipeDocument(recipeDocument(fixture('cranberry-one-sheet')).text).text).toBe(recipeDocument(fixture('cranberry-one-sheet')).text);
  });
});
