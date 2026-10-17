import type { Recipe } from '@bgb/dough-core';

/**
 * Fail closed on method instructions that disagree with the converted formula.
 * A numeric ingredient table can be right while the AI-transcribed method is
 * unsafe ("50g yeast", starter built in a jar, or old flour/water amounts).
 */
export function conversionSafety(recipe: Recipe, direction: 'to-yeast' | 'to-sourdough'): string[] {
  const issues: string[] = [];
  const dough = recipe.components.filter(c => c.kind === 'dough');
  const amounts = dough.flatMap(c => c.ingredients).filter(i => !i.isReference);
  const maxFor = (role: string) => Math.max(0, ...amounts.filter(i => i.role === role).map(i => i.grams));
  const yeast = maxFor('yeast');
  const flour = maxFor('flour');
  const liquid = maxFor('liquid');
  const add = (issue: string) => { if (!issues.includes(issue)) issues.push(issue); };

  for (const step of recipe.steps) {
    const line = step.text.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (direction === 'to-yeast') {
      if (/\b(?:build|feed|refresh)\b.{0,45}\byeast\b|\bbuild\s+(?:your\s+)?yeast\b/i.test(line))
        add('Sourdough starter-building directions were incorrectly rewritten as yeast instructions.');
      if (/\b(?:jar|doubled by morning)\b.{0,130}\byeast\b|\byeast\b.{0,130}\b(?:jar|doubled by morning)\b/i.test(line))
        add('Yeast is being treated like a sourdough starter in the method.');
      if (!/^The levain build is no longer needed\.?$/i.test(line) && /\b(?:levain|sourdough starter|masa madre)\b/i.test(line))
        add('The yeasted method still contains sourdough-specific directions.');
      for (const match of line.matchAll(/\b(\d+(?:[.,]\d+)?)\s*g(?:rams?)?\s+(?:(?:instant|active dry|fresh|dry)\s+)?yeast\b/gi)) {
        const listed = Number(match[1]!.replace(',', '.'));
        if (yeast > 0 && listed > yeast * 1.1 + 0.1)
          add(`Method says ${listed}g yeast, but the converted formula calls for ${Math.round(yeast * 10) / 10}g.`);
      }
    } else if (/\b(?:instant|active dry|fresh|dry)\s+yeast\b/i.test(line)) {
      add('The sourdough method still contains commercial yeast instructions.');
    }

    // Ignore soaking liquid and baking temperatures. Compare specific flour/water
    // mixing instructions to the largest *single* converted dough ingredient line.
    if (/\b(?:mix|add|stir|dissolve|combine|incorporate|whisk|pour)\b/i.test(line)) {
      for (const match of line.matchAll(/\b(\d+(?:[.,]\d+)?)\s*g(?:rams?)?\s+(?:bread\s+|all.purpose\s+|whole\s+wheat\s+)?flour\b/gi)) {
        const n = Number(match[1]!.replace(',', '.'));
        if (flour > 0 && n > flour * 1.08 + 0.5)
          add(`Method calls for ${n}g flour in one addition, more than the converted dough ingredient line (${Math.round(flour)}g).`);
      }
      for (const match of line.matchAll(/\b(\d+(?:[.,]\d+)?)\s*g(?:rams?)?\s+(?:warm\s+)?water\b/gi)) {
        const n = Number(match[1]!.replace(',', '.'));
        if (liquid > 0 && n > liquid * 1.08 + 0.5)
          add(`Method calls for ${n}g water in one addition, more than the converted dough ingredient line (${Math.round(liquid)}g).`);
      }
    }
  }
  return issues;
}
