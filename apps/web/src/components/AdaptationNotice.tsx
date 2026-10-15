import type { Recipe } from '@bgb/dough-core';
import type { Strings } from '../i18n';

// This identifies when to show handling guidance. It never changes the formula.
const GRAIN = /\b(?:einkorn|spelt|dinkel|emmer|farro|khorasan|kamut|rye|centeno|espelta|escanda|ancient[ -]grains?|whole[ -]?(?:wheat|grain)|fresh(?:ly)?[ -]?(?:milled|ground))\b|\bintegral(?:es)?\b|granos?\s+antiguos?|reci[eé]n\s+molid[ao]s?/i;

export function needsGrainGuidance(recipe: Recipe): boolean {
  return recipe.components.some(c => c.ingredients.some(i =>
    (i.role === 'flour' || i.role === 'starter') && GRAIN.test(`${i.name} ${i.original?.text ?? ''}`)));
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
