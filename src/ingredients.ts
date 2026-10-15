/**
 * Ingredient classification and water content.
 *
 * Everything here is keyed on *classes* of ingredient matched by ordered
 * patterns (most specific first), in English and Spanish. The order matters:
 * "buttermilk" must be dairy before "butter" can make it a fat.
 */
import type { Role, YeastKind } from './model.js';

export interface IngredientClass {
  id: string;
  role: Role;
  /** Weight share that behaves as water in dough. */
  water: number;
  /** Grams per US cup, when the ingredient is measured by volume. */
  gramsPerCup?: number;
  /** Grams per piece for countable items (eggs). */
  gramsEach?: number;
  yeastKind?: YeastKind;
  match: RegExp;
}

// Sources for densities: King Arthur ingredient weight chart, USDA FoodData
// Central, and manufacturer labels (Morton, Diamond Crystal, Fleischmann's).
// Water uses 237 g per US cup (236.6 ml). Bread flour uses 127 g, the median
// of published charts (KAF 120, others 130-136).
export const CLASSES: IngredientClass[] = [
  // --- things that would otherwise match a dairy or leavening word --------
  { id: 'chocolate', role: 'inclusion', water: 0.01, gramsPerCup: 170, match: /chocolate|cocoa nib|chips/i },
  { id: 'coffee', role: 'liquid', water: 0.99, gramsPerCup: 237, match: /coffee|espresso|caf[eé]/i },
  { id: 'wheat-germ', role: 'inclusion', water: 0.05, gramsPerCup: 115, match: /wheat (germ|bran|berries)|cracked wheat|bulgur|germen|salvado/i },
  { id: 'oats', role: 'inclusion', water: 0.08, gramsPerCup: 90, match: /\boats?\b|oatmeal|rolled oats|avena/i },
  // --- dairy and liquids that look like something else -------------------
  { id: 'buttermilk', role: 'dairy', water: 0.90, gramsPerCup: 245, match: /buttermilk|suero de leche|leche agria/i },
  { id: 'cream-cheese', role: 'fat', water: 0.55, gramsPerCup: 232, match: /cream cheese|queso crema/i },
  { id: 'sour-cream', role: 'dairy', water: 0.71, gramsPerCup: 230, match: /sour cream|crema agria/i },
  { id: 'heavy-cream', role: 'dairy', water: 0.58, gramsPerCup: 238, match: /heavy cream|whipping cream|double cream|nata|crema de leche|crema para batir/i },
  { id: 'yogurt', role: 'dairy', water: 0.85, gramsPerCup: 245, match: /yogh?urt|yogur/i },
  { id: 'milk-powder', role: 'dairy', water: 0.03, gramsPerCup: 128, match: /milk powder|dry milk|powdered milk|leche en polvo/i },
  { id: 'coconut-milk', role: 'dairy', water: 0.68, gramsPerCup: 226, match: /coconut milk|leche de coco/i },
  { id: 'milk', role: 'dairy', water: 0.87, gramsPerCup: 244, match: /\bmilk\b|\bleche\b/i },

  // --- eggs ---------------------------------------------------------------
  { id: 'egg-yolk', role: 'egg', water: 0.50, gramsEach: 18, match: /yolk|yema/i },
  { id: 'egg-white', role: 'egg', water: 0.88, gramsEach: 33, match: /egg white|clara/i },
  { id: 'egg', role: 'egg', water: 0.75, gramsEach: 50, match: /\beggs?\b|\bhuevos?\b/i },

  // --- fats ---------------------------------------------------------------
  { id: 'nut-butter', role: 'fat', water: 0.02, gramsPerCup: 258, match: /(peanut|almond|cashew|apple) butter/i },
  { id: 'butter', role: 'fat', water: 0.16, gramsPerCup: 227, match: /butter|mantequilla|manteca de vaca/i },
  { id: 'lard', role: 'fat', water: 0.00, gramsPerCup: 205, match: /\blard\b|manteca de cerdo|\bmanteca\b/i },
  { id: 'shortening', role: 'fat', water: 0.00, gramsPerCup: 205, match: /shortening|grasa vegetal/i },
  { id: 'oil', role: 'fat', water: 0.00, gramsPerCup: 218, match: /\boil\b|aceite/i },

  // --- sweeteners ---------------------------------------------------------
  { id: 'brown-sugar', role: 'sweetener', water: 0.02, gramsPerCup: 220, match: /brown sugar|az[uú]car (morena|mascabado|moreno|rubia)|panela|piloncillo/i },
  { id: 'powdered-sugar', role: 'sweetener', water: 0.00, gramsPerCup: 120, match: /powdered sugar|confectioner|icing sugar|az[uú]car (glass|glas|impalpable|pulverizada)/i },
  { id: 'honey', role: 'sweetener', water: 0.17, gramsPerCup: 340, match: /honey|\bmiel\b/i },
  { id: 'maple-syrup', role: 'sweetener', water: 0.32, gramsPerCup: 315, match: /maple syrup|jarabe de (arce|maple)|miel de maple/i },
  { id: 'molasses', role: 'sweetener', water: 0.22, gramsPerCup: 328, match: /molasses|melaza/i },
  { id: 'malt-syrup', role: 'sweetener', water: 0.20, gramsPerCup: 340, match: /malt syrup|barley malt|extracto de malta/i },
  { id: 'sugar', role: 'sweetener', water: 0.00, gramsPerCup: 200, match: /sugar|az[uú]car/i },

  // --- leavening ----------------------------------------------------------
  { id: 'starter', role: 'starter', water: 0.5, gramsPerCup: 240, match: /starter|levain|masa madre|levadura (madre|natural)|pie de masa|fermento|poolish|biga/i },
  { id: 'yeast-fresh', role: 'yeast', water: 0.70, gramsPerCup: 0, yeastKind: 'fresh', match: /fresh yeast|cake yeast|compressed yeast|levadura (fresca|prensada|de panader)/i },
  { id: 'yeast-active', role: 'yeast', water: 0, gramsPerCup: 150, yeastKind: 'active-dry', match: /active dry|levadura seca activa|levadura activa/i },
  { id: 'yeast-instant', role: 'yeast', water: 0, gramsPerCup: 150, yeastKind: 'instant', match: /instant\s+(dry\s+)?yeast|rapid.?rise|bread machine yeast|levadura instant/i },
  { id: 'yeast', role: 'yeast', water: 0, gramsPerCup: 150, yeastKind: 'instant', match: /yeast|levadura/i },

  // --- salt ---------------------------------------------------------------
  { id: 'salt-diamond', role: 'salt', water: 0, gramsPerCup: 136, match: /diamond/i },
  { id: 'salt-morton', role: 'salt', water: 0, gramsPerCup: 230, match: /morton/i },
  { id: 'salt-kosher', role: 'salt', water: 0, gramsPerCup: 230, match: /kosher/i },
  { id: 'salt-flaky', role: 'salt', water: 0, gramsPerCup: 136, match: /flak(y|e)|maldon|sal en escamas/i },
  { id: 'salt', role: 'salt', water: 0, gramsPerCup: 288, match: /\bsalt\b|\bsal\b/i },

  // --- flours (most specific first) ---------------------------------------
  { id: 'flour-whole-wheat', role: 'flour', water: 0, gramsPerCup: 113, match: /whole.?wheat|wholemeal|graham|harina integral|trigo integral/i },
  { id: 'flour-rye', role: 'flour', water: 0, gramsPerCup: 102, match: /\brye\b|centeno/i },
  { id: 'flour-spelt', role: 'flour', water: 0, gramsPerCup: 110, match: /spelt|espelta|dinkel/i },
  { id: 'flour-einkorn', role: 'flour', water: 0, gramsPerCup: 110, match: /einkorn|escanda/i },
  { id: 'flour-emmer', role: 'flour', water: 0, gramsPerCup: 110, match: /emmer|farro|khorasan|kamut/i },
  { id: 'flour-semolina', role: 'flour', water: 0, gramsPerCup: 167, match: /semolina|s[eé]mola|durum/i },
  { id: 'flour-cornmeal', role: 'flour', water: 0, gramsPerCup: 138, match: /cornmeal|polenta|harina de ma[ií]z/i },
  { id: 'flour-bread', role: 'flour', water: 0, gramsPerCup: 127, match: /bread flour|strong flour|high.?gluten|harina (de fuerza|de gran fuerza|panadera|000|0000)/i },
  { id: 'flour-ap', role: 'flour', water: 0, gramsPerCup: 120, match: /all.?purpose|plain flour|\bap flour\b|harina (com[uú]n|todo uso|de trigo|blanca)/i },
  { id: 'flour-cake', role: 'flour', water: 0, gramsPerCup: 114, match: /cake flour|pastry flour|harina (floja|de reposter)/i },
  { id: 'flour', role: 'flour', water: 0, gramsPerCup: 120, match: /flour|harina|\bwheat\b|\btrigo\b/i },

  // --- liquids ------------------------------------------------------------
  { id: 'water', role: 'liquid', water: 1.00, gramsPerCup: 237, match: /water|\bagua\b/i },
  { id: 'beer', role: 'liquid', water: 0.92, gramsPerCup: 240, match: /\bbeer\b|\bale\b|cerveza/i },
  { id: 'juice', role: 'liquid', water: 0.88, gramsPerCup: 248, match: /juice|jugo|zumo/i },

  // --- inclusions and spices ----------------------------------------------
  { id: 'nuts', role: 'inclusion', water: 0.03, gramsPerCup: 120, match: /walnut|pecan|almond|hazelnut|pistachio|nuts?\b|nuez|nueces|almendra|avellana/i },
  { id: 'dried-fruit', role: 'inclusion', water: 0.20, gramsPerCup: 150, match: /raisin|currant|cranberr|dried (fruit|cherr|apricot)|date|fig|pasas|ar[aá]ndano|d[aá]til|higo/i },
  { id: 'seeds', role: 'inclusion', water: 0.05, gramsPerCup: 140, match: /\bseeds?\b|sesame|flax|poppy|sunflower|pumpkin seed|semilla|ajonjol[ií]|linaza|amapola/i },
  { id: 'cheese', role: 'inclusion', water: 0.40, gramsPerCup: 110, match: /cheese|queso/i },
  { id: 'cocoa', role: 'spice', water: 0.03, gramsPerCup: 85, match: /cocoa|cacao/i },
  { id: 'spice', role: 'spice', water: 0.05, gramsPerCup: 125, match: /cinnamon|cardamom|nutmeg|clove|ginger|allspice|vanilla|zest|extract|canela|cardamomo|nuez moscada|clavo|jengibre|vainilla|ralladura|esencia/i },
];

export const OTHER_CLASS: IngredientClass = { id: 'other', role: 'other', water: 0, match: /.^/ };

export function classify(name: string): IngredientClass {
  for (const c of CLASSES) if (c.match.test(name)) return c;
  return OTHER_CLASS;
}

export function roleOf(name: string): Role {
  return classify(name).role;
}

/** Water share of an ingredient; starters are handled by analyze() using hydration. */
export function waterFractionOf(name: string, role?: Role): number {
  const c = classify(name);
  if (role && c.role !== role) {
    // Caller overrode the role; fall back to a role-level default.
    switch (role) {
      case 'liquid': return 1;
      case 'dairy': return 0.87;
      case 'egg': return 0.75;
      case 'fat': return 0.16;
      case 'sweetener': return 0.1;
      default: return 0;
    }
  }
  return c.water;
}
