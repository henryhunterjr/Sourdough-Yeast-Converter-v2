# Academy glass preview

This UI branch is based on reader cleanup commit
`956670d0656c02c6cae390fa6103d0f7c30fa71a`. Reader services, conversion core,
credentials, parser/AI routes and numerical behavior are unchanged.

## Design

- Warm oat, sage and cocoa palette, with translucent navigation and floating
  controls. Glass is restrained; ingredient text sits on an almost opaque paper
  surface so quantities and warnings remain readable.
- Self-hosted Instrument Serif headings and DM Sans controls/body, with bundled
  SIL Open Font Licenses. Font files total approximately 58 KB.
- Desktop recipe entry sits beside the introduction; phones get a single-column
  flow. The persistent action dock keeps conversion, options, copy and share close.
- Large tabular ingredient quantities, original source lines, clear result tabs,
  and differentiated warning/error surfaces preserve the reader cleanup.
- Visible focus, a skip link, 44px control targets, reduced-motion support,
  high-contrast/opaque fallbacks, and a native modal options sheet with keyboard
  containment, Escape dismissal and focus return.
- The no-readable-result state now has a return action that preserves entered
  text/images. The Spanish screen's “Try in English” sample now loads English.

## Preview

On Henry's connected Windows computer: `http://127.0.0.1:4187/`.
The task's `verification/design` folder contains screenshots, logs and results.
This is a local preview, not a Vercel deployment. Without an AI key in the local
environment, ordinary preview requests use the explicitly labeled parser path.

## Validation

- Full 76-test suite: 27 core, 37 reader, 12 app tests passed.
- All three workspace typechecks and the production build passed.
- No lint command/configuration exists; `git diff --check` is the whitespace check.
- Automated isolated Chrome checks at 360, 390, 430, 768 and 1440px: empty entry,
  reading, no-readable-result, warnings, original/converted output, options, and
  Spanish states. These verify source wording, overflow, keyboard containment,
  Escape, focus return, error recovery and English/Spanish sample behavior.
- The three built-in samples retain their exact ingredient numbers and original
  fractions/prep notes. Existing independent provider fixtures are used for UI
  state checks; they do not make paid AI calls. Attachment controls use only the
  existing app icon as a synthetic UI fixture, not a real recipe photo.
- The earlier real live sandwich AI request was against deployed `eb42da1`, not
  this unpublished redesign. No further paid model calls were made.

## Supplied PNG blocker

The two supplied Library IDs are recorded here for handoff:

- `libfile_37c42e7fa8bc8191aeea79b299c697e1`
- `libfile_925812e4ed84819186c517107c52d246`

The current supported Library transfer helper downloads bytes but fails before
installing either file because Windows Python has no `os.setxattr`. A single
bounded retry with a destination inside `apps/web/public/brand` failed the same
way. Both destination PNGs are absent. Neither image's actual pixels were viewed;
metadata/captions are not treated as visual inspection.

No replacement logo/photo was invented. The preview uses an Academy text heading
and retains the existing app icon. Supplied logo/thumbnail integration, image
cropping decisions and Open Graph image metadata remain pending. The smallest
next step is to provide readable local Windows paths for both PNGs, or restore
supported Library materialization on Windows. Once available, inspect both
images, preserve the intended thumbnail faithfully, and repeat visual QA.

No merge, push or deployment has been performed. Brand-asset integration and
Henry's visual approval are still needed before publication; book-photo and
handwritten-card recipe checks remain separate pending inputs.
