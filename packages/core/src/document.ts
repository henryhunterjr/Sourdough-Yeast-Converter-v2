/** Clean recognized recipe exports, without changing ingredient quantities. */
export function recipeDocument(text: string): { text: string; sourceNotes: string[] } {
  const exportHeader = /recipepantry\.app|Recipe Pantry|Recipe Summary|Converted by Baking Great Bread|Ingredient\s+Amount\s+Baker['’]s\s*%/i.test(text);
  const variantSection = /^(?:dough|masa)\s*\((?:yeasted|sourdough|con levadura|masa madre)\s*(?:version|versión)?\)\s*:?\s*$/im.test(text);
  if (!exportHeader && !variantSection) return { text, sourceNotes: [] };
  const lines = text.replace(/\r|\f/g, '\n').split('\n').map(l => l.trim());
  const start = lines.findIndex(l => /^(ingredients?|ingredientes)\s*:?$/i.test(l));
  const firstSection = lines.findIndex(l => /^(dough|masa)\s*\((?:yeasted|sourdough|con levadura|masa madre)\s*(?:version|versión)?\)\s*:?$/i.test(l));
  const begin = start >= 0 ? start : firstSection;
  if (begin < 0) return { text, sourceNotes: [] };
  const footer = (l: string) => /^https?:\/\/|^(?:recipepantry\.app|pantry\.bakinggreatbread\.com)\/|^\d+\s*\/\s*\d+$|^\d{1,2}\/\d{1,2}\/\d{2,4},|^(?:©|copyright|c\s+20\d{2})|^Baked with|^Recipe by Henry|^by\s+Henry/i.test(l);
  const title = lines.slice(0, begin).find(l => l && !footer(l) && !/^(Print This|Recipe Pantry|Crust & Crumb Academy|Baking Great Bread|FROM THE PANTRY|Converted by|Recipe Summary)/i.test(l));
  const out = title ? [title.replace(/\s*\|\s*(?:Baking Great Bread.*)?$/, ''), 'Ingredients'] : ['Ingredients'];
  const notes: string[] = [];
  let mode: 'ingredients' | 'method' | 'notes' | 'skip' = 'ingredients';
  let table = false;
  for (let n = begin + (start >= 0 ? 1 : 0); n < lines.length; n++) {
    let line = lines[n]!;
    if (!line || footer(line)) continue;
    if (/^(?:instructions?|method|directions?|método|instrucciones)\s*:?$/i.test(line)) { mode = 'method'; out.push('', 'Method'); continue; }
    if (/^(?:equipment|nutrition(?:al information| facts)?|baker['’]s percentages|recipe summary|questions|faq|storage|substitutions|baker['’]s notes)\s*:?$/i.test(line)) {
      mode = /^(equipment|nutrition|baker['’]s percentages|recipe summary)/i.test(line) ? 'skip' : 'notes';
      if (mode === 'notes') notes.push(line);
      continue;
    }
    if (/^(?:ProveWorth|Certified|Accurate\s+Fast)/i.test(line)) { mode = 'skip'; continue; }
    if (/^(?:Recipe Pantry|Crust & Crumb Academy)/i.test(line)) continue;
    if (mode === 'skip') continue;
    if (mode === 'notes') { notes.push(line); continue; }
    if (mode === 'ingredients') {
      if (/^Ingredient\s+Amount\s+Baker['’]s\s*%$/i.test(line)) { table = true; continue; }
      if (/\b(?:subtotal|total flour|total water|total hydration)\b/i.test(line) || /^Note:/i.test(line) || /^in baker['’]s formulas/i.test(line)) continue;
      if (table) line = line.replace(/\s+\d+(?:[.,]\d+)?\s*%\s*$/, '');
      if (/^[A-Z][A-Z &'()-]{2,45}$/.test(line)) line += ':';
      if (/^\d+(?:[.,]\d+)?\s*(?:g|grams?|ml)\s*$/i.test(line) && lines[n + 1] && !/^\d|^method$|^instructions?$/i.test(lines[n + 1]!)) line += ` ${lines[++n]}`;
      // Keep the volume wording under a metric row without counting a second ingredient.
      if (/^[\d¼⅓½⅔¾][\d\s/.,¼⅓½⅔¾]*(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?)(?:\s*\+\s*[\d\s/.,]+(?:cups?|tbsps?|tsps?))?$/i.test(line) && /^\d+(?:[.,]\d+)?\s*(?:g|ml)\b/i.test(out.at(-1) ?? '')) {
        out[out.length - 1] += ` (${line})`; continue;
      }
      out.push(line);
    } else {
      if (/^\d+$/.test(line) && lines[n + 1]) line += `. ${lines[++n]}`;
      // PDF badges and list markers may be separate text items: "1  1." or "1 .".
      line = line.replace(/^\d+\s+(\d+[.)])\s*/, '$1 ').replace(/^(\d+)\s+\.\s*/, '$1. ');
      out.push(line);
    }
  }
  return { text: out.join('\n'), sourceNotes: notes.length ? [notes.join('\n')] : [] };
}
