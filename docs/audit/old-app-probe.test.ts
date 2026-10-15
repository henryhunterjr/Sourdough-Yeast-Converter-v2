/* Audit probe: runs the real pipeline on sample recipes and prints what it does. */
import { describe, it } from 'vitest';
import { preprocessRecipeText } from '../recipePreprocessor';
import { parseRecipe, validateRecipe, generateBakerWarnings } from '../recipeParser';
import { convertYeastToSourdough, convertSourdoughToYeast } from '../recipeConverter';
import { generateSmartWarnings } from '../smartWarnings';
import { validateConversion } from '../recipeValidator';

const show = (label: string, r: any) => {
  console.log(`\n==== ${label} ====`);
  console.log(`flour=${r.totalFlour} liquid=${r.totalLiquid} starter=${r.starterAmount} yeast=${r.yeastAmount} salt=${r.saltAmount} hyd=${r.hydration?.toFixed?.(1)}`);
  for (const i of r.ingredients) console.log(`  ${String(i.amount).padStart(6)}g  ${i.name}  [${i.type}]`);
};

const cinnamonRolls = `Einkorn & Spelt Cinnamon Rolls
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
Instructions:
Mill the flour. Make the tangzhong. Mix and knead. First rise 60 to 90 minutes. Fill and roll. Final proof 45 to 60 minutes. Bake at 350F for 24 to 28 minutes.`;

const cupsRecipe = `Simple Sandwich Loaf
3 1/2 cups bread flour
1 1/4 cups warm water
2 tablespoons butter, softened
2 tablespoons sugar
1 1/2 teaspoons salt
2 1/4 teaspoons instant yeast
1 cup brown sugar
Instructions:
Mix, knead, rise 1 hour, shape, proof 45 minutes, bake 375F 30 minutes.`;

const spanishLean = `Pan de masa madre
500g harina de fuerza
350g agua
100g masa madre activa
10g sal
Instrucciones:
Mezclar, fermentar 5 horas, formar, hornear a 230°C 40 minutos.`;

const leanYeast = `Country Loaf
500g bread flour
350g water
10g salt
5g instant yeast
Instructions:
Mix, rise, shape, bake at 450F.`;

const leanSourdough80 = `Country Sourdough
450g bread flour
50g whole wheat flour
360g water
100g sourdough starter
10g salt
Instructions:
Mix, bulk 5 hours, shape, bake.`;

describe('audit probe', () => {
  it('runs', () => {
    // 1. Cinnamon rolls, yeast -> sourdough, through the same path the UI uses
    const pre = preprocessRecipeText(cinnamonRolls);
    console.log('\nPreprocess fixes:', pre.appliedFixes);
    console.log('Preprocessed text (first 300 chars):', JSON.stringify(pre.cleanedText.slice(0, 300)));
    const parsed = parseRecipe(pre.cleanedText, 100);
    show('CINNAMON ROLLS regex parse (after preprocess)', parsed);
    console.log('validateRecipe errors:', validateRecipe(parsed));
    const conv = convertYeastToSourdough(parsed, cinnamonRolls, 100);
    show('CINNAMON ROLLS converted', conv.converted);
    console.log('Method:'); conv.methodChanges.forEach(m => console.log(`  ${m.step}: ${m.change}`));
    console.log('Tips:'); conv.troubleshootingTips.forEach(t => console.log(`  ${t.issue}: ${t.solution}`));
    console.log('Warnings:'); conv.warnings.forEach(w => console.log(`  [${w.type}] ${w.message}`));
    const v = validateConversion(conv);
    console.log('validateConversion autofixes:', v.autoFixes);
    console.log('validateConversion warnings:', v.validationWarnings.map(w => w.message));

    // 1b. Same recipe WITHOUT preprocess (what happens if lines are preserved)
    const parsedRaw = parseRecipe(cinnamonRolls, 100);
    show('CINNAMON ROLLS regex parse (raw text, no preprocess)', parsedRaw);

    // 2. Cups recipe
    const p2 = parseRecipe(preprocessRecipeText(cupsRecipe).cleanedText, 100);
    show('CUPS RECIPE parse', p2);
    console.log('validateRecipe errors:', validateRecipe(p2));

    // 3. Spanish
    const p3 = parseRecipe(preprocessRecipeText(spanishLean).cleanedText, 100);
    show('SPANISH LEAN parse', p3);
    const c3 = convertSourdoughToYeast(p3, spanishLean, 100);
    show('SPANISH LEAN converted to yeast', c3.converted);
    c3.methodChanges.slice(0, 2).forEach(m => console.log(`  ${m.step}: ${m.change}`));

    // 4. Lean yeast -> sourdough at 100% and at 80% starter hydration
    for (const h of [100, 80, 50]) {
      const p4 = parseRecipe(leanYeast, h);
      const c4 = convertYeastToSourdough(p4, leanYeast, h);
      show(`LEAN YEAST -> SOURDOUGH @ starter ${h}%`, c4.converted);
      console.log('  levain step:', c4.methodChanges[0].change);
      console.log('  warnings:', generateBakerWarnings(c4.converted).map(w => w.message));
    }

    // 5. Lean sourdough -> yeast at 100% and 80%
    for (const h of [100, 80]) {
      const p5 = parseRecipe(leanSourdough80, h);
      show(`LEAN SOURDOUGH parse @ starter ${h}%`, p5);
      const c5 = convertSourdoughToYeast(p5, leanSourdough80, h);
      show(`LEAN SOURDOUGH -> YEAST @ starter ${h}%`, c5.converted);
      c5.methodChanges.slice(0, 2).forEach(m => console.log(`  ${m.step}: ${m.change}`));
    }
  });
});
