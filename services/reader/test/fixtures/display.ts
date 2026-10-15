import { EXAMPLES } from '../../../../apps/web/src/examples.js';
import type { ReadRecipe, ReadIngredient, ReadComponent } from '../../src/schema.js';

// Hand-authored provider responses, not generated from the parser under test.
// These exercise deterministic handling of model-shaped data; no AI calls.
type Line = [number | null, string, string, ReadIngredient['role'], string?];
const section = (kind: ReadComponent['kind'], name: string, lines: Line[]): ReadComponent => ({
  kind, name, ingredients: lines.map(([amount, unit, name, role, note = '']) => ({
    amount, unit, name, role, note, isReference: amount === null, isFinishing: false,
  })),
});
const recipe = (text: string, language: 'en' | 'es', components: ReadComponent[]): ReadRecipe => ({
  title: text.split('\n')[0]!, language, components, transcript: '', uncertainties: [],
  steps: text.split(/\n(?:Instructions|Method|Método)\n/)[1]!.trim().split('\n').map(s => s.replace(/^\d+\. /, '')),
});

export const DISPLAY_FIXTURES = [
  {
    text: EXAMPLES.lean,
    read: recipe(EXAMPLES.lean, 'en', [section('dough', 'Dough', [
      [3.5, 'cups', 'bread flour', 'flour'], [1.25, 'cups', 'warm water', 'liquid'],
      [2, 'tablespoons', 'butter', 'fat', 'softened'], [2, 'tablespoons', 'sugar', 'sweetener'],
      [1.5, 'teaspoons', 'salt', 'salt'], [2.25, 'teaspoons', 'instant yeast', 'yeast'],
    ]), section('other', 'For the pan', [])]),
  },
  {
    text: EXAMPLES.enriched,
    read: recipe(EXAMPLES.enriched, 'en', [
      section('dough', 'Dough', [
        [500, 'g', 'all-purpose flour', 'flour'], [240, 'g', 'whole milk', 'dairy', 'warm'],
        [67, 'g', 'sugar', 'sweetener'], [1, 'large', 'egg', 'egg'],
        [75, 'g', 'butter', 'fat', 'melted'], [1, 'teaspoon', 'salt', 'salt'],
        [2.25, 'teaspoons', 'instant yeast', 'yeast'],
      ]),
      section('filling', 'Filling', [
        [113, 'g', 'butter', 'fat', 'softened'], [150, 'g', 'brown sugar', 'sweetener'],
        [2, 'tablespoons', 'cinnamon', 'spice'],
      ]),
      section('glaze', 'Glaze', [[1, 'cup', 'powdered sugar', 'sweetener'], [2, 'tablespoons', 'milk', 'dairy']]),
    ]),
  },
  {
    text: EXAMPLES.spanish,
    read: recipe(EXAMPLES.spanish, 'es', [
      section('preferment', 'Levain', [
        [20, 'g', 'masa madre activa', 'starter'], [50, 'g', 'harina de fuerza', 'flour'], [50, 'g', 'agua', 'liquid'],
      ]),
      section('dough', 'Masa', [
        [null, '', 'todo el levain', 'starter'], [450, 'g', 'harina de fuerza', 'flour'],
        [300, 'g', 'agua', 'liquid'], [10, 'g', 'sal', 'salt'],
      ]),
    ]),
  },
];

// The built-in Spanish sample has no ingredient prep notes, so test them explicitly too.
export const PREP_FIXTURES = [
  ['softened', 'butter', 'en'], ['melted', 'butter', 'en'],
  ['room temperature', 'butter', 'en'], ['divided', 'butter', 'en'],
  ['ablandada', 'mantequilla', 'es'], ['derretida', 'mantequilla', 'es'],
  ['a temperatura ambiente', 'mantequilla', 'es'], ['dividida', 'mantequilla', 'es'],
] as const;
