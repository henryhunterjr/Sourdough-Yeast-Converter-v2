# Sourdough ↔ Yeast Converter

Convert any bread recipe between commercial yeast and sourdough, with the math done in code and checked by tests.

Baking Great Bread at Home · Crust & Crumb Academy · Henry Hunter Jr.

## Layout

- `packages/core` — the conversion engine (TypeScript, no dependencies, 23 tests). Start here.
- `apps/web` — the mobile-first web app. Not started yet (Phase 3).
- `services/reader` — the AI text reader that outputs the engine's recipe shape. Not started yet (Phase 2).

## Run the engine tests

```
cd packages/core
npm install
npm test
```

See `packages/core/README.md` for the model, the API and the rules the math follows.

## Running it

```
npm install
npm run dev        # builds the engine and reader, then serves the app with /api routes
npm test           # engine + reader tests
npm run build      # production build to apps/web/dist
```

Set `ANTHROPIC_API_KEY` in the environment (or in Vercel project settings) to turn on the AI reader. Without it the app runs on the built-in parser and says so on screen.

## Deploying

The repo is set up for Vercel: `vercel.json` builds the whole workspace and serves `apps/web/dist`, with `api/read.ts` and `api/convert.ts` as edge functions wrapping `services/reader`. Point a Vercel project at the repo root and add the API key.
