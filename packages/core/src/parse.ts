/**
 * Text reader: pasted recipe text -> Recipe.
 *
 * This is the deterministic fallback and the shape the AI reader must match.
 * It keeps sections, never collapses lines, and splits the method on the same
 * string it parsed, so English and Spanish behave the same.
 */
import type { Component, ComponentKind, Ingredient, Recipe, Step } from './model.js';
import { classify, OTHER_CLASS } from './ingredients.js';
import { parseAmount, toGrams } from './units.js';

export interface ParseIssue { line: string; reason: string }

export interface ParseResult {
  recipe: Recipe;
  issues: ParseIssue[];
}

const METHOD_HEADING = /^\s*(instructions?|directions?|method|steps|preparation|procedure|how to make|instrucciones|m[eé]todo|pasos|preparaci[oó]n|elaboraci[oó]n|procedimiento)\s*:?\s*$/i;
const INGREDIENT_HEADING = /^\s*(ingredients?|ingredientes)\s*:?\s*$/i;
const METADATA = /^\s*(prep|cook|bake|total|rise|rest|yield|servings?|makes|serves|time|temperature|category|cuisine|difficulty|calories|author|by|tiempo|porciones?|rinde|rendimiento|dificultad|autor)\b[^a-z]*[:\d]/i;
const REFERENCE = /\b(all of the|all the|the) (levain|preferment|poolish|biga|starter)\b|\(from above\)|from step|levain from|todo el (levain|prefermento)|de arriba|del paso/i;
const OPTIONAL = /\boptional\b|\bopcional\b/i;
/** A bare section word is a heading even on the first line; "Pan de masa madre" is a title. */
const SECTION_WORD = /^(levain|starter|preferment|pre-ferment|poolish|biga|sponge|tangzhong|yudane|soaker|dough|main dough|final dough|filling|frosting|icing|glaze|topping|egg wash|pan|for the pan|masa|masa madre|prefermento|relleno|cobertura|glaseado|bet[uú]n|molde)( build| section)?\s*:?\s*$/i;

const KIND_RULES: Array<[RegExp, ComponentKind]> = [
  [/tangzhong|yudane|roux|water roux|milk roux|escaldado/i, 'tangzhong'],
  [/soaker|soak|remojo|remojado/i, 'soaker'],
  [/levain|preferment|pre-ferment|poolish|biga|sponge|starter build|build the starter|prefermento|masa madre|fermento|pie de masa/i, 'preferment'],
  [/filling|relleno/i, 'filling'],
  [/frosting|icing|glaze|drizzle|syrup|glaseado|cobertura|bet[uú]n|almíbar|almibar|baño/i, 'glaze'],
  [/topping|egg wash|wash|streusel|crumble|crumb topping|finish|garnish|sprinkle|para decorar|barniz|decoraci[oó]n|cubierta/i, 'topping'],
  [/for the pan|greasing|^pan$|molde|engrasar/i, 'other'],
  [/dough|main dough|final dough|bread|masa|masa final|masa principal/i, 'dough'],
];

function kindFor(heading: string, isFirst: boolean): ComponentKind {
  for (const [re, kind] of KIND_RULES) if (re.test(heading)) return kind;
  return isFirst ? 'dough' : 'other';
}

/** A short line with no leading amount is a section heading. */
function looksLikeHeading(line: string): boolean {
  const s = line.trim().replace(/[:：]$/, '');
  if (!s || s.length > 48) return false;
  if (/^\d/.test(s) || /^[½⅓⅔¼¾⅛]/.test(s)) return false;
  if (/\d+\s*(g|ml|cups?|tbsp|tsp|oz)\b/i.test(s)) return false;
  return /^[A-Za-zÁÉÍÓÚÑáéíóúñ&'() ,./-]+$/.test(s);
}

export function detectLanguage(text: string): 'en' | 'es' {
  const es = (text.match(/\b(harina|agua|sal|levadura|masa madre|huevo|az[uú]car|mantequilla|leche|hornear|amasar|cucharad|taza|gramos|minutos|horas)\b/gi) ?? []).length;
  const en = (text.match(/\b(flour|water|salt|yeast|starter|egg|sugar|butter|milk|bake|knead|tablespoon|teaspoon|cup|grams|minutes|hours)\b/gi) ?? []).length;
  return es > en ? 'es' : 'en';
}

export function parseRecipeText(text: string, starterHydration = 100): ParseResult {
  const issues: ParseIssue[] = [];
  const language = detectLanguage(text);
  const rawLines = text.replace(/\r/g, '').split('\n');

  // Find where the method starts, on this same array of lines.
  let methodStart = rawLines.findIndex(l => METHOD_HEADING.test(l));
  let headingLines = 1;
  if (methodStart === -1) {
    // Fallback: first numbered line that isn't an ingredient and is a sentence. It is a step, not a heading, so keep it.
    methodStart = rawLines.findIndex(l => /^\s*(\d+[.)]|step \d+)\s+/i.test(l) && l.trim().length > 35 && !parseAmount(l.replace(/^\s*(\d+[.)]|step \d+)\s+/i, '')));
    headingLines = 0;
  }
  const ingredientLines = methodStart === -1 ? rawLines : rawLines.slice(0, methodStart);
  const methodLines = methodStart === -1 ? [] : rawLines.slice(methodStart + headingLines);

  const components: Component[] = [];
  let current: Component | null = null;
  let title: string | undefined;

  const ensureComponent = (): Component => {
    if (!current) {
      current = { kind: 'dough', name: language === 'es' ? 'Masa' : 'Dough', ingredients: [] };
      components.push(current);
    }
    return current;
  };

  for (const raw of ingredientLines) {
    const line = raw.trim();
    if (!line) continue;
    if (INGREDIENT_HEADING.test(line)) continue;
    if (METADATA.test(line)) continue;

    // "optional: 50g raisins" -> read the amount, keep the note.
    const stripped = line.replace(/^(optional|opcional)\s*[:\-]\s*/i, '');
    let parsed = parseAmount(stripped);
    // "Pinch of salt", "una pizca de sal", "zest of 1 lemon": small amounts with no number.
    if (!parsed) {
      const pinch = stripped.match(/^(?:a |una |un )?(pinch|pizca)\s+(?:of|de)\s+(.+)$/i);
      if (pinch) parsed = { amount: 0.3, unit: 'g', name: pinch[2]!.trim(), text: line };
      else if (/\b(to taste|al gusto)\b/i.test(stripped)) { issues.push({ line, reason: 'No amount given ("to taste"); left out of the math.' }); continue; }
    }
    if (!parsed && REFERENCE.test(line)) {
      const built = components.filter(c => c.kind === 'preferment').flatMap(c => c.ingredients).reduce((s, i) => s + i.grams, 0);
      ensureComponent().ingredients.push({ name: line.replace(/[:：]$/, ''), grams: built, role: 'starter', isReference: true });
      continue;
    }
    if (!parsed) {
      // A heading is a short line that names a section, or names no ingredient at all.
      // "Pinch of salt" names an ingredient and matches no section word, so it is not one.
      const isFirst = !title && components.length === 0;
      const namesSection = SECTION_WORD.test(line) || KIND_RULES.some(([re]) => re.test(line));
      if (looksLikeHeading(line) && (isFirst || namesSection || classify(line) === OTHER_CLASS)) {
        if (!title && components.length === 0 && !/:$/.test(line) && !SECTION_WORD.test(line)) { title = line; continue; }
        current = { kind: kindFor(line, components.length === 0), name: line.replace(/[:：]$/, '').trim(), ingredients: [] };
        components.push(current);
        continue;
      }
      if (/\d/.test(line) || classify(line) !== OTHER_CLASS) issues.push({ line, reason: 'Could not read an amount from this line.' });
      continue;
    }

    const cls = classify(parsed.name);
    const grams = toGrams(parsed);
    if (!grams) {
      issues.push({ line, reason: `No way to convert "${parsed.amount} ${parsed.unit}" of ${parsed.name} to grams. Enter it in grams.` });
      continue;
    }
    const ing: Ingredient = {
      name: parsed.name,
      grams: grams.grams,
      role: cls.role,
      original: { amount: parsed.amount, unit: parsed.unit, text: parsed.text },
    };
    if (cls.yeastKind) ing.yeastKind = cls.yeastKind;
    if (REFERENCE.test(line)) { ing.role = 'starter'; ing.isReference = true; }
    if (OPTIONAL.test(line)) issues.push({ line, reason: 'Marked optional in the recipe; included in the math.' });
    // Egg wash and brushing liquids go on the dough, not in it.
    if (/\bfor (the )?(egg )?wash\b|\bfor brushing\b|\bpara (pintar|barnizar)\b|egg wash/i.test(line)) {
      let wash = components.find(c => c.kind === 'topping');
      if (!wash) { wash = { kind: 'topping', name: language === 'es' ? 'Para pintar' : 'Egg wash', ingredients: [] }; components.push(wash); }
      wash.ingredients.push(ing);
      continue;
    }
    ensureComponent().ingredients.push(ing);
  }

  // A heading-only "Levain" section whose dough lists "all of the levain" is fine.
  // A recipe with no dough component but one preferment: treat the preferment as dough.
  if (!components.some(c => c.kind === 'dough')) {
    const first = components.find(c => c.ingredients.length > 0);
    if (first) first.kind = 'dough';
  }

  const steps: Step[] = [];
  let buffer = '';
  for (const raw of methodLines) {
    const line = raw.trim();
    if (!line) { if (buffer) { steps.push({ text: buffer }); buffer = ''; } continue; }
    const numbered = /^(\d+[.)]|step \d+[.:]?|paso \d+[.:]?)\s+/i.test(line);
    if (numbered && buffer) { steps.push({ text: buffer }); buffer = ''; }
    buffer = (buffer ? buffer + ' ' : '') + line.replace(/^(\d+[.)]|step \d+[.:]?|paso \d+[.:]?)\s+/i, '');
  }
  if (buffer) steps.push({ text: buffer });

  const recipe: Recipe = { title, components, steps, starterHydration, language };
  return { recipe, issues };
}
