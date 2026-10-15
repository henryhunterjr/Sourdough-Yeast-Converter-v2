# AI reader display cleanup — October 15, 2026

Local branch: `fix/reader-display-preservation`.

The repository's fetched `main` was `eb42da1c6d1f52db84ea8e40a9731c2bec99dd71`,
which already contained a first display-parity implementation. This change builds
on it. Vercel metadata and build logs independently confirmed `eb42da1` as the
READY production release (`dpl_h2ghPEezkXC6kWSqiMvTnWrvxsy3`) behind
`https://sourdough-yeast-converter-v2.vercel.app/`. The earlier Anthropic fix at
`0dd5c06` remains intact. This branch has not been merged, pushed or deployed;
no credentials were changed. The previously paused diff is also preserved in
the task workspace at `verification/paused-before-resume.patch`.

## Changes

- Empty ingredient sections stay hidden in the reader and the view. A pan-prep
  instruction stays in the method. Only notes wholly describing a uniquely named,
  originally empty section as empty/a transcription artifact are removed. Mixed
  warnings and warnings about ingredients that could not be converted survive.
- Original display lines match ingredient identity, amount and unit, preserving
  source fractions, wording and prep notes. Repeated lines are consumed separately;
  numbered method steps cannot supply ingredient display text.
- Reconstructed amounts use exact conventional fractions, allowing only floating
  point representation error. Arbitrary decimals retain their numeric spelling.
- `ReadIngredient.note` is the existing schema prep-note field. The reader passes
  it to `originalLine`, which includes it when reconstruction is necessary. When
  the source line is found, that line supplies the exact wording. `RecipeView` now
  displays `Ingredient.original.text` for grams and counts as well as volumes, so
  gram-based cinnamon-roll lines no longer hide melted/softened prep notes.
- The prompt explicitly preserves English/Spanish prep notes and keeps pan
  preparation in the method. No schema fields or conversion formulas changed.

## Validation

- Core: 27 tests passed (`npm test -w packages/core`).
- Reader: 37 tests passed (`npm test -w services/reader`).
- App: 12 server-rendered view tests passed (`npm test -w apps/web`), checking both
  original and converted recipes. Root `npm test` now includes app tests.
- Full production build passed (`npm run build`); all three workspace typechecks
  passed (`npm run typecheck`). `git diff --check` passed. This
  repository has no configured lint command or lint configuration.
- Independent, hand-authored model-shaped fixtures cover the actual Everyday
  Sandwich Loaf, Cinnamon Rolls and Spanish built-in samples. Exact ingredient
  weights, analysis values and converted weights match the parser. A separate
  local comparison against the reader implementation at `0dd5c06` confirms those
  numbers are unchanged. Core source and `providers.ts` have no diff from that
  baseline; a mock-transport regression checks Anthropic receives no temperature.
- Isolated Chrome UI checks: 3 samples × 2 paths (actual local parser API and
  deterministic model response fixture) × 2 viewport sizes (1280×960, 390×844).
  Original and converted ingredient rows match across paths; original wording is
  present, empty pan sections are absent, method pan prep remains, and no page
  errors or horizontal overflow were found. Screenshots and JSON receipts are in
  the task workspace's sibling `verification` directory.

## Live check and remaining verification

Exactly one live AI request was made to the existing production reader at
`eb42da1`, using only the public Everyday Sandwich Loaf sample. It returned HTTP
200, source `model`, provider `anthropic:claude-haiku-5-5`, six dough ingredients,
no flags or uncertainties, and no empty pan section. Original fractions,
`butter, softened`, and pan preparation in the method were preserved. All exact
weights, analysis values and converted weights matched the built-in parser.
That check exercised the deployed baseline, not this unpublished branch; it was
not repeated after local changes. No key was copied into this clone.

The local reader and app regression suites use deterministic provider fixtures,
**not additional live AI calls**. The supported interactive browser tool failed
to initialize, so local visual checks used isolated automated Chrome contexts;
the production check used the live endpoint and public deployed JavaScript.

Henry's book photo and handwritten-card tests remain pending the separately
supplied images. No real-photo test is claimed; simulated image/transcript unit
tests are fixtures too.

## Publication handoff

After Henry explicitly approves publication, push this branch and use a draft PR
for review. Merge/deploy only within that approval. After publication, verify
the production alias resolves to the approved commit and inspect the three
built-in samples on desktop and mobile, including gram-based prep notes. Keep
the separately pending photo checks labeled pending until the images arrive.
