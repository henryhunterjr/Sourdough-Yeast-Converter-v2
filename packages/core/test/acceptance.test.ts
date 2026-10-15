/**
 * Acceptance tests from the audit doc. Each row of the table is one test with
 * exact expected numbers. If one of these goes red, the converter is wrong.
 */
import { describe, expect, it } from 'vitest';
import {
  analyze, convertToSourdough, convertToYeast, parseRecipeText, renderRecipe, ROUND,
  type Recipe,
} from '../src/index.js';

const grams = (r: Recipe, kind: string, name: RegExp) =>
  ROUND.grams(
    r.components.filter(c => c.kind === kind).flatMap(c => c.ingredients).filter(i => name.test(i.name) && !i.isReference)
      .reduce((s, i) => s + i.grams, 0),
  );
const section = (r: Recipe, kind: string) => r.components.find(c => c.kind === kind);

const COUNTRY_YEAST = `Country Loaf
500g bread flour
350g water
10g salt
5g instant yeast
Instructions
1. Mix everything into a shaggy dough and knead 10 minutes.
2. Cover and let rise 1 to 1.5 hours until doubled.
3. Shape into a boule and proof 45 to 60 minutes.
4. Bake at 450°F for 35 minutes.`;

const CINNAMON_ROLLS = `Einkorn & Spelt Cinnamon Rolls
Tangzhong
36g fresh-milled spelt flour
180g whole milk
Dough
300g fresh-milled spelt flour
144g fresh-milled einkorn flour
90g whole milk, lukewarm
1 large egg (50g) room temperature
50g cane sugar
60g unsalted butter, softened
6g fine sea salt
7g instant yeast
Cinnamon Filling
56g unsalted butter, very soft
130g dark brown sugar, packed
14g ground cinnamon
1g ground cardamom
1g fine sea salt
Maple Cream Cheese Frosting
115g cream cheese, softened
28g unsalted butter, softened
40g pure maple syrup
60g powdered sugar
4g vanilla extract
1g fine sea salt
Pan
10g unsalted butter, for the pan
Instructions
1. Mill both grains fresh and let them cool.
2. Whisk the spelt flour and milk in a saucepan over medium-low heat 3 to 4 minutes until it thickens like pudding. Cool 15 minutes.
3. In the mixer bowl combine the tangzhong, milk, egg, sugar, and yeast. Add the flours and salt. Mix on low 2 minutes, then rest 20 minutes.
4. Knead in the butter in three pieces, 8 to 10 minutes total.
5. Move the dough to an oiled bowl, cover, and let it rise at 76 to 78°F for 60 to 90 minutes, until about 50 percent bigger.
6. Roll the dough into a 12 x 18 inch rectangle, spread the filling, roll up from the long edge, and cut into 12 rolls. Set them in the buttered pan, 3 rows of 4.
7. Cover the pan and let the rolls proof for 45 to 60 minutes, until puffy and touching. Heat the oven to 350°F (175°C) during the last 20 minutes.
8. Bake at 350°F (175°C) for 24 to 28 minutes, until the center roll reads 190°F.
9. Cool 10 minutes, then frost while warm.`;

describe('acceptance', () => {
  it('1. country loaf to sourdough at 100% starter', () => {
    const { recipe } = parseRecipeText(COUNTRY_YEAST, 100);
    const conv = convertToSourdough(recipe);
    const r = conv.recipe;
    expect(conv.levain).toMatchObject({ seed: 40, flour: 80, water: 80, total: 200, prefermentedFlourPct: 20 });
    expect(grams(r, 'preferment', /starter/)).toBe(40);
    expect(grams(r, 'preferment', /flour/)).toBe(80);
    expect(grams(r, 'preferment', /water/)).toBe(80);
    expect(grams(r, 'dough', /flour/)).toBe(400);
    expect(grams(r, 'dough', /water/)).toBe(250);
    expect(grams(r, 'dough', /yeast/)).toBe(0);
    const a = analyze(r);
    expect(ROUND.grams(a.totalFlour)).toBe(500);
    expect(ROUND.grams(a.totalWater)).toBe(350);
    expect(ROUND.pct(a.hydration)).toBe(70);
    expect(ROUND.pct(a.prefermentedFlourPct)).toBe(20);
  });

  it('2. country loaf to sourdough at 80% starter: levain balanced to 100%, flour exactly 500g', () => {
    const { recipe } = parseRecipeText(COUNTRY_YEAST, 80);
    const conv = convertToSourdough(recipe);
    const lv = conv.levain!;
    // Levain holds exactly 100g flour and 100g water however the seed is built.
    const seedFlour = lv.seed * 100 / 180;
    const seedWater = lv.seed * 80 / 180;
    expect(seedFlour + lv.flour).toBeCloseTo(100, 6);
    expect(seedWater + lv.water).toBeCloseTo(100, 6);
    const a = analyze(conv.recipe);
    expect(a.totalFlour).toBeCloseTo(500, 6);
    expect(ROUND.pct(a.hydration)).toBe(70);
    expect(ROUND.pct(a.prefermentedFlourPct)).toBe(20);
  });

  it('3. country loaf to sourdough at 50% stiff starter: flour exactly 500g, no inoculation drift', () => {
    const { recipe } = parseRecipeText(COUNTRY_YEAST, 50);
    const conv = convertToSourdough(recipe);
    const a = analyze(conv.recipe);
    expect(a.totalFlour).toBeCloseTo(500, 6);
    expect(a.totalWater).toBeCloseTo(350, 6);
    expect(ROUND.pct(a.hydration)).toBe(70);
    expect(ROUND.pct(a.prefermentedFlourPct)).toBe(20);
  });

  it('4. cups and spoons convert through the density table', () => {
    const { recipe, issues } = parseRecipeText(`Sandwich Loaf
3 1/2 cups bread flour
1 1/4 cups warm water
2 tablespoons butter, softened
2 tablespoons sugar
1 1/2 teaspoons salt
2 1/4 teaspoons instant yeast`);
    expect(issues).toEqual([]);
    expect(grams(recipe, 'dough', /flour/)).toBe(445);   // 3.5 × 127
    expect(grams(recipe, 'dough', /water/)).toBe(296);   // 1.25 × 237
    expect(grams(recipe, 'dough', /butter/)).toBe(28);
    expect(grams(recipe, 'dough', /sugar/)).toBe(25);
    expect(grams(recipe, 'dough', /salt/)).toBe(9);
    expect(grams(recipe, 'dough', /yeast/)).toBe(7);
    const a = analyze(recipe);
    expect(a.totalFlour).toBeGreaterThan(400);
    expect(a.leavening).toBe('yeast');
  });

  it("5. Henry's cinnamon rolls: sections survive, dough math uses dough only, bake temp kept", () => {
    const { recipe, issues } = parseRecipeText(CINNAMON_ROLLS, 100);
    expect(issues).toEqual([]);
    expect(recipe.components.map(c => c.kind)).toEqual(['tangzhong', 'dough', 'filling', 'glaze', 'other']);
    expect(section(recipe, 'filling')!.ingredients).toHaveLength(5);
    expect(section(recipe, 'glaze')!.ingredients).toHaveLength(6);

    const before = analyze(recipe);
    expect(ROUND.grams(before.totalFlour)).toBe(480);
    expect(ROUND.pct(before.sugarPct)).toBe(10.4);   // 50 / 480, filling sugar excluded
    expect(ROUND.pct(before.fatPct)).toBe(12.5);    // 60 / 480, frosting butter excluded
    expect(before.richness).toBe('enriched');

    const conv = convertToSourdough(recipe);
    const r = conv.recipe;
    // Pass-through sections untouched.
    expect(section(r, 'filling')!.ingredients).toEqual(section(recipe, 'filling')!.ingredients);
    expect(section(r, 'glaze')!.ingredients).toEqual(section(recipe, 'glaze')!.ingredients);
    expect(grams(r, 'other', /butter/)).toBe(10);
    // Tangzhong kept as its own component and its flour still counts.
    expect(section(r, 'tangzhong')!.ingredients).toHaveLength(2);
    const after = analyze(r);
    expect(ROUND.grams(after.totalFlour)).toBe(480);
    expect(ROUND.pct(after.prefermentedFlourPct)).toBe(20);
    expect(Math.abs(after.hydration - before.hydration)).toBeLessThan(0.05);
    // Enriched dough gets a stiff levain, so the 90g of dough milk can cover the levain water.
    expect(conv.levain!.hydration).toBe(50);
    expect(conv.notes.some(n => n.level === 'warning')).toBe(false);
    // Method: yeast gone, bake at 350 kept, rolling and cutting kept, times scaled.
    const text = r.steps.map(s => s.text).join('\n');
    expect(text).toMatch(/Build the levain/);
    expect(text).not.toMatch(/\byeast\b/i);
    expect(text).toMatch(/Bake at 350°F \(175°C\) for 24 to 28 minutes/);
    expect(text).toMatch(/roll up from the long edge, and cut into 12 rolls/);
    expect(text).toMatch(/4 to 6 hours/);          // 60-90 min × 4
    expect(text).toMatch(/proof for 2\.5 to 3 hours/); // 45-60 min × 3 → 135-180
    expect(text).toMatch(/during the last 20 minutes/); // oven sentence untouched
  });

  it('6. brioche: eggs, yolks and a stick of butter in grams; egg water at 75%', () => {
    const { recipe, issues } = parseRecipeText(`Brioche
500g bread flour
3 large eggs
1 egg yolk
1 stick butter
100g milk
50g sugar
10g salt
7g instant yeast`);
    expect(issues).toEqual([]);
    expect(grams(recipe, 'dough', /^eggs$/)).toBe(150);
    expect(grams(recipe, 'dough', /yolk/)).toBe(18);
    expect(grams(recipe, 'dough', /butter/)).toBe(113);
    const a = analyze(recipe);
    // 150×0.75 + 18×0.5 + 113×0.16 + 100×0.87 + 50×0 + 7×0.08
    expect(a.totalWater).toBeCloseTo(112.5 + 9 + 18.08 + 87, 2);
    expect(a.richness).toBe('sweet');
  });

  it('7. two-flour sourdough to yeast at 100%: starter folded back in proportion', () => {
    const { recipe } = parseRecipeText(`Country Sourdough
450g bread flour
50g whole wheat flour
360g water
100g sourdough starter
10g salt
Instructions
1. Mix the starter into the water, add the flours and salt.
2. Bulk ferment 5 to 6 hours.
3. Shape, then proof 2 to 3 hours.
4. Bake at 475°F for 45 minutes.`, 100);
    const conv = convertToYeast(recipe);
    const r = conv.recipe;
    expect(grams(r, 'dough', /bread flour/)).toBe(495);
    expect(grams(r, 'dough', /whole wheat/)).toBe(55);
    expect(grams(r, 'dough', /water/)).toBe(410);
    expect(grams(r, 'dough', /starter/)).toBe(0);
    expect(ROUND.grams(conv.yeast!.instant)).toBe(5.5);
    expect(r.components).toHaveLength(1);
    const text = renderRecipe(r);
    expect(text).not.toMatch(/\d\.\d{3,}/);  // no long decimals anywhere
    expect(text).toMatch(/Bake at 475°F for 45 minutes/);
  });

  it('8. two-flour sourdough to yeast at 80% starter', () => {
    const { recipe } = parseRecipeText(`Country Sourdough
450g bread flour
50g whole wheat flour
360g water
100g sourdough starter
10g salt`, 80);
    const conv = convertToYeast(recipe);
    const r = conv.recipe;
    expect(grams(r, 'dough', /bread flour/)).toBe(500);
    expect(grams(r, 'dough', /whole wheat/)).toBe(56);
    expect(grams(r, 'dough', /water/)).toBe(404);
    expect(ROUND.pct(analyze(r).hydration)).toBe(72.8);
  });

  it('9. Spanish lean loaf: salt clean, method split correct, output stays Spanish', () => {
    const { recipe } = parseRecipeText(`Pan de masa madre
500g harina de fuerza
350g agua
100g masa madre activa
10g sal
Instrucciones:
1. Mezclar todo y amasar 10 minutos.
2. Fermentar en bloque 5 a 6 horas.
3. Formar y dejar levar 2 a 3 horas.
4. Hornear a 230°C durante 40 minutos.`, 100);
    expect(recipe.language).toBe('es');
    const salt = section(recipe, 'dough')!.ingredients.find(i => i.role === 'salt')!;
    expect(salt.name).toBe('sal');
    expect(salt.grams).toBe(10);
    expect(recipe.steps).toHaveLength(4);
    const conv = convertToYeast(recipe);
    const text = renderRecipe(conv.recipe);
    expect(text).toMatch(/levadura instantánea/);
    expect(text).not.toMatch(/\b(yeast|starter|flour|water|hours|minutes)\b/i);
    expect(text).toMatch(/Hornear a 230°C durante 40 minutos/);
  });

  it('10. buttermilk is dairy, 245g per cup, 90% water', () => {
    const { recipe } = parseRecipeText(`Rolls
400g all-purpose flour
1 cup buttermilk
5g salt
5g instant yeast`);
    const bm = section(recipe, 'dough')!.ingredients.find(i => /buttermilk/.test(i.name))!;
    expect(bm.role).toBe('dairy');
    expect(bm.grams).toBe(245);
    expect(analyze(recipe).totalWater).toBeCloseTo(245 * 0.9, 6);
  });

  it('11. levain section plus "all of the levain" in the dough counts once', () => {
    const { recipe } = parseRecipeText(`Levain
20g sourdough starter
50g bread flour
50g water
Dough
all of the levain
450g bread flour
300g water
10g salt`, 100);
    const a = analyze(recipe);
    expect(a.totalFlour).toBeCloseTo(510, 6);   // 10 + 50 + 450
    expect(a.totalWater).toBeCloseTo(360, 6);   // 10 + 50 + 300
    expect(ROUND.pct(a.prefermentedFlourPct)).toBe(11.8);
    const conv = convertToYeast(recipe);
    expect(grams(conv.recipe, 'dough', /bread flour/)).toBe(510);
    expect(grams(conv.recipe, 'dough', /water/)).toBe(360);
  });

  it('12. a sweet sourdough converted to yeast keeps enriched handling', () => {
    const { recipe } = parseRecipeText(`Sweet Buns
500g bread flour
100g sugar
80g butter
2 eggs
150g milk
100g sourdough starter
8g salt
Instructions
1. Build the levain the night before and let it double.
2. Mix the levain with the milk and eggs, add the dry ingredients, then knead in the butter.
3. Bulk ferment 6 to 8 hours until puffy.
4. Shape into buns and proof 3 to 4 hours.
5. Bake at 350°F for 20 minutes.`, 100);
    const conv = convertToYeast(recipe);
    expect(analyze(conv.recipe).richness).toBe('sweet');
    const text = conv.recipe.steps.map(s => s.text).join('\n');
    expect(text).toMatch(/The levain build is no longer needed/);
    expect(text).toMatch(/1\.5 to 2 hours/);      // 6-8 h ÷ 4
    expect(text).toMatch(/60 to 80 minutes/);    // 3-4 h ÷ 3
    expect(text).toMatch(/Bake at 350°F for 20 minutes/);
    const kept = conv.recipe.steps.filter(s => s.changed !== 'added' && !s.note).map(s => s.text).join('\n');
    expect(kept).not.toMatch(/\b(levain|starter)\b/i);
  });
});
