# Actual PDF fixtures

Local copies of Henry's sources, retained for upload regression checks:

| Fixture | Original filename | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `einkorn-table.pdf` | `Einkorn_Spelt_Cinnamon_Rolls_BGB_YeastToSourdough.pdf` | 11,538 | `172cc7fff2d4b31b789422e3ccba4628e83bd83a9e46bc5cbcc77cb99cad414d` |
| `cranberry-one-sheet.pdf` | `cranberry-orange-loaf-yeasted-one-sheet-high.pdf` | 3,678,777 | `0fe72883acd63938bc37add912a717a9605b423c83c4df7725c466a571efe836` |
| `pantry-print.pdf` | `Einkorn & Spelt Cinnamon Rolls _ Baking Great Bread - Print Version _ Recipe Pantry.pdf` | 626,188 | `28b11113d511d4a7f25fe7d07d8d7c9b49947aa158e935a5d4db5f32afe93704` |

The first two correspond to the actual supplied PDF attachments, found in
Henry's local Recipe Pantry folder with matching names and byte sizes. The third
is the authored Pantry print of the original cinnamon-roll recipe.

`cranberry-model.json` is a **manual deterministic vision-response fixture**.
Its ingredient values were specified from the inspected raster PDF. Its method
was read from the matching local Pantry one-sheet HTML and compared against the
rendered PDF, retaining authored step boundaries. It is not an actual AI output.

Actual extracted text and matching one-sheet HTML text are under
`packages/core/test/fixtures/pantry-pdf`. These fixtures are test inputs, not
public web assets. Source contradictions are preserved, not silently repaired.
