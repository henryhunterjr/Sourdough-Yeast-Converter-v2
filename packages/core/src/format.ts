/** Plain-text rendering, used by tests and as a reference for the UI. */
import { analyze } from './analyze.js';
import type { Recipe } from './model.js';
import { ROUND } from './units.js';

export function renderRecipe(recipe: Recipe): string {
  const a = analyze(recipe);
  const lines: string[] = [];
  if (recipe.title) lines.push(recipe.title, '');
  for (const c of recipe.components) {
    lines.push(c.name);
    for (const i of c.ingredients) lines.push(`  ${String(ROUND.grams(i.grams)).padStart(6)}g  ${i.name}${i.isReference ? ' (ref)' : ''}`);
    lines.push('');
  }
  const es = recipe.language === 'es';
  const richness = es ? { lean: 'magra', enriched: 'enriquecida', sweet: 'dulce' }[a.richness] : a.richness;
  const leavening = es ? { sourdough: 'masa madre', yeast: 'levadura', both: 'mixta', none: 'sin leudante' }[a.leavening] : a.leavening;
  lines.push(
    es
      ? `Harina total ${ROUND.grams(a.totalFlour)}g · agua ${ROUND.grams(a.totalWater)}g · hidratación ${ROUND.pct(a.hydration)}% · harina prefermentada ${ROUND.pct(a.prefermentedFlourPct)}% · sal ${ROUND.pct(a.saltPct)}% · azúcar ${ROUND.pct(a.sugarPct)}% · grasa ${ROUND.pct(a.fatPct)}% · ${richness} · ${leavening}`
      : `Total flour ${ROUND.grams(a.totalFlour)}g · water ${ROUND.grams(a.totalWater)}g · hydration ${ROUND.pct(a.hydration)}% · prefermented flour ${ROUND.pct(a.prefermentedFlourPct)}% · salt ${ROUND.pct(a.saltPct)}% · sugar ${ROUND.pct(a.sugarPct)}% · fat ${ROUND.pct(a.fatPct)}% · ${richness} · ${leavening}`,
    '',
  );
  recipe.steps.forEach((s, n) => lines.push(`${n + 1}. ${s.text}${s.changed && s.changed !== 'kept' ? `  [${s.changed}]` : ''}`));
  if (recipe.sourceNotes?.length) lines.push('', es ? 'Notas de la fuente' : 'Source notes', ...recipe.sourceNotes);
  return lines.join('\n');
}
