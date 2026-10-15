# dough-core

The conversion engine for the Baking Great Bread Sourdough-Yeast Recipe Converter. Pure TypeScript, no runtime dependencies, no network, no DOM. Every number is computed in code and checked by tests.

This is Phase 1 of the rebuild plan in the audit doc. It replaces `recipeParser.ts`, `recipeConverter.ts`, `recipePreprocessor.ts`, `smartWarnings.ts`, `recipeValidator.ts` and `methodTemplates.ts` from the old app. The UI, PDF, Spanish UI strings and Supabase plumbing are not here; they get wired to this in Phase 3.

## Run the tests

```
npm install
npm test
```

23 tests: the 12 acceptance cases from the audit doc (`test/acceptance.test.ts`) plus regressions from the first code review (`test/regressions.test.ts`). No PR should merge with a red test.

## The model

A recipe is a list of **components**. Only `preferment`, `soaker`, `tangzhong` and `dough` enter the math. `filling`, `topping`, `glaze` and `other` are carried through a conversion untouched, which is what fixes the "frosting kneaded into the dough" problem.

```ts
interface Recipe {
  title?: string;
  components: Component[];   // { kind, name, ingredients }
  steps: Step[];             // { text, changed?, note? }
  starterHydration: number;  // percent, default 100
  language?: 'en' | 'es';
}
interface Ingredient {
  name: string;              // as the baker wrote it, never translated here
  grams: number;
  role: 'flour' | 'liquid' | 'dairy' | 'starter' | 'yeast' | 'salt' | 'fat' | 'egg' | 'sweetener' | 'inclusion' | 'spice' | 'other';
  isReference?: boolean;     // "all of the levain": points at a preferment, not counted twice
}
```

## The API

```ts
import { parseRecipeText, analyze, sanityCheck, convertToSourdough, convertToYeast, renderRecipe } from '@bgb/dough-core';

const { recipe, issues } = parseRecipeText(text, 100);   // sections kept, EN or ES
const a = analyze(recipe);        // totalFlour, totalWater, hydration, prefermentedFlourPct, saltPct, sugarPct, fatPct, richness, leavening
const checks = sanityCheck(recipe);

const sd = convertToSourdough(recipe, { prefermentedFlour: 0.20, levainHydration: 'stiff' });
sd.recipe   // new Recipe with a Levain component and edited steps
sd.levain   // { seed, flour, water, total, hydration, prefermentedFlourPct }
sd.notes

const y = convertToYeast(recipe, { kind: 'instant' });
y.yeast     // { instant, activeDry, fresh, pct }
```

`renderRecipe(recipe)` gives a plain-text view, the same one the tests compare against.

Rounding happens only at display time (`ROUND.grams`, `ROUND.pct`). Internals are exact.

## The rules the math follows

- **Hydration** = total water / total flour, where each ingredient contributes its water share: water 1.00, milk 0.87, buttermilk 0.90, egg 0.75, yolk 0.50, butter 0.16, honey 0.17, cream cheese 0.55, dry yeast 0. A starter at hydration h contributes `h/(100+h)` water and `100/(100+h)` flour.
- **Yeast to sourdough**: 20% of total flour ferments in the levain (adjustable 10 to 30). The seed starter is 40% of the levain flour. Levain hydration is 100% for lean doughs and 50% (stiff) for enriched or sweet doughs. The whole levain flour (seed's flour plus added flour) comes out of the dough, so total flour is unchanged. Levain water comes out of the dough's water first, then its dairy by water content. Yeast is removed. Everything else stays.
- **Sourdough to yeast**: starter and preferment flour and water are folded back into the dough in proportion. Instant yeast at 1% of flour; active dry is 1.25x, fresh is 3x.
- **Method**: the baker's steps are kept. The yeast-proofing sentence becomes a levain-dissolving sentence (or the levain build becomes a one-line note). Rise clauses are rescaled: first rise x3.5 (lean) or x4 (enriched), final proof x3; the reverse when going to yeast. Bake, oven, fridge and "every 30 minutes" clauses are never touched. A closing note says the times are estimates.
- **Units**: volumes convert through a density table keyed on ingredient class, not on the exact string. Bread flour 127 g/cup, AP 120, whole wheat 113, water 237, milk 244, sugar 200, brown sugar 220, butter 227 (stick 113), honey 340, table salt 6 g/tsp, Morton kosher 4.8, Diamond 2.8, yeast 3.1 g/tsp, 1 packet 7 g, large egg 50 g, yolk 18, white 33.

## What the parser handles

Section headings in English and Spanish (Tangzhong, Dough, Filling, Frosting, Levain, Relleno, Masa...). Amounts as "3 1/2 cups", "3½ cups", "1.25 cups", "2 ¼ tsp", "1 stick", "1 packet", "Pinch of salt", "500 g harina 000", "Bread flour 500g", grams in parentheses, "or 240g" alternatives. "all of the levain" lines become references. Egg wash goes to a topping component. "optional:" prefixes are read, "to taste" lines are skipped with an issue.

Anything it can't read lands in `issues` with the line and a reason. The UI should show those, not hide them.

## What is deliberately not here

- No AI. Phase 2 adds an AI reader that outputs this same `Recipe` shape under a strict JSON schema. The AI never computes a number.
- No translation. Ingredient names stay as written. The added method sentences exist in English and Spanish; UI chrome is the app's job.
- No PDF, no storage, no analytics.

## Known limits (backlog from the first review)

- Richness ignores eggs; an egg-heavy, low-fat dough reads as lean.
- A yeasted poolish or biga is treated as a sourdough preferment at the user's starter hydration.
- Milk solids removed with the levain water are not added back as milk powder.
- Unnumbered methods with no blank lines become one step.
- "1,000g" reads as 1 g (comma treated as a decimal).
- Instant yeast default is 1%; sweet doughs often use 1.5 to 2%.
- `convertToSourdough` throws when the dough has less flour than the levain needs; a Result type would be friendlier for the UI.
