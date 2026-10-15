/**
 * Recipe data model.
 *
 * A recipe is a list of components. Only some components take part in the
 * dough math (see DOUGH_COMPONENTS). Fillings, toppings and glazes are carried
 * through a conversion untouched.
 */

export type Role =
  | 'flour'
  | 'liquid'      // water, juice, beer, coffee
  | 'dairy'       // milk, buttermilk, yogurt, cream (liquid dairy)
  | 'starter'     // sourdough starter or levain
  | 'yeast'
  | 'salt'
  | 'fat'         // butter, oil, lard, shortening, cream cheese
  | 'egg'         // whole eggs, yolks, whites
  | 'sweetener'   // sugars, honey, syrups
  | 'inclusion'   // nuts, fruit, seeds, chocolate, cheese cubes
  | 'spice'       // cinnamon, cardamom, vanilla, zest
  | 'other';

export type ComponentKind =
  | 'preferment'  // levain, poolish, biga
  | 'soaker'
  | 'tangzhong'   // tangzhong or yudane
  | 'dough'
  | 'filling'
  | 'topping'     // egg wash, seeds, streusel
  | 'glaze'       // frosting, icing, syrup
  | 'other';

/** Component kinds whose flour and liquid count toward the dough formula. */
export const DOUGH_COMPONENTS: ReadonlySet<ComponentKind> = new Set([
  'preferment',
  'soaker',
  'tangzhong',
  'dough',
]);

export type YeastKind = 'instant' | 'active-dry' | 'fresh';

export interface Ingredient {
  /** Name as the baker wrote it, lightly cleaned. Never translated by the core. */
  name: string;
  grams: number;
  role: Role;
  /**
   * Share of this ingredient's weight that behaves as water in the dough.
   * Filled from the water table when absent.
   */
  waterFraction?: number;
  /**
   * Share that behaves as flour. 1 for flour, 1/(1+h) for a starter at
   * hydration h%. Filled by analyze() when absent.
   */
  flourFraction?: number;
  yeastKind?: YeastKind;
  /** What the baker typed, kept for display and auditing. */
  original?: { amount: number; unit: string; text: string };
  /**
   * True when this line only points at a preferment built elsewhere in the
   * recipe ("all of the levain"), so its flour and water are not counted twice.
   */
  isReference?: boolean;
}

export interface Component {
  kind: ComponentKind;
  /** Heading as written, e.g. "Cinnamon Filling". */
  name: string;
  ingredients: Ingredient[];
}

export interface Step {
  text: string;
  /** Set by the method editor when a step was changed or added. */
  changed?: 'edited' | 'added' | 'kept';
  note?: string;
}

export interface Recipe {
  title?: string;
  components: Component[];
  steps: Step[];
  /** Separate source notes, never ingredients or rewritten method steps. */
  sourceNotes?: string[];
  /** Hydration of the baker's starter, as a percent. Default 100. */
  starterHydration: number;
  language?: 'en' | 'es';
}

export type Leavening = 'sourdough' | 'yeast' | 'both' | 'none';

export interface Analysis {
  totalFlour: number;
  totalWater: number;
  /** totalWater / totalFlour * 100 */
  hydration: number;
  /** Flour inside preferment components (or starter lines) as a share of total flour. */
  prefermentedFlour: number;
  prefermentedFlourPct: number;
  salt: number;
  saltPct: number;
  yeast: number;
  yeastPct: number;
  sugar: number;
  sugarPct: number;
  fat: number;
  fatPct: number;
  eggs: number;
  dairy: number;
  /** Lean: under 5% sugar and fat. Enriched: over. Sweet: sugar or fat over 15%. */
  richness: 'lean' | 'enriched' | 'sweet';
  leavening: Leavening;
}
