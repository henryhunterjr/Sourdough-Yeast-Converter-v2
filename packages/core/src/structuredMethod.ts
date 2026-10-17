/**
 * Coherent, formula-driven instructions for sectioned recipes (such as
 * Recipe Pantry print exports). The previous sentence replacement changed
 * "50g starter" into "50g yeast" and kept obsolete dough flour/water.
 *
 * Only use this path when the source contains a recognizable multi-stage
 * method. Simpler free-form methods still use the existing editor.
 */
import type { Component, Ingredient, Recipe, Step } from './model.js';
import { ROUND } from './units.js';

type Direction = 'to-yeast' | 'to-sourdough';
type Stage = 'levain' | 'prep' | 'mix' | 'salt' | 'fold' | 'bulk' | 'shape' | 'proof' | 'bake' | 'other';
const action = (text: string): Step => ({ text, changed: 'edited' });
const added = (text: string): Step => ({ text, changed: 'added' });
const g = (n: number) => String(ROUND.grams(n)) + 'g';
const label = (i: Ingredient) => g(i.grams) + ' ' + i.name;

function stageOf(raw: string): Stage | null {
  const s = raw.trim().replace(/^\d+[.)]\s*/, '').replace(/[.:]$/, '').trim().toLowerCase();
  if (/^(?:build|prepare|make|feed|refresh)\s+(?:your\s+|the\s+)?(?:levain|starter|sourdough starter)|^(?:levain|starter)\s+build$|^prepara(?:r)?\s+(?:el\s+)?(?:levain|masa madre)/i.test(s)) return 'levain';
  if (/^(?:prepare\s+)?(?:inclusions|fruit and nuts|fruit|nuts)|^(?:preparar|prepara)\s+(?:inclusiones|frutos)/i.test(s)) return 'prep';
  if (/^(?:mix|combine|make)\s+(?:the\s+|your\s+)?dough$|^mezcla(?:r)?\s+(?:la\s+)?masa$/.test(s)) return 'mix';
  if (/^(?:add|incorporate)\s+salt(?:\s+and\s+(?:develop|build)\s+strength)?$|^add\s+salt\s+and\b|^añade?\s+(?:la\s+)?sal/i.test(s)) return 'salt';
  if (/^stretch\s+and\s+folds?\b|^stretch\s*&\s*folds?\b|^coil folds\b|^pliegues\b/i.test(s)) return 'fold';
  if (/^bulk\s+fermentation$|^bulk\s+rise$|^first\s+rise$|^fermentaci[oó]n\s+en\s+bloque$/i.test(s)) return 'bulk';
  if (/^shape(?:\s+your\s+(?:loaf|bread|rolls|dough))?$|^shaping\b|^formar\b/i.test(s)) return 'shape';
  if (/^(?:cold|final|room.temperature|overnight)\s+proof(?:ing)?$|^proof\s+(?:the\s+)?(?:loaf|dough|rolls)$|^second\s+rise$|^retard\b|^fermentaci[oó]n\s+final$/i.test(s)) return 'proof';
  if (/^(?:bake\s+(?:your\s+)?(?:loaf|bread|rolls|dough)|baking|bake|into\s+the\s+oven|hornear(?:\s+el\s+pan)?)$/.test(s)) return 'bake';
  return null;
}

function grouped(steps: Step[]): { stage: Stage; steps: Step[] }[] {
  const groups: { stage: Stage; steps: Step[] }[] = [];
  let current: { stage: Stage; steps: Step[] } = { stage: 'other', steps: [] };
  for (const st of steps) {
    const kind = stageOf(st.text);
    if (kind) {
      if (current.steps.length) groups.push(current);
      current = { stage: kind, steps: [] };
    } else {
      current.steps.push(st);
    }
  }
  if (current.steps.length || groups.length === 0) groups.push(current);
  return groups;
}

const matches = (text: string, re: RegExp) => re.test(text);
function relevantIngredients(recipe: Recipe, role: string): Ingredient[] {
  return recipe.components.filter(c => c.kind === 'dough').flatMap(c => c.ingredients).filter(i => i.role === role && !i.isReference && i.grams > 0.25);
}
function joinIngredients(items: Ingredient[]): string {
  return items.map(label).join(', ');
}
function levainDescription(recipe: Recipe, language: 'en' | 'es'): string {
  const lv = recipe.components.find(c => c.kind === 'preferment');
  if (!lv) return '';
  const starter = lv.ingredients.filter(i => i.role === 'starter' && !i.isReference);
  const flour = lv.ingredients.filter(i => i.role === 'flour');
  const liquids = lv.ingredients.filter(i => i.role === 'liquid' || i.role === 'dairy');
  const total = lv.ingredients.reduce((sum, i) => sum + i.grams, 0);
  if (language === 'es') {
    return 'Prepara el levain: mezcla ' + joinIngredients(starter) + ', ' + joinIngredients(flour) + ' y ' + joinIngredients(liquids) +
      '. Cubre sin cerrar herméticamente y deja fermentar hasta que esté activo y abombado, normalmente de 8 a 12 horas a 24–26°C. Rinde unos ' + g(total) + '.';
  }
  return 'Build the levain: Mix ' + joinIngredients(starter) + ', ' + joinIngredients(flour) + ' and ' + joinIngredients(liquids) +
    '. Cover loosely and let ripen until bubbly and domed, usually 8–12 hours at 75–78°F (24–26°C). Yield: about ' + g(total) + '.';
}

function mixMethod(recipe: Recipe, direction: Direction, hasSaltStage: boolean, sourceMix: Step[], lang: 'en' | 'es'): Step[] {
  const flour = relevantIngredients(recipe, 'flour');
  const liquid = relevantIngredients(recipe, 'liquid');
  const dairy = relevantIngredients(recipe, 'dairy');
  const yeast = relevantIngredients(recipe, 'yeast');
  const salt = relevantIngredients(recipe, 'salt');
  const levain = recipe.components.filter(c => c.kind === 'dough').flatMap(c => c.ingredients).find(i => i.role === 'starter' && i.isReference);
  const extras = recipe.components.filter(c => c.kind === 'dough').flatMap(c => c.ingredients)
    .filter(i => !i.isReference && ['fat', 'egg', 'sweetener', 'spice', 'other'].includes(i.role));
  const additions = relevantIngredients(recipe, 'inclusion');
  const state = sourceMix.map(st => st.text).join(' ');
  const restMatch = state.match(/\b(?:rest|autolyse|autolysis|deja\s+reposar)\b.{0,55}?\b(\d{1,2})\s*(?:minutes?|mins?|minutos?)\b/i);
  const rest = restMatch ? Number(restMatch[1]) : (/\brest|autolyse\b/i.test(state) ? 30 : 0);
  const out: Step[] = [];

  if (lang === 'es') {
    if (direction === 'to-yeast') {
      out.push(added('Mezcla ' + joinIngredients(yeast) + ' con ' + joinIngredients([...liquid, ...dairy]) +
        '. Añade ' + joinIngredients(flour) + ' y mezcla hasta que no quede harina seca.'));
    } else {
      out.push(added('Disuelve ' + (levain ? label(levain) : 'todo el levain') + ' en ' + joinIngredients([...liquid, ...dairy]) +
        '. Agrega ' + joinIngredients(flour) + ' y mezcla hasta que no quede harina seca.'));
    }
    if (extras.length) out.push(added('Incorpora ' + joinIngredients(extras) + ' como indique la receta, sin mezclar en exceso.'));
    if (!hasSaltStage && salt.length) out.push(added('Añade ' + joinIngredients(salt) + ' y trabaja la masa hasta integrar la sal.'));
    if (rest > 0) out.push(added('Cubre y deja reposar ' + rest + ' minutos antes de seguir con los pliegues o el amasado.'));
    if (additions.length && !/\bfolds?|pliegues|inclusion/i.test(state)) out.push(added('Añade ' + joinIngredients(additions) + ' cuando la masa tenga algo de fuerza; incorpóralos suavemente.'));
    return out;
  }

  if (direction === 'to-yeast') {
    out.push(added('Mix the dough: Stir ' + joinIngredients(yeast) + ' into ' + joinIngredients([...liquid, ...dairy]) +
      '. Add ' + joinIngredients(flour) + ' and mix until no dry flour remains.'));
  } else {
    out.push(added('Mix the dough: Stir ' + (levain ? label(levain) : 'all of the levain') + ' into ' +
      joinIngredients([...liquid, ...dairy]) + '. Add ' + joinIngredients(flour) + ' and mix until no dry flour remains.'));
  }
  if (extras.length) out.push(added('Incorporate ' + joinIngredients(extras) + ' using the original recipe’s handling order. Avoid overmixing.'));
  if (!hasSaltStage && salt.length) out.push(added('Add ' + joinIngredients(salt) + ' and mix until fully incorporated.'));
  if (rest > 0) out.push(added('Cover and let the dough rest for ' + rest + ' minutes before the next strength-building step.'));
  if (additions.length && !/\bfolds?|inclusion/i.test(state)) out.push(added('After the dough develops some strength, gently fold in ' + joinIngredients(additions) + '.'));
  return out;
}

/**
 * Replace stage-level bulk/proof instructions, since yeast dosage and dough
 * temperature determine the true duration, not an arbitrary division of
 * the source recipe's clock times.
 */
function bulkMethod(direction: Direction, lang: 'en' | 'es'): Step[] {
  if (lang === 'es') return direction === 'to-yeast'
    ? [added('Fermenta la masa tapada a temperatura ambiente. Empieza a revisarla después de 60–90 minutos: debe estar más aireada, con burbujas y un aumento visible de volumen. El tiempo cambia con la temperatura y la dosis de levadura.')]
    : [added('Deja fermentar la masa madre tapada. Empieza a revisarla después de 3–4 horas, pero guíate por el aumento de volumen, las burbujas y la tensión de la masa. El tiempo depende de la temperatura y la fuerza del levain.')];
  return direction === 'to-yeast'
    ? [added('Bulk fermentation: Cover and start checking after about 60–90 minutes at room temperature. Look for a noticeably puffier dough with bubbles and roughly 50–75% more volume. Adjust by dough temperature and yeast amount, not the clock.')]
    : [added('Bulk fermentation: Cover and begin checking after roughly 3–4 hours at room temperature. Look for a domed, aerated dough with increased volume. Timing depends on temperature, flour and levain activity; watch the dough, not the clock.')];
}

function proofMethod(direction: Direction, original: Step[], lang: 'en' | 'es'): Step[] {
  const cold = original.some(st => /cold|overnight|refrigerat|fridge|nevera|fr[ií]o/i.test(st.text));
  if (lang === 'es') return direction === 'to-yeast'
    ? [added('Después de formar, cubre y deja levar a temperatura ambiente, aproximadamente 45–90 minutos hasta que la masa esté hinchada y la marca de un dedo vuelva lentamente. Para un retardo nocturno, reduce la levadura antes de comenzar y ajusta el calendario.')]
    : cold
      ? [added('Coloca la masa formada en su cesta, cubre y refrigera unas 8–14 horas. Debe llegar al horno bien fermentada, sin colapsar.')]
      : [added('Deja fermentar la masa formada hasta que se vea hinchada y la huella de un dedo vuelva lentamente. El tiempo depende de la temperatura y la actividad del levain.')];
  return direction === 'to-yeast'
    ? [added('Final proof: Cover the shaped loaf and let it rise at room temperature, about 45–90 minutes, until visibly puffy and a floured fingertip dent returns slowly. If planning an overnight cold proof, lower the yeast amount before mixing and adapt the schedule rather than using this same-day dose.')]
    : cold
      ? [added('Cold proof: Cover the shaped loaf and refrigerate for about 8–14 hours, until properly proofed. Watch its expansion and avoid letting it collapse.')]
      : [added('Final proof: Cover the shaped loaf and let it become visibly puffy; a floured fingertip dent should spring back slowly. Adjust timing for room temperature and starter activity.')];
}

function preserveSafe(st: Step, direction: Direction): Step | null {
  let text = st.text.trim();
  if (!text) return null;
  // Lines that survived parsing from source PDF may include exact obsolete
  // ingredient weights. They cannot be trusted in a different formula.
  if (/(\d+(?:[.,]\d+)?)\s*g(?:rams?)?\s+(?:yeast|levain|starter|flour|water)\b/i.test(text)) return null;
  if (direction === 'to-yeast') {
    text = text.replace(/\bLeave the loaf in the fridge until you(?:'re| are) ready to load it\.?/gi, 'Keep the shaped loaf covered while the oven heats.');
    text = text.replace(/\b(?:cold loaf|refrigerated loaf)\b/gi, 'proofed loaf');
    text = text.replace(/\b(?:cold dough|refrigerated dough)\b/gi, 'proofed dough');
    if (/\b(?:levain|sourdough starter|starter culture|feed your starter)\b/i.test(text)) return null;
  } else {
    if (/\b(?:instant yeast|active dry yeast|fresh yeast|proof the yeast)\b/i.test(text)) return null;
  }
  return { text, changed: text === st.text ? 'kept' : 'edited' };
}

/**
 * Returns null when the source isn't a sectioned method. In that case, the
 * original simple editor handles it; the UI's conversion-safety gate remains.
 */
export function composeStructuredMethod(source: Recipe, converted: Recipe, direction: Direction): Step[] | null {
  const parts = grouped(source.steps);
  const stages = new Set(parts.map(p => p.stage));
  if (!(stages.has('mix') && (stages.has('bulk') || stages.has('bake')))) return null;
  const lang = converted.language === 'es' ? 'es' : 'en';
  const out: Step[] = [];
  const seen = new Set<Stage>();
  if (direction === 'to-sourdough') out.push(added(levainDescription(converted, lang)));
  else out.push(added(lang === 'es'
    ? 'Esta versión usa levadura comercial en el amasado. No prepares ni alimentes un levain.'
    : 'This version uses commercial yeast in the dough. Do not build or feed a levain.'));

  const saltStage = stages.has('salt');
  const hasProof = stages.has('proof');
  for (const section of parts) {
    if (section.stage === 'levain') continue; // Entire source build AND its nested steps.
    if (section.stage === 'mix') {
      out.push(...mixMethod(converted, direction, saltStage, section.steps, lang));
    } else if (section.stage === 'bulk') {
      out.push(...bulkMethod(direction, lang));
    } else if (section.stage === 'proof') {
      if (!seen.has('proof')) out.push(...proofMethod(direction, section.steps, lang));
    } else if (section.stage === 'other') {
      // Exclude unattached preamble/stale PDF fragments. Recognized sections
      // supply all actionable method content.
      for (const step of section.steps) {
        if (/^(?:preheat oven|mill the grain|prepare the tangzhong)/i.test(step.text)) {
          const safe = preserveSafe(step, direction);
          if (safe) out.push(safe);
        }
      }
    } else {
      for (const step of section.steps) {
        const safe = preserveSafe(step, direction);
        if (safe) out.push(safe);
      }
      if (section.stage === 'salt' && !section.steps.some(st => /add\s+salt|sprinkle/i.test(st.text))) {
        const salt = relevantIngredients(converted, 'salt');
        if (salt.length) out.push(added((lang === 'es' ? 'Incorpora ' : 'Add ') + joinIngredients(salt) + (lang === 'es' ? ' a la masa.' : ' to the dough.')));
      }
    }
    seen.add(section.stage);
    if (section.stage === 'shape' && !hasProof) out.push(...proofMethod(direction, [], lang));
  }
  if (!seen.has('bulk')) out.splice(1, 0, ...bulkMethod(direction, lang));
  if (!seen.has('proof') && !seen.has('shape') && seen.has('bake')) {
    const at = out.findIndex(s => /\b(?:preheat|oven|bake|hornear)\b/i.test(s.text));
    out.splice(at < 0 ? out.length : at, 0, ...proofMethod(direction, [], lang));
  }
  return out.filter(s => s.text.trim().length > 0);
}
