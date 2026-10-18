import type { Recipe } from '@bgb/dough-core';
import type { Strings } from '../i18n';

// This identifies when to show handling guidance. It never changes the formula.
// Ancient grains, rye and fresh-milled flour change handling at any amount.
const GRAIN = /\b(?:einkorn|spelt|dinkel|emmer|farro|khorasan|kamut|rye|centeno|espelta|escanda|ancient[ -]grains?|fresh(?:ly)?[ -]?(?:milled|ground))\b|granos?\s+antiguos?|reci[eé]n\s+molid[ao]s?/i;
// Whole wheat only changes handling once it's a real share of the flour. A
// country loaf with 10% whole wheat bakes like white bread.
const WHOLE_WHEAT = /\bwhole[ -]?(?:wheat|grain)\b|\bintegral(?:es)?\b/i;
export const WHOLE_WHEAT_NOTICE_SHARE = 0.25;

export function needsGrainGuidance(recipe: Recipe): boolean {
  const flours = recipe.components.flatMap(c => c.ingredients).filter(i => i.role === 'flour' || i.role === 'starter');
  const label = (i: typeof flours[number]) => `${i.name} ${i.original?.text ?? ''}`;
  if (flours.some(i => GRAIN.test(label(i)))) return true;
  const total = flours.reduce((sum, i) => sum + i.grams, 0);
  const wholeWheat = flours.filter(i => WHOLE_WHEAT.test(label(i))).reduce((sum, i) => sum + i.grams, 0);
  return total > 0 && wholeWheat / total >= WHOLE_WHEAT_NOTICE_SHARE;
}

export function adaptationText(original: Recipe, s: Strings): string {
  const parts: string[] = [s.adaptationTitle, s.adaptationHint, s.authoredAlternate];
  if (needsGrainGuidance(original)) {
    parts.push(s.grainTitle, s.grainHint);
    if (original.steps.length) parts.push(s.originalHandling, s.originalHandlingHint, ...original.steps.map((step, i) => `${i + 1}. ${step.text}`));
    else parts.push(s.grainNoMethod);
  }
  return parts.join('\n\n');
}

export function AdaptationNotice({ original, s }: { original: Recipe; s: Strings }) {
  return <aside className="adaptation-notice" aria-label={s.adaptationTitle}>
    <h3>{s.adaptationTitle}</h3>
    <p>{s.adaptationHint}</p>
    <p>{s.authoredAlternate}</p>
    {needsGrainGuidance(original) && <div className="grain-notice">
      <h3>{s.grainTitle}</h3>
      <p>{s.grainHint}</p>
      {original.steps.length ? <section className="original-handling">
        <h4>{s.originalHandling}</h4>
        <p>{s.originalHandlingHint}</p>
        <ol className="steps">{original.steps.map((step, i) => <li key={i}>{step.text}</li>)}</ol>
      </section> : <p>{s.grainNoMethod}</p>}
    </div>}
  </aside>;
}
