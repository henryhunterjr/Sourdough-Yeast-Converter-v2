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
