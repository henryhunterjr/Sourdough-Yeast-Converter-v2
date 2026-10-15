# Pantry PDF and navigation fix

Prepared locally on `fix/pantry-pdf-navigation`, based on published release
`94bfabc5d8cd18c3fe171e550b80526f67a1c158`. This update is not pushed or deployed.
Credentials, access settings, conversion formulas and the Anthropic temperature
fix remain unchanged.

## Reproduced sources

Both supplied PDFs were found locally with matching names and upload byte sizes,
rendered with Poppler and inspected. Supported Library reads of all four supplied
attachments returned PDF content and screenshot descriptions/pointers; screenshot
pixels were unavailable. The failed Library transfer path was not retried.

| Source | Before | After |
| --- | --- | --- |
| Older cinnamon-roll converter export, 4 text pages | 6 ingredients, 23 parse warnings, 3 merged method chunks | All 22 printed ingredient lines, 8 method steps; subtotal/percentages excluded; source conflict flagged |
| Authored Pantry cinnamon-roll print, 8 text pages | 23 counted lines including non-recipe content; page furniture mixed into method | 22 actual ingredients in Tangzhong, Dough, Filling, Frosting and Pan; 29 method entries; notes retained separately |
| Supplied cranberry yeasted one-sheet, 5 raster pages | Only 4 page images sent | All 5 page images sent; deterministic vision-response fixture validates 13 ingredients and 14 authored method entries |

The older converted PDF has a 169g preferment build but references 192g in the
dough. It already groups filling and frosting under Dough. The fix retains and
flags the source quantities; it does not invent missing original sections or
repair the older export. The authored Pantry print is the clearer source.

## Implementation

- Top and persistent dock Back actions work on success/error results. Returning
  keeps recipe text, uploads and settings and restores focus to recipe entry.
- Importing a replacement PDF is explicit and transactional. Cancel or failed
  import keeps the draft. The same canceled file can be selected again. Editing
  and clearing are disabled while the import is being prepared.
- Every PDF page is included, up to 12 pages. Larger PDFs receive an explicit
  split/print-version error. Mixed or image-only documents use page images;
  selectable-text documents retain their text. Combined input is bounded below
  the hosting request limit. Image-only input still needs an AI reader.
- Recognized export cleanup handles name-first amount tables, Baker's % columns,
  secondary volume lines, variants, prep notes and broken numbering. Summary,
  equipment, nutrition, ad and footer content is excluded from ingredients.
  Separate source notes remain available without entering the dough math.
- Reader guidance describes Pantry tables and raster page slices. Source lines
  and explicit reference wording survive, including the source's inconsistency.
- The manually specified scan fixture uses the inspected PDF's ingredient
  amounts and matching local Pantry HTML, retaining its individual method steps.

## Final validation

- **95 tests passed:** 30 core, 43 reader, 22 app. Suites were run directly with
  the existing Vitest runtime after an earlier Windows/npm execution interruption.
- All three TypeScript workspace checks passed. The production build and service
  worker generation passed using the same TypeScript/Vite build steps.
- Exact baseline comparison for all three built-in samples: ingredient amounts,
  analysis and converted amounts equal the `0dd5c06` baseline.
- `convert.ts`, `analyze.ts`, `units.ts` and `providers.ts` have no changes.
- Actual PDF upload-to-result and Back workflows passed for all three PDFs at
  **360, 390, 430, 768 and 1440px**: 15 cases, no page errors or horizontal
  overflow. Checks included full page counts, source fractions/prep notes, later
  method pages, source conflict warning, keyboard focus return, canceled and
  accepted replacement, failed-import draft protection, and missing-AI recovery.
- Desktop and mobile screenshots were inspected, including readable ingredient
  and final-method viewports. Back remains available at the top and dock.
- No linter is configured; `git diff --check` passed.

The sibling task folder `verification/pdf-defects` contains before/after
captures, final test/build logs and `after/results.json`.
`verification/pdf-workflow-qa.cjs` is the browser harness.

## Limits and publication

Text PDF workflows use the real deterministic parser and HTTP handler. Raster
success uses an explicitly labeled manual vision-response fixture. **No new
live AI/OCR call was made; actual vision-model reading of the five-page PDF is
not claimed tested.** Missing-AI error/back recovery was tested separately.

This supports the inspected Pantry formats and source fixtures, not every
possible PDF. Source contradictions, illegible images and oversized documents
still require review. The offered Lovable format document was not supplied in
this execution. Real book/card photo tests remain separate pending work.

This update requires review and fresh publication approval before deployment.
