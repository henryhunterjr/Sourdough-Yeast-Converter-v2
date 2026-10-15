# Audit of the old converter (Oct 15, 2026)

`old-app-probe.test.ts` is the probe that was run against the original app
(henryhunterjr/sourdough-yeast-converter, commit 2081694) to produce the
numbers in the audit. It imports that app's modules, so it only runs inside
that repo; it is kept here as evidence, not as a test of this engine.

The full audit and rebuild plan is the doc "Sourdough-Yeast Converter: Audit
and Rebuild Plan" in Henry's Claude artifacts.
