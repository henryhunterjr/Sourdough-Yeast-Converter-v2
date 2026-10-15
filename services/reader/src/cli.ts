/**
 * Try the reader from a terminal:
 *   ANTHROPIC_API_KEY=... npm run try -- path/to/recipe.txt [to-sourdough|to-yeast] [starterHydration]
 */
import { readFileSync } from 'node:fs';
import { analyze, convertToSourdough, convertToYeast, renderRecipe } from '@bgb/dough-core';
import { readRecipe } from './reader.js';
import { providerFromEnv } from './providers.js';

const [file, direction, hyd] = process.argv.slice(2);
if (!file) { console.error('usage: npm run try -- recipe.txt [to-sourdough|to-yeast] [starterHydration]'); process.exit(1); }

const text = readFileSync(file, 'utf8');
const provider = providerFromEnv();
console.log(`reader: ${provider?.name ?? 'none (built-in parser)'}`);

const result = await readRecipe(text, provider, { starterHydration: hyd ? Number(hyd) : 100 });
console.log(`source: ${result.source}`);
for (const f of result.flags) console.log(`  [${f.level}] ${f.message}`);
for (const u of result.uncertainties) console.log(`  [model] ${u}`);
console.log('\n' + renderRecipe(result.recipe));

if (direction) {
  const conv = direction === 'to-yeast' ? convertToYeast(result.recipe) : convertToSourdough(result.recipe);
  console.log('\n==== converted ====\n');
  for (const n of conv.notes) console.log(`  [${n.level}] ${n.message}`);
  console.log(renderRecipe(conv.recipe));
  console.log(JSON.stringify(analyze(conv.recipe), null, 0));
}
