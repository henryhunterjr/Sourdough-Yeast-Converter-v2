/**
 * What the model is allowed to return. Deliberately narrow: the model reports
 * what the baker wrote, section by section. It never returns grams, totals,
 * hydration, or rewritten method text.
 *
 * Every field is required (nulls where empty) because the Anthropic structured
 * output limit counts optional fields; this schema has none.
 */

export const COMPONENT_KINDS = ['preferment', 'soaker', 'tangzhong', 'dough', 'filling', 'topping', 'glaze', 'other'] as const;
export const ROLES = ['flour', 'liquid', 'dairy', 'starter', 'yeast', 'salt', 'fat', 'egg', 'sweetener', 'inclusion', 'spice', 'other'] as const;

export interface ReadIngredient {
  /** Amount as written, as a number. "1 1/2" -> 1.5. null when the line has no amount ("pinch", "to taste"). */
  amount: number | null;
  /** Unit as written, lowercased: "cups", "tbsp", "g", "stick", "large" (for eggs), or "" when none. */
  unit: string;
  /** Ingredient name without the amount or prep notes. */
  name: string;
  /** Prep note if any: "softened", "room temperature", "divided". Empty string when none. */
  note: string;
  role: (typeof ROLES)[number];
  /** True when the line points at a preferment built elsewhere in the recipe. */
  isReference: boolean;
  /** True for egg wash, brushing, dusting, "for the pan": not part of the dough. */
  isFinishing: boolean;
}

export interface ReadComponent {
  kind: (typeof COMPONENT_KINDS)[number];
  /** Section heading as written, or "Dough" when the recipe had no headings. */
  name: string;
  ingredients: ReadIngredient[];
}

export interface ReadRecipe {
  title: string | null;
  language: 'en' | 'es';
  components: ReadComponent[];
  /** Method steps, verbatim from the text, one per step. No rewriting. */
  steps: string[];
  /** Anything the model was unsure about, one line each. */
  uncertainties: string[];
  /** For image or PDF input: the recipe text transcribed as it appears. Empty for text input. */
  transcript: string;
}

/** JSON Schema for providers that support constrained output. */
export const READ_RECIPE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'language', 'components', 'steps', 'uncertainties', 'transcript'],
  properties: {
    title: { type: ['string', 'null'] },
    language: { type: 'string', enum: ['en', 'es'] },
    components: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'name', 'ingredients'],
        properties: {
          kind: { type: 'string', enum: [...COMPONENT_KINDS] },
          name: { type: 'string' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['amount', 'unit', 'name', 'note', 'role', 'isReference', 'isFinishing'],
              properties: {
                amount: { type: ['number', 'null'] },
                unit: { type: 'string' },
                name: { type: 'string' },
                note: { type: 'string' },
                role: { type: 'string', enum: [...ROLES] },
                isReference: { type: 'boolean' },
                isFinishing: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    uncertainties: { type: 'array', items: { type: 'string' } },
    transcript: { type: 'string' },
  },
} as const;

export const SYSTEM_PROMPT = `You read bread recipes and report exactly what they say, as structured data. You are a careful transcriber, not a baker and not a writer.

Rules:
1. Keep the recipe's ingredient sections. "Tangzhong", "Levain", "Dough", "Filling", "Frosting", "Topping", "For the pan" each become one component with the right kind only when they have ingredient lines. Pan preparation in the method (such as "place in a greased 9x5 pan") stays in steps; do not invent a section or ingredient for it. A recipe with no headings has one component, kind "dough", name "Dough".
2. For each ingredient report amount, unit and name AS WRITTEN. Convert fractions to decimals ("3 1/2" -> 3.5, "¼" -> 0.25). Do NOT convert to grams. Do NOT estimate weights. Use unit "" when there is none ("2 eggs" -> amount 2, unit "", name "eggs"). "1 large egg" -> amount 1, unit "large", name "egg". Use note "" when there is no prep note.
3. When a line gives both volume and grams, such as "1 cup (120g) flour", report the grams: amount 120, unit "g".
4. role: flour (any flour or meal), liquid (water, juice, beer, coffee), dairy (milk, buttermilk, cream, yogurt), starter (sourdough starter, levain, poolish, biga), yeast, salt, fat (butter, oil, lard, cream cheese), egg (whole, yolks, whites), sweetener (sugars, honey, syrups), inclusion (nuts, fruit, seeds, chocolate, cheese), spice (cinnamon, vanilla, zest, cocoa), other.
5. isReference: true only for a line that points at a preferment made earlier in the same recipe ("all of the levain", "the levain from above", "todo el levain"). Otherwise false.
6. isFinishing: true for egg wash, brushing, dusting flour, "for the pan", sprinkling, glaze applied after baking. Otherwise false.
7. steps: copy the method steps verbatim, one string per step, in order. Do not shorten, merge, reword, or add steps. If there is no method, return an empty array.
8. language: "es" if the recipe is mostly Spanish, else "en". Keep ingredient names and prep notes in the recipe's own language. Preserve all prep notes in note, including softened, melted, room temperature, divided, ablandada, derretida, a temperatura ambiente and dividida.
9. If something is ambiguous (a smudged number, a line you cannot read, two amounts for one ingredient), make your best reading AND add one line to uncertainties saying what you were unsure about. Otherwise uncertainties is an empty array.
10. transcript: when the recipe arrives as an image or PDF, copy its text into transcript exactly as it appears, line by line, every ingredient line and every step, nothing added. When the recipe arrives as text, transcript is "".
11. If the input is not a recipe, or no ingredient amounts can be read at all, return one component with no ingredients and explain in uncertainties.
12. Return only the JSON object. No prose, no markdown fences.`;
