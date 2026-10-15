# @bgb/recipe-reader

Turns pasted recipe text into the `@bgb/dough-core` recipe shape, then hands off to the engine for every number.

## What the AI does and does not do

The model is a **reader**, nothing more. It returns a strict JSON structure: sections, ingredient lines with the amount and unit exactly as written, a role guess, and a list of anything it was unsure about. It never produces a gram weight, a percentage, or a conversion.

Everything after that is deterministic code:

- grams come from `dough-core`'s class-based unit table
- every amount the model reports is checked against the source text; a number that is not in the text is flagged
- the model's reading is cross-checked against the built-in parser; a disagreement over 10% on any role is flagged
- if the model is down, slow, or returns something off-shape, the built-in parser takes over and the result says so

So the worst case is "the parser did it, and here are the lines to check", never "the AI invented a recipe".

## Provider

One line picks the model. `ANTHROPIC_API_KEY` is read first, then `GEMINI_API_KEY`. `READER_MODEL` overrides the default model name. No key means the built-in parser only.

```ts
import { readRecipe, anthropicProvider } from '@bgb/recipe-reader';
const provider = anthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! });
const result = await readRecipe(text, provider, { starterHydration: 100 });
```

`result.source` is `'model'` or `'parser'`; `result.flags` is what the UI must show.

## HTTP

`handler()` returns a `(Request) => Promise<Response>` that runs unchanged on Vercel, Supabase Edge, Cloudflare, or Node 18+.

```
POST /read     { text, starterHydration? }
POST /convert  { text | recipe, direction: 'to-sourdough' | 'to-yeast', starterHydration?, options? }
```

## Try it

```
cp .env.example .env   # add a key, or leave it empty to use the parser
npm install
npm run try -- ../../docs/audit/cinnamon-rolls.txt to-sourdough
npm test
```
