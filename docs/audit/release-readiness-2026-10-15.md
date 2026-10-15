# Converter release preparation, 15 October 2026

Prepared on `design/academy-liquid-glass`, retaining reader cleanup `956670d`
and Academy glass UI `7b3aae0`. Remote main was rechecked at `eb42da1` with no
newer work to incorporate. The Anthropic temperature fix from `0dd5c06` is intact.

## Grain guidance

- Converted results are labeled **Calculated adaptation** in English and Spanish.
  Amounts are calculated; methods and fermentation times are starting points,
  not a bake-tested recipe.
- A flour/starter wording check shows extra guidance for ancient grains, rye,
  whole grain and fresh-milled flour. This check affects display only. It makes
  no absorption, mixing-tolerance, acidity or fermentation prediction.
- Grain results show the original method alongside the adaptation, without
  rewriting it. Missing original methods get an explicit notice.
- Copy and Share retain these notices and the original grain method.
- Input and results give Henry's published alternate recipes precedence. This
  release adds no Pantry import or automatic alternate-recipe matching.

## Verified local artwork

The Library transfer helper previously failed on Windows `os.setxattr`. It was
not retried or bypassed. Matching artwork was found and visually inspected in
Henry's local Academy folders, using attachment filenames/content/dimensions
to distinguish it from an older converter design.

Unmodified local PNGs copied to `apps/web/public/brand`:

| Asset | Local source under Downloads/Crust and Crumb Academy | Dimensions | SHA-256 |
| --- | --- | --- | --- |
| Academy logo | `New transparent logo.png` (also in `Promotions`) | 1280 x 720 | `307da1f6bd903c8966c694a02cdd18247b4afb5829de3e608809ae34d40ac52d` |
| Converter thumbnail | `Promotions/ab6a9a4f-921d-44a4-842a-28cbb75795a0.png` | 1536 x 1024 | `be6beb80a348c4ef569811f4e01809a49e9ef16e6a039562ad7d8236ad0ebc48` |

The thumbnail is the supplied design with the **Try Any Recipe** badge, colored
arrows and tagged starter jar. The older `sourdough Yeast converter.png` was
excluded. Library upload sizes differ from local source sizes; no claim is made
that the local PNG encoding is byte-identical to the uploaded Library version.

The seal is visible in the header. Canonical, Open Graph and Twitter large-image
metadata use the production URL and the converter thumbnail, with PNG type,
actual dimensions and descriptive alternative text.

## Verification

- `npm test`: **86 passed** (27 core, 37 reader, 22 app).
- `npm run typecheck`: all workspaces passed.
- `npm run build`: passed, including service worker generation.
- No lint command/configuration exists. `git diff --check` passed.
- Conversion core and `services/reader/src/providers.ts` have no diff against
  `0dd5c06`. Exact fixture comparison also matched ingredient amounts, analysis
  and converted amounts for the three built-in samples against that baseline.
- Isolated local Chrome at 360, 390, 430, 768 and 1440 px: original and converted
  recipes, fractions/prep notes, English/Spanish, warnings, reading/error states,
  dialog keyboard containment/Escape/return, attachment removal, no page errors
  and no horizontal overflow.
- Built-output checks at all five widths: visible loaded logo, grain guidance,
  original-method preservation, copied guidance, original-tab behavior.
- Facebook-crawler user agent: local home and both images returned 200; images
  were `image/png`, byte-identical to the committed source PNGs. Production
  responses must be checked separately after deployment.

Harnesses, logs, screenshots and JSON evidence live in the sibling task
`verification` folder (`design-qa.cjs`, `release-qa.cjs`, `release-local`).

These regression/browser runs use deterministic model/parser fixtures, not new
paid AI calls. The earlier production sandwich-loaf AI call is documented in
the reader audit. Henry's real book/card photo tests remain pending. Facebook's
own debugger cache has not been refreshed or visually inspected.

Publication approval was supplied separately. This preparation report does not
assert a completed production deployment; post-deployment evidence is separate.
